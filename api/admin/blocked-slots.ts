import { DateTime } from 'luxon';
import { ApiRequest, ApiResponse, methodNotAllowed, readBody, sendJson } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { getSupabaseAdminClient } from '../_lib/supabase.js';
import { parseStartAt } from '../_lib/validation.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const user = requireAdmin(req);
    if (!user) return sendJson(res, 401, { error: 'unauthorized' });
    const body = readBody<{ startAt?: unknown; endAt?: unknown; reason?: unknown }>(req);
    const startAt = parseStartAt(body.startAt);
    const endAt = body.endAt ? parseStartAt(body.endAt) : DateTime.fromISO(startAt, { setZone: true }).plus({ minutes: 15 }).toUTC().toISO();
    const supabase = getSupabaseAdminClient();
    const existing = await supabase.from('blocked_periods').select('id').eq('starts_at', startAt).eq('ends_at', endAt).maybeSingle();
    if (existing.error) return sendJson(res, 503, { error: 'availability_unavailable' });
    if (existing.data) {
      const { error } = await supabase.from('blocked_periods').delete().eq('id', existing.data.id);
      if (error) return sendJson(res, 503, { error: 'availability_unavailable' });
      return sendJson(res, 200, { blocked: false });
    }
    const { error } = await supabase.from('blocked_periods').insert({
      starts_at: startAt,
      ends_at: endAt,
      reason: String(body.reason || 'Admin block').trim().slice(0, 200),
      created_by: user.id,
    });
    if (error) return sendJson(res, 503, { error: 'availability_unavailable' });
    return sendJson(res, 200, { blocked: true });
  } catch (error) {
    console.error('Blocked slot handler failed:', error);
    return sendJson(res, 400, { error: 'invalid_slot' });
  }
}
