import { ApiRequest, ApiResponse, methodNotAllowed, readBody, sendJson } from './_lib/http';
import { getSupabaseAdminClient } from './_lib/supabase';
import { hashToken } from './_lib/validation';

type ManagePayload = { token?: unknown; action?: unknown };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const body = readBody<ManagePayload>(req);
    const token = String(body.token || '').trim();
    const action = String(body.action || 'lookup');
    if (token.length < 32 || token.length > 200 || !/^(lookup|cancel|sms_draft_opened)$/.test(action)) {
      return sendJson(res, 400, { error: 'invalid_management_request' });
    }
    const supabase = getSupabaseAdminClient();
    const { data, error } = action === 'sms_draft_opened'
      ? await supabase.rpc('record_public_appointment_event', {
          p_manage_token_hash: hashToken(token),
          p_event_type: action,
        })
      : await supabase.rpc('manage_public_appointment', {
          p_manage_token_hash: hashToken(token),
          p_action: action,
        });
    if (error) {
      if (error.code === 'P0002') return sendJson(res, 404, { error: 'booking_not_found' });
      if (error.code === '22023') return sendJson(res, 409, { error: 'booking_cannot_be_cancelled' });
      console.error('Booking management failed:', error.message);
      return sendJson(res, 503, { error: 'booking_unavailable' });
    }
    return sendJson(res, 200, { booking: data });
  } catch (error) {
    console.error('Booking management handler failed:', error);
    return sendJson(res, 400, { error: 'invalid_management_request' });
  }
}
