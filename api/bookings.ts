import { ApiRequest, ApiResponse, methodNotAllowed, readBody, sendJson } from './_lib/http';
import { createManageToken } from './_lib/auth';
import { getSupabaseAdminClient } from './_lib/supabase';
import { hashToken, idempotencyKey, normalizeName, normalizePhone, optionalReferralCode, parseStartAt } from './_lib/validation';

type BookingPayload = {
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  serviceId?: unknown;
  startAt?: unknown;
  referralCode?: unknown;
  idempotencyKey?: unknown;
  manageToken?: unknown;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const body = readBody<BookingPayload>(req);
    const firstName = normalizeName(body.firstName, 'first name');
    const lastName = normalizeName(body.lastName, 'last name');
    const phone = normalizePhone(body.phone);
    const serviceId = String(body.serviceId || '').trim();
    if (!/^[a-z0-9_-]{1,40}$/.test(serviceId)) throw new Error('Invalid service');
    const startAt = parseStartAt(body.startAt);
    const referralCode = optionalReferralCode(body.referralCode);
    const key = idempotencyKey(body.idempotencyKey);
    const manageToken = String(body.manageToken || createManageToken());
    if (manageToken.length < 32 || manageToken.length > 200) throw new Error('Invalid manage token');

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.rpc('create_public_appointment', {
      p_first_name: firstName,
      p_last_name: lastName,
      p_phone_e164: phone,
      p_service_id: serviceId,
      p_start_at: startAt,
      p_referral_code: referralCode,
      p_idempotency_key: key,
      p_manage_token_hash: hashToken(manageToken),
      p_source: 'online',
      p_notes: null,
    });

    if (error) {
      if (error.code === '23P01') return sendJson(res, 409, { error: 'slot_unavailable' });
      if (error.code === 'P0001' && error.message.includes('rate limit')) {
        res.setHeader('Retry-After', '900');
        return sendJson(res, 429, { error: 'rate_limited' });
      }
      if (error.message.includes('Invalid referral code')) return sendJson(res, 400, { error: 'invalid_referral_code' });
      if (error.code === 'P0002' || error.code === '22023' || error.code === '23514') return sendJson(res, 400, { error: 'invalid_booking' });
      console.error('Create booking failed:', error.message);
      return sendJson(res, 503, { error: 'booking_unavailable' });
    }

    return sendJson(res, 201, { booking: data, manageToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    if (message === 'Invalid referral code') return sendJson(res, 400, { error: 'invalid_referral_code' });
    if (message.startsWith('Invalid')) return sendJson(res, 400, { error: 'invalid_booking' });
    console.error('Booking handler failed:', error);
    return sendJson(res, 500, { error: 'internal_error' });
  }
}
