// Google Sheets integration with write queue for race condition prevention

import type { Env } from './index';
import { log } from './utils';

// ─── API helpers ────────────────────────────────────────────

async function fetchSheet(sheetId: string, range: string, token: string): Promise<unknown[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Sheets API read failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { values?: unknown[][] };
  return data.values ?? [];
}

async function appendSheet(sheetId: string, range: string, rows: unknown[][], token: string): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) throw new Error(`Sheets API append failed: ${res.status} ${await res.text()}`);
}

async function updateSheet(sheetId: string, range: string, rows: unknown[][], token: string): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) throw new Error(`Sheets API update failed: ${res.status} ${await res.text()}`);
}

// ─── OAuth token from service account ──────────────────────

async function getAccessToken(env: Env): Promise<string> {
  if (env.ENVIRONMENT === 'development' || env.TEST_MODE === 'true') {
    return 'mock-token-for-development';
  }
  const serviceAccount = JSON.parse(env.SHEETS_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const jwt = `${btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))}.`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`OAuth failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

// ─── Sheet names ───────────────────────────────────────────

export const SHEETS = {
  STUDENTS: 'Students',
  TEACHERS: 'Teachers',
  CLASSES: 'Classes',
  REFERRALS: 'Referrals',
  PAYOUTS: 'Payouts',
} as const;

type SheetTab = typeof SHEETS[keyof typeof SHEETS];

// ─── Write queue with retry ────────────────────────────────

interface QueuedWrite {
  operation: string;
  range: string;
  rows: unknown[][];
  retries: number;
  maxRetries: number;
}

const writeQueue: QueuedWrite[] = [];
let queueFlushing = false;

export function enqueueWrite(env: Env, operation: string, range: string, rows: unknown[][]): void {
  writeQueue.push({ operation, range, rows, retries: 0, maxRetries: 3 });
  if (!queueFlushing) {
    queueFlushing = true;
    scheduleFlush(env);
  }
}

async function scheduleFlush(env: Env): Promise<void> {
  while (writeQueue.length > 0) {
    const item = writeQueue.shift();
    if (!item) continue;
    try {
      const token = await getAccessToken(env);
      if (item.operation === 'append') {
        await appendSheet(env.SHEETS_ID, item.range, item.rows, token);
      } else {
        await updateSheet(env.SHEETS_ID, item.range, item.rows, token);
      }
      log('sheets', item.operation, 'ok', `${item.range} (${item.rows.length} rows)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown';
      log('sheets', item.operation, 'error', msg);
      if (item.retries < item.maxRetries) {
        item.retries++;
        writeQueue.unshift(item);
        log('sheets', item.operation, 'retry', `Attempt ${item.retries}/${item.maxRetries}`);
        await new Promise((r) => setTimeout(r, 1000 * item.retries));
      } else {
        log('sheets', item.operation, 'dead_letter', `Dropped after ${item.maxRetries} retries: ${item.range}`);
      }
    }
  }
  queueFlushing = false;
}

// ─── Public API ────────────────────────────────────────────

export async function getStudents(env: Env): Promise<unknown[][]> {
  const token = await getAccessToken(env);
  return fetchSheet(env.SHEETS_ID, `${SHEETS.STUDENTS}!A:Z`, token);
}

export async function getTeachers(env: Env): Promise<unknown[][]> {
  const token = await getAccessToken(env);
  return fetchSheet(env.SHEETS_ID, `${SHEETS.TEACHERS}!A:Z`, token);
}

export async function getClasses(env: Env): Promise<unknown[][]> {
  const token = await getAccessToken(env);
  return fetchSheet(env.SHEETS_ID, `${SHEETS.CLASSES}!A:Z`, token);
}

export async function getReferrals(env: Env): Promise<unknown[][]> {
  const token = await getAccessToken(env);
  return fetchSheet(env.SHEETS_ID, `${SHEETS.REFERRALS}!A:Z`, token);
}

export function appendStudent(env: Env, row: string[]): void {
  enqueueWrite(env, 'append', `${SHEETS.STUDENTS}!A:Z`, [row]);
}

export function appendClass(env: Env, row: string[]): void {
  enqueueWrite(env, 'append', `${SHEETS.CLASSES}!A:Z`, [row]);
}

export function appendReferral(env: Env, row: string[]): void {
  enqueueWrite(env, 'append', `${SHEETS.REFERRALS}!A:Z`, [row]);
}

export function updateStudentCredits(env: Env, rowIndex: number, credits: number): void {
  enqueueWrite(env, 'update', `${SHEETS.STUDENTS}!G${rowIndex}:G${rowIndex}`, [[credits.toString()]]);
}

export function markReferralCompleted(env: Env, rowIndex: number): void {
  enqueueWrite(env, 'update', `${SHEETS.REFERRALS}!F${rowIndex}:F${rowIndex}`, [['completed']]);
}
