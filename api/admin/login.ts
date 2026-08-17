import { ApiRequest, ApiResponse, methodNotAllowed, readBody, sendJson } from '../_lib/http';
import { signInAdmin } from '../_lib/auth';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const body = readBody<{ email?: unknown; password?: unknown }>(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return sendJson(res, 400, { error: 'invalid_credentials' });
    const user = await signInAdmin(req, res, email, password);
    if (!user) return sendJson(res, 401, { error: 'invalid_credentials' });
    return sendJson(res, 200, { user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error('Admin login failed:', error);
    return sendJson(res, 500, { error: 'internal_error' });
  }
}
