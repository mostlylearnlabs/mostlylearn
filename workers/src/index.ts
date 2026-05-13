// MostlyLearn — WhatsApp-Native Tutoring Ops OS
// Cloudflare Workers single-script with route-based handlers
// Routes: /api/whatsapp, /api/stripe, /api/calendly, /api/admin, /api/referral, /api/logs

export interface Env {
  ENVIRONMENT: string;
  SHEET_ID: string;
  STRIPE_WEBHOOK_SECRET: string;
  WHATSAPP_API_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  CALENDLY_WEBHOOK_SECRET: string;
  TEST_MODE: string;
  PROCESSED_EVENTS: KVNamespace;
}

interface WebhookLog {
  timestamp: string;
  source: string;
  event: string;
  status: string;
  details: string;
}

const LOGS: WebhookLog[] = [];

function log(source: string, event: string, status: string, details: string) {
  const entry: WebhookLog = {
    timestamp: new Date().toISOString(),
    source,
    event,
    status,
    details,
  };
  LOGS.push(entry);
  if (LOGS.length > 100) LOGS.shift();
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type' },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    try {
      switch (path) {
        case '/api/health':
          return jsonResponse({ status: 'ok', env: env.ENVIRONMENT, testMode: env.TEST_MODE });

        case '/api/whatsapp':
          return handleWhatsApp(request, env);

        case '/api/stripe':
          return handleStripe(request, env);

        case '/api/calendly':
          return handleCalendly(request, env);

        case '/api/admin':
          return handleAdmin(request, env);

        case '/api/referral':
          return handleReferral(request, env);

        case '/api/logs':
          return jsonResponse(LOGS.slice(-50));

        default:
          return errorResponse('Not found', 404);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log('system', path, 'error', msg);
      return errorResponse('Internal error', 500);
    }
  },
};

// ─── WhatsApp Handler ────────────────────────────────────────

async function handleWhatsApp(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405);

  const body = await request.json() as Record<string, unknown>;

  if (env.TEST_MODE === 'true') {
    log('whatsapp', 'webhook_received', 'test', JSON.stringify(body));
    return jsonResponse({ status: 'test_mode_ok' });
  }

  log('whatsapp', 'webhook_received', 'ok', 'Inbound message received');
  return jsonResponse({ status: 'ok' });
}

// ─── Stripe Handler ─────────────────────────────────────────

async function handleStripe(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405);

  const signature = request.headers.get('stripe-signature');
  if (!signature) return errorResponse('Missing Stripe signature', 401);

  const body = await request.text();
  const event = JSON.parse(body) as Record<string, unknown>;
  const eventId = event.id as string;

  if (env.TEST_MODE === 'true') {
    log('stripe', 'webhook_received', 'test', eventId);
    return jsonResponse({ status: 'test_mode_ok' });
  }

  const processed = await env.PROCESSED_EVENTS.get(eventId);
  if (processed) {
    log('stripe', event.type as string, 'duplicate', eventId);
    return jsonResponse({ status: 'duplicate_ignored' });
  }

  await env.PROCESSED_EVENTS.put(eventId, JSON.stringify({
    processedAt: new Date().toISOString(),
    type: event.type,
  }));

  log('stripe', event.type as string, 'processed', eventId);
  return jsonResponse({ status: 'ok' });
}

// ─── Calendly Handler ───────────────────────────────────────

async function handleCalendly(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405);

  const body = await request.json() as Record<string, unknown>;

  if (env.TEST_MODE === 'true') {
    log('calendly', 'webhook_received', 'test', JSON.stringify(body));
    return jsonResponse({ status: 'test_mode_ok' });
  }

  log('calendly', 'booking_confirmed', 'ok', 'Demo scheduled');
  return jsonResponse({ status: 'ok' });
}

// ─── Admin Handler ────────────────────────────────────────

async function handleAdmin(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return errorResponse('Method not allowed', 405);

  return jsonResponse({
    environment: env.ENVIRONMENT,
    testMode: env.TEST_MODE,
    processedEventsCount: 0,
    recentLogs: LOGS.slice(-10),
  });
}

// ─── Referral Handler ──────────────────────────────────────

async function handleReferral(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405);

  const body = await request.json() as {
    referral_code?: string;
    referee_name?: string;
    referee_phone?: string;
  };

  if (!body.referral_code || !body.referee_phone) {
    return errorResponse('Missing referral_code or referee_phone');
  }

  log('referral', 'code_redeemed', 'ok', `${body.referral_code} → ${body.referee_phone}`);
  return jsonResponse({ status: 'referral_logged' });
}
