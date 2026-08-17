import { ApiRequest, ApiResponse, methodNotAllowed, sendJson } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const user = requireAdmin(req);
    if (!user) return sendJson(res, 401, { error: 'unauthorized' });
    return sendJson(res, 200, { user: { role: user.role } });
  } catch (error) {
    console.error('Admin session check failed:', error);
    return sendJson(res, 500, { error: 'internal_error' });
  }
}
