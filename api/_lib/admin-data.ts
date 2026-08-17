import { DateTime } from 'luxon';
import { BARBER_TIMEZONE } from './validation';

function euro(cents: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
}

export function toClientBooking(row: any) {
  const localStart = DateTime.fromISO(row.start_at, { setZone: true }).setZone(BARBER_TIMEZONE);
  const customer = Array.isArray(row.customer) ? row.customer[0] : row.customer;
  const referral = Array.isArray(row.referral_code) ? row.referral_code[0] : row.referral_code;
  const ownReferral = Array.isArray(customer?.referral_code) ? customer.referral_code[0] : customer?.referral_code;
  return {
    id: row.id,
    date: localStart.toISODate(),
    slotId: localStart.toFormat('HHmm'),
    time: localStart.toFormat('HH:mm'),
    startAt: row.start_at,
    endAt: row.end_at,
    service: {
      id: row.service_id,
      name: row.service_name,
      duration: `${row.duration_minutes} min`,
      price: euro(row.current_price_cents),
      basePrice: euro(row.base_price_cents),
      note: row.loyalty_discount_cents > 0 ? 'Fidélité appliquée' : row.referral_discount_cents > 0 ? 'Parrainage appliqué' : undefined,
    },
    client: {
      firstName: customer?.first_name || '',
      lastName: customer?.last_name || '',
      phone: customer?.phone_e164 || '',
    },
    status: row.status,
    customerId: row.customer_id,
    affiliateCode: ownReferral?.code || undefined,
    usedReferralCode: referral?.code || undefined,
    referralClaimed: row.referral_discount_cents > 0,
    referralDiscountCents: row.referral_discount_cents,
    loyaltyDiscountCents: row.loyalty_discount_cents,
    loyaltyVisitNumber: row.loyalty_visit_number,
    basePriceCents: row.base_price_cents,
    currentPriceCents: row.current_price_cents,
    createdAt: row.created_at,
  };
}

export const APPOINTMENT_SELECT = [
  'id', 'customer_id', 'start_at', 'end_at', 'status', 'source', 'service_id',
  'service_name', 'duration_minutes', 'base_price_cents', 'current_price_cents',
  'referral_code_id', 'referral_discount_cents', 'loyalty_discount_cents',
  'loyalty_visit_number', 'created_at',
  'customer:customers(id,first_name,last_name,phone_e164,referral_code:referral_codes(code))',
  'referral_code:referral_codes(code)',
].join(',');
