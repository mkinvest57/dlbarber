import { describe, expect, it } from 'vitest';
import { hashToken, normalizePhone, optionalReferralCode, parseStartAt, uuid } from '../api/_lib/validation';

describe('booking validation', () => {
  it('normalizes French mobile numbers to E.164', () => {
    expect(normalizePhone('06 11 58 49 79')).toBe('+33611584979');
    expect(normalizePhone('+33 6 11 58 49 79')).toBe('+33611584979');
  });

  it('rejects invalid or ambiguous phone numbers', () => {
    expect(() => normalizePhone('123')).toThrow('Invalid phone number');
  });

  it('validates referral codes without treating arbitrary text as valid', () => {
    expect(optionalReferralCode(' lu c4 ')).toBe('LUC4');
    expect(optionalReferralCode('')).toBeNull();
    expect(() => optionalReferralCode('not-valid!')).toThrow('Invalid referral code');
  });

  it('normalizes a zoned date to UTC and hashes management tokens', () => {
    expect(parseStartAt('2026-08-17T10:00:00+02:00')).toBe('2026-08-17T08:00:00.000Z');
    expect(() => parseStartAt('2026-08-17T10:00:00')).toThrow('Invalid appointment date');
    expect(hashToken('secret-token')).toHaveLength(64);
  });

  it('accepts canonical UUIDs and rejects malformed identifiers', () => {
    expect(uuid('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(() => uuid('not-an-id')).toThrow('Invalid identifier');
  });
});
