import { ApiRequest, ApiResponse, methodNotAllowed, sendJson } from '../_lib/http';
import { requireAdmin } from '../_lib/auth';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const user = await requireAdmin(req, res);
    if (!user) return sendJson(res, 401, { error: 'unauthorized' });
    return sendJson(res, 200, { user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error('Admin session check failed:', error);
    return sendJson(res, 500, { error: 'internal_error' });
  }
}
