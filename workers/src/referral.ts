// Referral system — code validation, credit tracking, teacher bonus

import type { Env } from './index';
import type { ReferralRequest, ReferralValidationResult } from './types';
import { jsonResponse } from './index';
import { log, referralCode, normalizePhone } from './utils';
import { appendReferral, getReferrals } from './sheets';
import { sendWhatsAppMessage } from './whatsapp';

export async function handleReferral(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as ReferralRequest;

  if (!body.referral_code || !body.referee_phone) {
    return jsonResponse({ error: 'Missing required fields: referral_code, referee_phone' }, 400);
  }

  if (env.TEST_MODE === 'true') {
    log('referral', 'redeem', 'test', `${body.referral_code} -> ${body.referee_phone}`);
    return jsonResponse({ status: 'test_mode_ok' });
  }

  // Validate referral code
  const validation = await validateReferralCode(env, body.referral_code, body.referee_phone);
  if (!validation.isValid) {
    return jsonResponse({ error: validation.error }, 400);
  }

  // Log referral to Sheets
  appendReferral(env, [
    validation.referrerName || '',
    extractPhoneFromCode(body.referral_code, env),
    validation.referrerType || '',
    body.referee_name,
    body.referee_phone,
    body.referral_code,
    'pending',
    'false',
    'false',
    '0',
    'false',
    new Date().toISOString(),
  ]);

  log('referral', 'code_redeemed', 'ok', `${body.referral_code} → ${body.referee_name} (${body.referee_phone})`);

  await sendWhatsAppMessage(
    env,
    body.referee_phone,
    `Welcome to MostlyLearn! You were referred by a friend! 🎉 Book your free demo class here: https://calendly.com/mostlylearn/demo`
  );

  return jsonResponse({
    status: 'referral_logged',
    referrer_type: validation.referrerType,
    referral_code: body.referral_code,
  });
}

async function validateReferralCode(
  env: Env,
  code: string,
  refereePhone: string
): Promise<ReferralValidationResult> {
  const normalizedReferee = normalizePhone(refereePhone);

  // Self-referral check
  const expectedStudentCode = referralCode(refereePhone);
  if (code === expectedStudentCode) {
    return { isValid: false, error: 'Cannot use your own referral code' };
  }

  // Check if referee already has a referral
  const existingReferrals = await getReferrals(env);
  for (const row of existingReferrals) {
    if (normalizePhone(row[4] as string || '') === normalizedReferee) {
      return { isValid: false, error: 'This student already has a referral record' };
    }
  }

  // Determine referrer type from code format
  if (code.startsWith('ML-T')) {
    return { isValid: true, referrerType: 'teacher', referrerName: `Teacher ${code}` };
  }
  if (code.startsWith('ML-')) {
    return { isValid: true, referrerType: 'student', referrerName: `Student ${code}` };
  }

  return { isValid: false, error: 'Invalid referral code format' };
}

function extractPhoneFromCode(code: string, env: Env): string {
  const suffix = code.replace('ML-', '').replace('T', '');
  return suffix;
}
