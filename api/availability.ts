import { DateTime } from 'luxon';
import { ApiRequest, ApiResponse, methodNotAllowed, sendJson } from './_lib/http.js';
import { getSupabaseAdminClient } from './_lib/supabase.js';
import { BARBER_TIMEZONE } from './_lib/validation.js';

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'walk-in']);

function toMillis(value: string) {
  return DateTime.fromISO(value, { setZone: true }).toMillis();
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  try {
    const supabase = getSupabaseAdminClient();
    const now = DateTime.now().setZone(BARBER_TIMEZONE);
    const firstDay = now.startOf('day');
    const lastDay = firstDay.plus({ days: 28 });
    const [servicesResult, hoursResult, closuresResult, blockedResult, appointmentsResult] = await Promise.all([
      supabase.from('services').select('id,name,duration_minutes,price_cents,note').eq('active', true).order('sort_order'),
      supabase.from('business_hours').select('weekday,open_time,close_time,is_closed').order('weekday'),
      supabase.from('closures').select('starts_at,ends_at').lt('starts_at', lastDay.toUTC().toISO()).gt('ends_at', firstDay.toUTC().toISO()),
      supabase.from('blocked_periods').select('starts_at,ends_at').lt('starts_at', lastDay.toUTC().toISO()).gt('ends_at', firstDay.toUTC().toISO()),
      supabase.from('appointments').select('start_at,end_at,status,created_at').lt('start_at', lastDay.toUTC().toISO()).gt('end_at', firstDay.toUTC().toISO()).in('status', [...ACTIVE_STATUSES]),
    ]);

    const firstError = [servicesResult, hoursResult, closuresResult, blockedResult, appointmentsResult].find((result) => result.error)?.error;
    if (firstError) {
      console.error('Availability query failed:', firstError.message);
      return sendJson(res, 503, { error: 'availability_unavailable' });
    }

    const services = servicesResult.data || [];
    const hours = new Map((hoursResult.data || []).map((item) => [item.weekday, item]));
    const closureRanges = (closuresResult.data || []).map((item) => ({
      start: toMillis(item.starts_at),
      end: toMillis(item.ends_at),
    }));
    const blockedRanges = (blockedResult.data || []).map((item) => ({
      start: toMillis(item.starts_at),
      end: toMillis(item.ends_at),
    }));
    const pendingHoldCutoff = DateTime.now().minus({ hours: 2 }).toMillis();
    const busy = (appointmentsResult.data || []).filter((item) => item.status !== 'pending' || toMillis(item.created_at) >= pendingHoldCutoff).map((item) => ({
      start: toMillis(item.start_at),
      end: toMillis(item.end_at),
    }));

    const schedules = Array.from({ length: 28 }, (_, index) => {
      const date = firstDay.plus({ days: index });
      const dateString = date.toISODate();
      const dayOfWeek = date.weekday === 7 ? 0 : date.weekday;
      const dayHours = hours.get(dayOfWeek);
      const slots: Array<Record<string, unknown>> = [];

      if (dayHours && !dayHours.is_closed && dayHours.open_time && dayHours.close_time) {
        let cursor = DateTime.fromISO(`${dateString}T${dayHours.open_time}`, { zone: BARBER_TIMEZONE });
        const close = DateTime.fromISO(`${dateString}T${dayHours.close_time}`, { zone: BARBER_TIMEZONE });
        while (cursor < close) {
          const startAt = cursor.toUTC();
          const endAt = cursor.plus({ minutes: 15 }).toUTC();
          const startMillis = startAt.toMillis();
          const endMillis = endAt.toMillis();
          const isPast = startMillis < now.toMillis();
          const isBlocked = blockedRanges.some((range) => range.start < endMillis && range.end > startMillis);
          const isClosed = closureRanges.some((range) => range.start < endMillis && range.end > startMillis);
          const isBooked = busy.some((range) => range.start < endMillis && range.end > startMillis);
          const availableServiceIds = services.filter((service) => {
            const serviceEnd = cursor.plus({ minutes: service.duration_minutes });
            const serviceEndMillis = serviceEnd.toMillis();
            return !isPast
              && serviceEnd <= close
              && !closureRanges.some((range) => range.start < serviceEndMillis && range.end > startMillis)
              && !blockedRanges.some((range) => range.start < serviceEndMillis && range.end > startMillis)
              && !busy.some((range) => range.start < serviceEndMillis && range.end > startMillis);
          }).map((service) => service.id);
          const hour = cursor.hour;
          slots.push({
            id: cursor.toFormat('HHmm'),
            time: cursor.toFormat('HH:mm'),
            startAt: startAt.toISO(),
            status: hour <= 11 ? 'Prime' : hour >= 17 ? 'Peak' : 'Open',
            isAvailable: availableServiceIds.length > 0,
            availableServiceIds,
            isAdminBlocked: isBlocked,
            unavailableReason: isPast ? 'past' : isBooked ? 'booked' : isBlocked ? 'blocked' : isClosed || availableServiceIds.length === 0 ? 'closed' : undefined,
          });
          cursor = cursor.plus({ minutes: 15 });
        }
      }

      return { date: dateString, slots };
    });

    return sendJson(res, 200, {
      timezone: BARBER_TIMEZONE,
      services,
      schedules,
    });
  } catch (error) {
    console.error('Availability handler failed:', error);
    return sendJson(res, 500, { error: 'internal_error' });
  }
}
