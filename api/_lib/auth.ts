import { randomBytes } from 'node:crypto';
import { ApiRequest, ApiResponse } from './http';
import { getSupabaseAdminClient, getSupabaseAuthClient } from './supabase';

const ACCESS_COOKIE = 'daryl_admin_access';
const REFRESH_COOKIE = 'daryl_admin_refresh';
const ACCESS_MAX_AGE = 60 * 60;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

export type AdminUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
};

function parseCookies(req: ApiRequest): Record<string, string> {
  const header = req.headers.cookie;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return {};
  return value.split(';').reduce<Record<string, string>>((result, item) => {
    const separator = item.indexOf('=');
    if (separator < 0) return result;
    const key = item.slice(0, separator).trim();
    const raw = item.slice(separator + 1).trim();
    try {
      result[key] = decodeURIComponent(raw);
    } catch {
      // Ignore malformed cookies and let the request authenticate normally.
    }
    return result;
  }, {});
}

function secureCookie(req: ApiRequest) {
  const forwarded = req.headers['x-forwarded-proto'];
  const protocol = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return process.env.NODE_ENV === 'production' || protocol === 'https';
}

function cookie(name: string, value: string, maxAge: number, secure: boolean) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

function clearCookie(name: string, secure: boolean) {
  return cookie(name, '', 0, secure);
}

function setSessionCookies(req: ApiRequest, res: ApiResponse, accessToken: string, refreshToken: string) {
  const secure = secureCookie(req);
  res.setHeader('Set-Cookie', [
    cookie(ACCESS_COOKIE, accessToken, ACCESS_MAX_AGE, secure),
    cookie(REFRESH_COOKIE, refreshToken, REFRESH_MAX_AGE, secure),
  ]);
}

export function clearSessionCookies(req: ApiRequest, res: ApiResponse) {
  const secure = secureCookie(req);
  res.setHeader('Set-Cookie', [clearCookie(ACCESS_COOKIE, secure), clearCookie(REFRESH_COOKIE, secure)]);
}

function isAllowedAdmin(user: AdminUser) {
  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const userEmail = user.email?.trim().toLowerCase();
  const role = user.app_metadata?.role;
  return role === 'admin' || Boolean(configuredEmail && userEmail === configuredEmail);
}

export async function requireAdmin(req: ApiRequest, res: ApiResponse): Promise<AdminUser | null> {
  const cookies = parseCookies(req);
  let accessToken = cookies[ACCESS_COOKIE];
  const refreshToken = cookies[REFRESH_COOKIE];
  if (!accessToken) return null;

  const auth = getSupabaseAuthClient();
  let result = await auth.auth.getUser(accessToken);

  if (result.error && refreshToken) {
    const refreshed = await auth.auth.refreshSession({ refresh_token: refreshToken });
    if (refreshed.data.session?.access_token && refreshed.data.session.refresh_token) {
      accessToken = refreshed.data.session.access_token;
      setSessionCookies(req, res, accessToken, refreshed.data.session.refresh_token);
      result = await auth.auth.getUser(accessToken);
    }
  }

  if (result.error || !result.data.user) return null;
  const user = result.data.user as AdminUser;
  return isAllowedAdmin(user) ? user : null;
}

export async function signInAdmin(req: ApiRequest, res: ApiResponse, email: string, password: string) {
  const auth = getSupabaseAuthClient();
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) return null;

  const user = data.user as AdminUser;
  if (!isAllowedAdmin(user)) {
    await auth.auth.signOut({ scope: 'local' });
    return null;
  }

  setSessionCookies(req, res, data.session.access_token, data.session.refresh_token);
  return user;
}

export function createManageToken() {
  return randomBytes(32).toString('hex');
}
