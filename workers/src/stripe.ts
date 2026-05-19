// Stripe webhook handler with event ID deduplication and dead-letter queue

import type { Env } from './index';
import type { StripeEvent } from './types';
import { jsonResponse } from './index';
import { log } from './utils';
import { appendClass, getReferrals, updateStudentCredits } from './sheets';
import { sendPaymentLink, sendFreeClassNotification, sendWhatsAppMessage } from './whatsapp';

// ─── Stripe webhook signature verification ─────────────────

async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const parts = signature.split(',');
  const sigMap = new Map<string, string>();
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) sigMap.set(key.trim(), value.trim());
  }
  const t = sigMap.get('t');
  const v1 = sigMap.get('v1');
  if (!t || !v1) return false;

  const signedPayload = `${t}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const expected = await crypto.subtle.sign(
    { name: 'HMAC', hash: 'SHA-256' },
    key,
    encoder.encode(signedPayload)
  );
  const expectedHex = Array.from(new Uint8Array(expected))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return expectedHex === v1;
}

// ─── Main webhook handler ──────────────────────────────────

export async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return jsonResponse({ error: 'Missing stripe-signature header' }, 401);
  }

  const rawBody = await request.text();

  if (env.TEST_MODE === 'true') {
    log('stripe', 'webhook', 'test', rawBody.slice(0, 200));
    return jsonResponse({ status: 'test_mode_ok' });
  }

  // Verify signature (skip in development)
  if (env.ENVIRONMENT !== 'development') {
    const valid = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      log('stripe', 'webhook', 'invalid_signature', 'Signature verification failed');
      return jsonResponse({ error: 'Invalid signature' }, 401);
    }
  }

  const event: StripeEvent = JSON.parse(rawBody);

  // ── Deduplication: check if event already processed ──────
  const alreadyProcessed = await env.PROCESSED_EVENTS.get(event.id);
  if (alreadyProcessed) {
    log('stripe', event.type, 'duplicate', `Event ${event.id} already processed at ${alreadyProcessed}`);
    return jsonResponse({ status: 'duplicate_ignored' });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event, env);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event, env);
        break;

      case 'charge.dispute.created':
        await handleChargeback(event, env);
        break;

      case 'checkout.session.completed':
        await handleCheckoutCompleted(event, env);
        break;

      default:
        log('stripe', event.type, 'unhandled', `No handler for ${event.type}`);
    }

    // Mark as processed in KV
    await env.PROCESSED_EVENTS.put(event.id, JSON.stringify({
      processedAt: new Date().toISOString(),
      type: event.type,
      id: event.id,
    }), { expirationTtl: 86400 * 30 });

    log('stripe', event.type, 'ok', `Event ${event.id} processed`);
    return jsonResponse({ status: 'ok' });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';

    // Dead-letter queue: store failed events for manual review
    await env.DEAD_LETTER_QUEUE.put(`failed_${event.id}`, JSON.stringify({
      event,
      error: msg,
      failedAt: new Date().toISOString(),
    }), { expirationTtl: 86400 * 7 });

    log('stripe', event.type, 'dead_letter', `Event ${event.id}: ${msg}`);
    return jsonResponse({ status: 'queued_for_retry' }, 202);
  }
}

// ─── Event handlers ────────────────────────────────────────

async function handlePaymentSucceeded(event: StripeEvent, env: Env): Promise<void> {
  const paymentIntent = event.data.object as Record<string, unknown>;
  const amount = ((paymentIntent.amount as number) / 100).toFixed(2);
  const currency = paymentIntent.currency as string;
  const customerPhone = (paymentIntent.metadata as Record<string, string> || {}).phone || 'unknown';
  const customerName = (paymentIntent.metadata as Record<string, string> || {}).name || 'Student';
  const className = (paymentIntent.metadata as Record<string, string> || {}).subject || 'Tutoring';
  const referralCode = (paymentIntent.metadata as Record<string, string> || {}).referral_code || null;

  log('stripe', 'payment_succeeded', 'ok', `${currency} ${amount} from ${customerPhone}`);

  appendClass(env, [event.id, customerName, customerPhone, '', '', className, new Date().toISOString().split('T')[0], '', '60', 'completed', 'paid', amount, referralCode || '', 'true', '']);

  // Check referral: if this is a first paid class, trigger referral credit
  if (referralCode) {
    await processReferralOnPayment(env, referralCode, customerPhone, customerName);
  }
}

async function handlePaymentFailed(event: StripeEvent, env: Env): Promise<void> {
  const paymentIntent = event.data.object as Record<string, unknown>;
  const customerPhone = (paymentIntent.metadata as Record<string, string> || {}).phone || 'unknown';
  log('stripe', 'payment_failed', 'ok', `Payment failed for ${customerPhone}`);
}

async function handleChargeback(event: StripeEvent, env: Env): Promise<void> {
  const charge = event.data.object as Record<string, unknown>;
  const amount = ((charge.amount as number) / 100).toFixed(2);
  log('stripe', 'chargeback_created', 'warning', `Chargeback for ${charge.currency} ${amount}`);

  await env.DEAD_LETTER_QUEUE.put(`chargeback_${charge.id}`, JSON.stringify({
    charge,
    receivedAt: new Date().toISOString(),
    action: 'payment_reversal_needs_review',
  }), { expirationTtl: 86400 * 30 });
}

async function handleCheckoutCompleted(event: StripeEvent, env: Env): Promise<void> {
  const session = event.data.object as Record<string, unknown>;
  const customerPhone = (session.metadata as Record<string, string> || {}).phone || '';
  const customerName = (session.metadata as Record<string, string> || {}).name || 'Student';

  if (customerPhone) {
    await sendPaymentLink(env, customerPhone, customerName, 'Tutoring', '12.00');
  }
  log('stripe', 'checkout_completed', 'ok', `Session ${session.id} completed`);
}

// ─── Referral processing on first paid class ───────────────

async function processReferralOnPayment(env: Env, referralCode: string, refereePhone: string, refereeName: string): Promise<void> {
  try {
    const referrals = await getReferrals(env);
    for (let i = 1; i < referrals.length; i++) {
      const row = referrals[i];
      if (row[4] as string === referralCode || row[4] as string === `ML-${refereePhone.slice(-4)}`) {
        const referrerType = row[2] as string;
        const referrerPhone = row[1] as string;

        markReferralCompleted(env, i + 1);
        log('referral', 'first_paid_class', 'completed', `${row[0]} referred ${refereeName}`);

        if (referrerType === 'student') {
          updateStudentCredits(env, i + 1, 1);
          await sendWhatsAppMessage(env, referrerPhone, 'Your referral just completed their first paid class! You have earned 1 free class credit.');
        } else if (referrerType === 'teacher') {
          log('referral', 'teacher_bonus', 'pending', `${referrerPhone} earned INR 500`);
        }
        break;
      }
    }
  } catch (err) {
    log('referral', 'process_on_payment', 'error', err instanceof Error ? err.message : 'Failed');
  }
}

// Referral completion marker uses sheets.ts enqueueWrite
// This is handled inline by the processReferralOnPayment function above.
