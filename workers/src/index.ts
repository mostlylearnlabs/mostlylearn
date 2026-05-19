// MostlyLearn — WhatsApp-Native Tutoring Ops OS
// Cloudflare Workers — Main entry point with router

export interface Env {
  ENVIRONMENT: 'development' | 'staging' | 'production';
  TEST_MODE: string;

  // Stripe
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_API_KEY: string;
  STRIPE_PRICE_ID: string;

  // WhatsApp
  WHATSAPP_API_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_VERIFY_TOKEN: string;

  // Calendly
  CALENDLY_API_TOKEN: string;
  CALENDLY_WEBHOOK_SECRET: string;

  // Google Sheets
  SHEETS_ID: string;
  SHEETS_SERVICE_ACCOUNT_JSON: string;

  // Cloudflare
  PROCESSED_EVENTS: KVNamespace;
  DEAD_LETTER_QUEUE: KVNamespace;
  WRITE_QUEUE: KVNamespace;
  SHEET_WRITE_QUEUE: Queue;
}

import { handleWhatsAppWebhook, handleWhatsAppVerify } from './whatsapp';
import { handleStripeWebhook } from './stripe';
import { handleCalendlyWebhook } from './calendly';
import { handleReferral } from './referral';
import { handleAdminRequest } from './admin';
import { log, getRecentLogs } from './utils';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    try {
      switch (path) {
        // Health
        case '/api/health':
          return jsonResponse({ status: 'ok', environment: env.ENVIRONMENT, testMode: env.TEST_MODE === 'true' });

        // WhatsApp
        case '/api/whatsapp':
          if (request.method === 'GET') return handleWhatsAppVerify(request, env);
          if (request.method === 'POST') return handleWhatsAppWebhook(request, env);
          return methodNotAllowed();

        // Stripe
        case '/api/stripe':
          if (request.method !== 'POST') return methodNotAllowed();
          return handleStripeWebhook(request, env);

        // Calendly
        case '/api/calendly':
          if (request.method !== 'POST') return methodNotAllowed();
          return handleCalendlyWebhook(request, env);

        // Referral
        case '/api/referral':
          if (request.method !== 'POST') return methodNotAllowed();
          return handleReferral(request, env);

        // Admin
        case '/api/admin':
          if (request.method !== 'GET') return methodNotAllowed();
          return handleAdminRequest(request, env);

        // Logs
        case '/api/logs':
          return jsonResponse(getRecentLogs());

        default:
          return jsonResponse({ error: 'Not found' }, 404);
      }
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : 'Unknown error';
      log('system', path, 'error', msg);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  },

  // Queue consumer for Sheet write operations (prevents race conditions)
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const payload = msg.body as { operation: string; data: unknown };
        log('queue', payload.operation, 'processing', JSON.stringify(payload.data));
        msg.ack();
      } catch (err) {
        log('queue', 'process', 'failed', err instanceof Error ? err.message : 'Unknown');
        msg.retry({ delaySeconds: 5 });
      }
    }
  },
};

// ─── Response helpers ───────────────────────────────────────

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function corsResponse(data: unknown, status = 200): Response {
  return new Response(data ? JSON.stringify(data) : null, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, stripe-signature, x-webhook-signature',
    },
  });
}

export function methodNotAllowed(): Response {
  return jsonResponse({ error: 'Method not allowed' }, 405);
}
