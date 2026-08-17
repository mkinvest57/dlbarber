import { createHash, randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';

export const BARBER_TIMEZONE = 'Europe/Paris';

export function normalizePhone(value: unknown) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (/^\+/.test(raw) && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.startsWith('33') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+33${digits.slice(1)}`;
  throw new Error('Invalid phone number');
}

export function normalizeName(value: unknown, label: string) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 80) throw new Error(`Invalid ${label}`);
  return name;
}

export function parseStartAt(value: unknown) {
  const raw = String(value || '').trim();
  if (!/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) throw new Error('Invalid appointment date');
  const date = DateTime.fromISO(raw, { setZone: true });
  if (!date.isValid) throw new Error('Invalid appointment date');
  return date.toUTC().toISO({ suppressMilliseconds: false });
}

export function idempotencyKey(value: unknown) {
  const key = String(value || '').trim();
  if (key.length < 16 || key.length > 200) throw new Error('Invalid idempotency key');
  return key;
}

export function optionalReferralCode(value: unknown) {
  const code = String(value || '').replace(/\s+/g, '').toUpperCase();
  if (!code) return null;
  if (!/^[A-Z0-9]{4}$/.test(code)) throw new Error('Invalid referral code');
  return code;
}

export function uuid(value: unknown, label = 'identifier') {
  const id = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new Error(`Invalid ${label}`);
  }
  return id;
}

export function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function newIdempotencyKey() {
  return randomUUID();
}
