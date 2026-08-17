import { ApiRequest, ApiResponse, methodNotAllowed, readBody, sendJson } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { getSupabaseAdminClient } from '../_lib/supabase.js';
import { uuid } from '../_lib/validation.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const user = await requireAdmin(req, res);
    if (!user) return sendJson(res, 401, { error: 'unauthorized' });

    const body = readBody<{ bookingId?: unknown; eventType?: unknown }>(req);
    const appointmentId = uuid(body.bookingId, 'booking');
    const eventType = String(body.eventType || '');
    if (eventType !== 'confirmation_sms_draft_opened') {
      return sendJson(res, 400, { error: 'invalid_appointment_event' });
    }

    const { error } = await getSupabaseAdminClient().from('appointment_events').insert({
      appointment_id: appointmentId,
      actor_user_id: user.id,
      event_type: eventType,
      metadata: { channel: 'sms', direction: 'barber_to_customer' },
    });
    if (error) {
      console.error('Admin appointment event failed:', error.message);
      return sendJson(res, 503, { error: 'appointment_event_unavailable' });
    }
    return sendJson(res, 201, { recorded: true });
  } catch (error) {
    console.error('Admin appointment event handler failed:', error);
    return sendJson(res, 400, { error: 'invalid_appointment_event' });
  }
}
