// Calendly webhook handler for demo booking confirmations

import type { Env } from './index';
import type { CalendlyWebhookPayload } from './types';
import { jsonResponse } from './index';
import { log } from './utils';
import { appendStudent } from './sheets';
import { sendWhatsAppMessage } from './whatsapp';

export async function handleCalendlyWebhook(request: Request, env: Env): Promise<Response> {
  if (env.TEST_MODE === 'true') {
    const body = await request.text();
    log('calendly', 'webhook', 'test', body.slice(0, 300));
    return jsonResponse({ status: 'test_mode_ok' });
  }

  const body = await request.json() as CalendlyWebhookPayload;
  const event = body.event;
  const payload = body.payload;

  log('calendly', event, 'received', payload.invitee?.name || 'Unknown');

  switch (event) {
    case 'invitee.created':
      await handleInviteeCreated(payload, env);
      break;

    case 'invitee.canceled':
      await handleInviteeCanceled(payload, env);
      break;

    default:
      log('calendly', event, 'unhandled', 'No handler for this event');
  }

  return jsonResponse({ status: 'ok' });
}

async function handleInviteeCreated(
  payload: CalendlyWebhookPayload['payload'],
  env: Env
): Promise<void> {
  const inviteeName = payload.invitee?.name || 'Unknown';
  const inviteeEmail = payload.invitee?.email || '';
  const inviteeTimezone = payload.invitee?.timezone || '';
  const startTime = payload.event?.start_time || '';
  const endTime = payload.event?.end_time || '';
  const schedulingUrl = payload.scheduling_url || '';

  // Extract student phone from Calendly questions
  const phoneQA = payload.invitee?.questions_and_answers?.find(
    (qa) => qa.question.toLowerCase().includes('phone')
  );
  const phone = phoneQA?.answer || '';

  // Extract subject from questions
  const subjectQA = payload.invitee?.questions_and_answers?.find(
    (qa) => qa.question.toLowerCase().includes('subject')
  );
  const subject = subjectQA?.answer || 'Not specified';

  log('calendly', 'demo_booked', 'ok', `${inviteeName} - ${subject} at ${startTime}`);

  // Log to Sheets
  appendStudent(env, [inviteeName, phone, inviteeEmail, subject, '', inviteeTimezone, 'demo_scheduled', '', '0', '0', startTime, `Demo: ${schedulingUrl}`]);
}

async function handleInviteeCanceled(
  payload: CalendlyWebhookPayload['payload'],
  env: Env
): Promise<void> {
  const inviteeName = payload.invitee?.name || 'Unknown';
  log('calendly', 'demo_canceled', 'ok', `${inviteeName} canceled`);
}
