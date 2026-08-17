import { ApiRequest, ApiResponse, methodNotAllowed, sendJson } from '../_lib/http';
import { clearSessionCookies } from '../_lib/auth';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  clearSessionCookies(req, res);
  return sendJson(res, 200, { ok: true });
}
