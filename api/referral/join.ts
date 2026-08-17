import { ApiRequest, ApiResponse, methodNotAllowed, queryValue, readBody, sendJson } from '../_lib/http.js';
import { getSupabaseAdminClient } from '../_lib/supabase.js';
import { normalizeName, normalizePhone } from '../_lib/validation.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') return methodNotAllowed(res, ['POST', 'GET']);
  try {
    if (req.method === 'GET') {
      const phone = normalizePhone(queryValue(req, 'phone'));
      const supabase = getSupabaseAdminClient();
      const customer = await supabase.from('customers').select('id').eq('phone_e164', phone).maybeSingle();
      if (customer.error || !customer.data) return sendJson(res, 404, { error: 'customer_not_found' });
      const [code, credits, visits] = await Promise.all([
        supabase.from('referral_codes').select('code').eq('customer_id', customer.data.id).eq('active', true).maybeSingle(),
        supabase.from('referral_credits').select('remaining_cents').eq('referrer_customer_id', customer.data.id).eq('status', 'earned'),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('customer_id', customer.data.id).eq('status', 'completed'),
      ]);
      if (code.error || credits.error || visits.error) return sendJson(res, 503, { error: 'referral_unavailable' });
      return sendJson(res, 200, { summary: { code: code.data?.code || null, balanceCents: (credits.data || []).reduce((sum, credit) => sum + credit.remaining_cents, 0), completedVisits: visits.count || 0, nextFreeVisit: (Math.floor((visits.count || 0) / 8) + 1) * 8 } });
    }
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
