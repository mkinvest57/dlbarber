import { randomUUID } from 'node:crypto';
import { ApiRequest, ApiResponse, methodNotAllowed, queryValue, readBody, sendJson } from '../_lib/http';
import { createManageToken, requireAdmin } from '../_lib/auth';
import { APPOINTMENT_SELECT, toClientBooking } from '../_lib/admin-data';
import { getSupabaseAdminClient } from '../_lib/supabase';
import { hashToken, idempotencyKey, normalizeName, normalizePhone, parseStartAt, uuid } from '../_lib/validation';

type ManualBooking = {
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  serviceId?: unknown;
  startAt?: unknown;
  notes?: unknown;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const user = await requireAdmin(req, res);
    if (!user) return sendJson(res, 401, { error: 'unauthorized' });
    const supabase = getSupabaseAdminClient();

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('appointments')
        .select(APPOINTMENT_SELECT)
        .order('start_at', { ascending: true })
        .limit(2000);
      if (error) {
        console.error('Admin booking list failed:', error.message);
        return sendJson(res, 503, { error: 'bookings_unavailable' });
      }
      return sendJson(res, 200, { bookings: (data || []).map(toClientBooking) });
    }

    if (req.method === 'POST') {
      const body = readBody<ManualBooking>(req);
      const firstName = normalizeName(body.firstName, 'first name');
      const lastName = normalizeName(body.lastName, 'last name');
      const phone = normalizePhone(body.phone);
      const serviceId = String(body.serviceId || '').trim();
      const startAt = parseStartAt(body.startAt);
      const manageToken = createManageToken();
      const key = idempotencyKey(`admin-${randomUUID()}`);
      const { data, error } = await supabase.rpc('create_public_appointment', {
        p_first_name: firstName,
        p_last_name: lastName,
        p_phone_e164: phone,
        p_service_id: serviceId,
        p_start_at: startAt,
        p_referral_code: null,
        p_idempotency_key: key,
        p_manage_token_hash: hashToken(manageToken),
        p_source: 'walk-in',
        p_notes: String(body.notes || '').trim() || null,
      });
      if (error) {
        if (error.code === '23P01') return sendJson(res, 409, { error: 'slot_unavailable' });
        console.error('Manual booking failed:', error.message);
        return sendJson(res, 400, { error: 'invalid_booking' });
      }
      if (data?.id) await supabase.from('appointments').update({ created_by: user.id }).eq('id', data.id);
      return sendJson(res, 201, { booking: data });
    }

    if (req.method === 'PATCH') {
      const body = readBody<{ id?: unknown; status?: unknown }>(req);
      const id = uuid(body.id, 'booking');
      const status = String(body.status || '');
      const { data, error } = await supabase.rpc('admin_set_appointment_status', {
        p_appointment_id: id,
        p_status: status,
        p_actor_user_id: user.id,
      });
      if (error) {
        console.error('Status update failed:', error.message);
        return sendJson(res, 400, { error: 'invalid_status_change' });
      }
      return sendJson(res, 200, { booking: data });
    }

    if (req.method === 'DELETE') {
      const id = uuid(queryValue(req, 'id'), 'booking');
      const { data, error } = await supabase.rpc('admin_set_appointment_status', {
        p_appointment_id: id,
        p_status: 'cancelled',
        p_actor_user_id: user.id,
      });
      if (error) return sendJson(res, 400, { error: 'invalid_booking' });
      return sendJson(res, 200, { booking: data });
    }

    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
  } catch (error) {
    console.error('Admin bookings handler failed:', error);
    if (error instanceof Error && error.message.startsWith('Invalid')) return sendJson(res, 400, { error: 'invalid_booking' });
    return sendJson(res, 500, { error: 'internal_error' });
  }
}
