// WhatsApp Business Cloud API integration
// Handles inbound messages and sends outbound replies

import type { Env } from './index';
import type { WhatsAppWebhookPayload } from './types';
import { jsonResponse, corsResponse } from './index';
import { log } from './utils';
import { appendStudent } from './sheets';

// ─── Webhook verification (GET) ────────────────────────────

export function handleWhatsAppVerify(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
    log('whatsapp', 'verify', 'ok', 'Webhook verified');
    return new Response(challenge, { status: 200 });
  }
  return jsonResponse({ error: 'Verification failed' }, 403);
}

// ─── Inbound message handler (POST) ────────────────────────

export async function handleWhatsAppWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as WhatsAppWebhookPayload;

  if (env.TEST_MODE === 'true') {
    log('whatsapp', 'webhook', 'test', JSON.stringify(body).slice(0, 500));
    return corsResponse({ status: 'test_mode_ok' });
  }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;

      // Handle inbound messages
      for (const msg of value.messages || []) {
        const from = msg.from;
        const msgType = msg.type;
        const text = msg.text?.body || '';

        log('whatsapp', 'inbound_message', 'received', `${from}: ${text.slice(0, 100)}`);

        // Route inbound message based on content
        if (text.toLowerCase().includes('hello') || text.toLowerCase().includes('hi')) {
          await sendWhatsAppMessage(env, from, 'Welcome to MostlyLearn! Reply with what subject you need help with (e.g., "Biology GCSE") or type "demo" to book a free trial class.');
        } else if (text.toLowerCase().includes('demo') || text.toLowerCase().includes('trial') || text.toLowerCase().includes('book')) {
          await sendWhatsAppMessage(env, from, `Great! Book a free demo here: https://calendly.com/mostlylearn/demo`);
        } else if (text.toLowerCase().includes('price') || text.toLowerCase().includes('cost') || text.toLowerCase().includes('fee')) {
          await sendWhatsAppMessage(env, from, 'Classes are GBP 12 each. Your first demo class is free! No subscription needed -- pay per class.');
        } else if (text.toLowerCase().includes('refer') || text.toLowerCase().includes('referral')) {
          await sendWhatsAppMessage(env, from, `Share your referral code with friends! When they book their first paid class, you get 1 free class. Your code: ML-${from.slice(-4)}`);
        } else if (text.toLowerCase().includes('teacher') || text.toLowerCase().includes('tutor')) {
          await sendWhatsAppMessage(env, from, 'Our teachers are from IIT, NIT, and medical colleges. All verified experts in their subjects. Reply with your subject to get matched!');
        } else {
          // New lead: log to Sheets and respond with booking link
          appendStudent(env, [value.contacts?.[0]?.profile?.name || 'Unknown', from, '', text, '', '', 'lead', '', '0', '0', '', '']);
          await sendWhatsAppMessage(env, from, `Thanks for your interest in MostlyLearn! Book a free demo class here: https://calendly.com/mostlylearn/demo`);
        }
      }

      // Handle message status updates (delivered, read, failed)
      for (const status of value.statuses || []) {
        log('whatsapp', 'status_update', status.status, `Message ${status.id} → ${status.status}`);
      }
    }
  }

  return corsResponse({ status: 'ok' });
}

// ─── Outbound message sender ───────────────────────────────

export async function sendWhatsAppMessage(env: Env, to: string, text: string): Promise<boolean> {
  if (env.TEST_MODE === 'true') {
    log('whatsapp', 'outbound_message', 'test', `To ${to}: ${text.slice(0, 100)}`);
    return true;
  }

  const url = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      log('whatsapp', 'send_message', 'failed', `${res.status}: ${errBody.slice(0, 200)}`);
      return false;
    }
    log('whatsapp', 'send_message', 'ok', `To ${to}: ${text.slice(0, 50)}`);
    return true;
  } catch (err) {
    log('whatsapp', 'send_message', 'error', err instanceof Error ? err.message : 'Network error');
    return false;
  }
}

// ─── Send payment link via WhatsApp ────────────────────────

export async function sendPaymentLink(env: Env, to: string, studentName: string, className: string, amount: string): Promise<boolean> {
  const paymentUrl = `https://buy.stripe.com/test_${env.STRIPE_PRICE_ID}?prefilled_email=&client_reference_id=${to}`;
  const message = `Hi ${studentName}! Your ${className} class is confirmed. Please complete payment here: ${paymentUrl}`;
  return sendWhatsAppMessage(env, to, message);
}

// ─── Send free class notification ──────────────────────────

export async function sendFreeClassNotification(env: Env, to: string): Promise<boolean> {
  const message = 'Good news! You have a free class credit. This class is on us. Your teacher has been notified.';
  return sendWhatsAppMessage(env, to, message);
}
