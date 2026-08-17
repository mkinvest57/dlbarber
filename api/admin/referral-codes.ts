import { ApiRequest, ApiResponse, methodNotAllowed, readBody, sendJson } from '../_lib/http';
import { requireAdmin } from '../_lib/auth';
import { getSupabaseAdminClient } from '../_lib/supabase';
import { normalizePhone, optionalReferralCode } from '../_lib/validation';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const user = await requireAdmin(req, res);
    if (!user) return sendJson(res, 401, { error: 'unauthorized' });
    const body = readBody<{ phone?: unknown; code?: unknown }>(req);
    const phone = normalizePhone(body.phone);
    const code = optionalReferralCode(body.code);
    if (!code) return sendJson(res, 400, { error: 'invalid_referral_code' });
    const supabase = getSupabaseAdminClient();
    const customer = await supabase.from('customers').select('id').eq('phone_e164', phone).maybeSingle();
    if (customer.error || !customer.data) return sendJson(res, 404, { error: 'customer_not_found' });
    const existing = await supabase.from('referral_codes').select('code').eq('customer_id', customer.data.id).maybeSingle();
    if (existing.error) return sendJson(res, 503, { error: 'referral_code_unavailable' });
    if (existing.data) {
      return existing.data.code === code
        ? sendJson(res, 200, { code: existing.data.code })
        : sendJson(res, 409, { error: 'referral_code_immutable' });
    }
    const result = await supabase.from('referral_codes').upsert({ customer_id: customer.data.id, code, active: true }, { onConflict: 'customer_id' }).select('code').single();
    if (result.error) return sendJson(res, 409, { error: 'referral_code_taken' });
    await supabase.from('admin_audit_log').insert({ actor_user_id: user.id, action: 'referral_code_created', entity_type: 'customer', entity_id: customer.data.id, metadata: { code } });
    return sendJson(res, 201, { code: result.data.code });
  } catch (error) {
    console.error('Referral code handler failed:', error);
    return sendJson(res, 400, { error: 'invalid_referral_code' });
  }
}
