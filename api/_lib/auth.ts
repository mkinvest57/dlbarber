import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiRequest, ApiResponse } from './http.js';

const ACCESS_COOKIE = 'daryl_admin_access';
const ACCESS_MAX_AGE = 60 * 60 * 8;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

type AdminSession = { exp: number; iat: number; role: 'admin' };
type LoginAttempt = { count: number; startedAt: number };

const loginAttempts = new Map<string, LoginAttempt>();

export type AdminUser = {
  id: null;
  role: 'admin';
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

function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error('ADMIN_SESSION_SECRET is not configured');
  return secret;
}

function sign(value: string) {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

function createSessionToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + ACCESS_MAX_AGE, role: 'admin' satisfies AdminSession['role'] })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, signature, ...extra] = token.split('.');
  if (!payload || !signature || extra.length) return false;
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AdminSession;
    return session.role === 'admin' && Number.isInteger(session.iat) && Number.isInteger(session.exp) && session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function requestIp(req: ApiRequest) {
  const forwarded = req.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(',')[0]?.trim() || 'unknown';
}

function canAttemptLogin(ip: string) {
  const attempt = loginAttempts.get(ip);
  if (!attempt || Date.now() - attempt.startedAt > LOGIN_WINDOW_MS) return true;
  return attempt.count < MAX_LOGIN_ATTEMPTS;
}

function recordFailedLogin(ip: string) {
  const existing = loginAttempts.get(ip);
  if (!existing || Date.now() - existing.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, startedAt: Date.now() });
    return;
  }
  existing.count += 1;
}

function accessCodeMatches(code: string) {
  const expected = process.env.ADMIN_ACCESS_CODE?.trim();
  if (!expected || !code) throw new Error('ADMIN_ACCESS_CODE is not configured');
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(code);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function clearSessionCookies(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Set-Cookie', cookie(ACCESS_COOKIE, '', 0, secureCookie(req)));
}

export function requireAdmin(req: ApiRequest): AdminUser | null {
  return verifySessionToken(parseCookies(req)[ACCESS_COOKIE]) ? { id: null, role: 'admin' } : null;
}

export function signInAdmin(req: ApiRequest, res: ApiResponse, code: string): 'ok' | 'invalid' | 'rate_limited' {
  const ip = requestIp(req);
  if (!canAttemptLogin(ip)) return 'rate_limited';
  if (!accessCodeMatches(code)) {
    recordFailedLogin(ip);
    return 'invalid';
  }
  loginAttempts.delete(ip);
  res.setHeader('Set-Cookie', cookie(ACCESS_COOKIE, createSessionToken(), ACCESS_MAX_AGE, secureCookie(req)));
  return 'ok';
}

export function createManageToken() {
  return randomBytes(32).toString('hex');
}
