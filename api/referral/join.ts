import { ApiRequest, ApiResponse, methodNotAllowed, readBody, sendJson } from '../_lib/http.js';
import { getSupabaseAdminClient } from '../_lib/supabase.js';
import { normalizeName, normalizePhone } from '../_lib/validation.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const body = readBody<{ firstName?: unknown; lastName?: unknown; phone?: unknown }>(req);
    const { data, error } = await getSupabaseAdminClient().rpc('join_referral_program', {
      p_first_name: normalizeName(body.firstName, 'first name'),
      p_last_name: normalizeName(body.lastName, 'last name'),
      p_phone_e164: normalizePhone(body.phone),
    });
    if (error || !data?.code) {
      console.error('Referral join failed:', error?.message);
      return sendJson(res, 503, { error: 'referral_unavailable' });
    }
    return sendJson(res, 200, { code: data.code, created: Boolean(data.created) });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid')) return sendJson(res, 400, { error: 'invalid_referral_profile' });
    console.error('Referral join handler failed:', error);
    return sendJson(res, 500, { error: 'internal_error' });
  }
}
