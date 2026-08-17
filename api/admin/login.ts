import { ApiRequest, ApiResponse, methodNotAllowed, readBody, sendJson } from '../_lib/http.js';
import { signInAdmin } from '../_lib/auth.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const body = readBody<{ code?: unknown }>(req);
    const code = String(body.code || '').trim();
    if (!/^\d{4}$/.test(code)) return sendJson(res, 400, { error: 'invalid_credentials' });
    const result = signInAdmin(req, res, code);
    if (result === 'rate_limited') return sendJson(res, 429, { error: 'too_many_attempts' });
    if (result !== 'ok') return sendJson(res, 401, { error: 'invalid_credentials' });
    return sendJson(res, 200, { user: { role: 'admin' } });
  } catch (error) {
    console.error('Admin login failed:', error);
    return sendJson(res, 500, { error: 'internal_error' });
  }
}
