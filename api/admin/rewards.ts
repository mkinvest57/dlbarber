import { ApiRequest, ApiResponse, methodNotAllowed, queryValue, readBody, sendJson } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { getSupabaseAdminClient } from '../_lib/supabase.js';
import { normalizePhone, uuid } from '../_lib/validation.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
  try {
    const user = await requireAdmin(req, res);
    if (!user) return sendJson(res, 401, { error: 'unauthorized' });
    const supabase = getSupabaseAdminClient();

    if (req.method === 'GET') {
      const phone = normalizePhone(queryValue(req, 'phone'));
      const customer = await supabase.from('customers').select('id,first_name,last_name').eq('phone_e164', phone).maybeSingle();
      if (customer.error) return sendJson(res, 503, { error: 'rewards_unavailable' });
      if (!customer.data) return sendJson(res, 404, { error: 'customer_not_found' });
      const [codeResult, creditsResult, visitsResult] = await Promise.all([
        supabase.from('referral_codes').select('code').eq('customer_id', customer.data.id).eq('active', true).maybeSingle(),
        supabase.from('referral_credits').select('remaining_cents').eq('referrer_customer_id', customer.data.id).eq('status', 'earned'),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('customer_id', customer.data.id).eq('status', 'completed'),
      ]);
      if (codeResult.error || creditsResult.error || visitsResult.error) return sendJson(res, 503, { error: 'rewards_unavailable' });
      const completedVisits = visitsResult.count || 0;
      return sendJson(res, 200, {
        summary: {
          customerId: customer.data.id,
          firstName: customer.data.first_name,
          lastName: customer.data.last_name,
          referralCode: codeResult.data?.code || null,
          referralBalanceCents: (creditsResult.data || []).reduce((total, credit) => total + credit.remaining_cents, 0),
          completedVisits,
          nextLoyaltyVisit: (Math.floor(completedVisits / 8) + 1) * 8,
          loyaltyEligible: (completedVisits + 1) % 8 === 0,
        },
      });
    }

    const body = readBody<{ action?: unknown; customerId?: unknown; appointmentId?: unknown }>(req);
    const action = String(body.action || '');
    const appointmentId = uuid(body.appointmentId, 'appointment');
    if (action === 'referral') {
      const customerId = uuid(body.customerId, 'customer');
      const { data, error } = await supabase.rpc('admin_redeem_referral_credits', {
        p_customer_id: customerId,
        p_appointment_id: appointmentId,
        p_actor_user_id: user.id,
      });
      if (error) return sendJson(res, 400, { error: 'reward_unavailable' });
      return sendJson(res, 200, { reward: data });
    }
    if (action === 'loyalty') {
      const { data, error } = await supabase.rpc('admin_apply_loyalty_reward', {
        p_appointment_id: appointmentId,
        p_actor_user_id: user.id,
      });
      if (error) return sendJson(res, 400, { error: 'reward_unavailable' });
      return sendJson(res, 200, { reward: data });
    }
    return sendJson(res, 400, { error: 'invalid_reward_action' });
  } catch (error) {
    console.error('Reward handler failed:', error);
    if (error instanceof Error && error.message.startsWith('Invalid')) return sendJson(res, 400, { error: 'invalid_reward_request' });
    return sendJson(res, 500, { error: 'internal_error' });
  }
}
