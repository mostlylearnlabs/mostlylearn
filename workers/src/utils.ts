// Shared utilities for the MostlyLearn Workers service

// ─── Structured logging ────────────────────────────────────

export interface LogEntry {
  timestamp: string;
  source: string;
  event: string;
  status: string;
  details: string;
  sessionId?: string;
}

const MAX_LOG_ENTRIES = 200;
const logs: LogEntry[] = [];

export function log(source: string, event: string, status: string, details: string, sessionId?: string): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    source,
    event,
    status,
    details,
    ...(sessionId && { sessionId }),
  };
  logs.push(entry);
  if (logs.length > MAX_LOG_ENTRIES) logs.shift();
}

export function getRecentLogs(limit = 50): LogEntry[] {
  return logs.slice(-limit);
}

// ─── Crypto helpers ─────────────────────────────────────────

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha1' = 'sha256'
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: algorithm === 'sha256' ? 'SHA-256' : 'SHA-1' },
    false,
    ['verify']
  );
  const expectedSig = await crypto.subtle.sign(
    { name: 'HMAC', hash: algorithm === 'sha256' ? 'SHA-256' : 'SHA-1' },
    key,
    encoder.encode(payload)
  );
  const expectedHex = Array.from(new Uint8Array(expectedSig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return expectedHex === signature;
}

// ─── Timestamp helpers ──────────────────────────────────────

export function nowISO(): string {
  return new Date().toISOString();
}

export function todayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Random ID generation ──────────────────────────────────

export function generateId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${rand}_${Date.now().toString(36)}`;
}

// ─── Phone number normalization ────────────────────────────

export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');
}

export function referralCode(phone: string): string {
  const normalized = normalizePhone(phone);
  return `ML-${normalized.slice(-4)}`;
}

export function teacherReferralCode(teacherId: string): string {
  return `ML-T${teacherId}`;
}
