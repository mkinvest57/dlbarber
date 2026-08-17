import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DaySchedule, ClientBooking, BookingStatus, CustomerRewardSummary, ServiceItem } from './types';

type ApiError = Error & { code?: string; status?: number };

interface BookingContextType {
  schedules: DaySchedule[];
  services: ServiceItem[];
  bookings: ClientBooking[];
  addBooking: (booking: ClientBooking) => Promise<{ booking: any; manageToken: string }>;
  addManualBooking: (booking: ClientBooking) => Promise<void>;
  lookupManagedBooking: (token: string) => Promise<any>;
  cancelManagedBooking: (token: string) => Promise<any>;
  recordSmsDraftOpened: (token: string) => Promise<void>;
  recordAdminSmsDraftOpened: (bookingId: string) => Promise<void>;
  deleteBooking: (bookingId: string) => Promise<void>;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  getBookingsForDate: (date: string) => ClientBooking[];
  getClientVisitCount: (phone: string) => number;
  toggleSlotAvailability: (date: string, slotId: string) => Promise<void>;
  isAdminMode: boolean;
  setAdminMode: (mode: boolean) => void;
  isAuthenticated: boolean;
  authenticate: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  getFormattedDate: (dateStr: string) => { day: string; month: string; weekday: string };
  lookupCustomerRewards: (phone: string) => Promise<CustomerRewardSummary>;
  redeemReferralRewards: (targetBookingId: string, customerId: string) => Promise<void>;
  applyLoyaltyFreeCut: (bookingId: string) => Promise<void>;
  registerAffiliateCode: (phone: string, code: string) => Promise<boolean>;
  isDbConnected: boolean;
  dbError: string | null;
  initializeDb: () => Promise<void>;
  refreshData: () => Promise<void>;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  let payload: any = null;
  try { payload = await response.json(); } catch { /* empty response */ }
  if (!response.ok) {
    const error = new Error(payload?.error || 'Une erreur est survenue') as ApiError;
    error.code = payload?.error;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

function cleanPhone(phone: string) {
  return phone.replace(/\D/g, '');
}

function newRequestKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function serviceFromApi(service: any): ServiceItem {
  return {
    id: service.id,
    name: service.name,
    duration: `${service.duration_minutes} min`,
    price: new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(service.price_cents / 100),
    note: service.note || undefined,
  };
}

export const BookingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [schedules, setSchedules] = useState<DaySchedule[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [bookings, setBookings] = useState<ClientBooking[]>([]);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdminMode, setAdminMode] = useState(false);

  const refreshAvailability = useCallback(async () => {
    try {
      const data = await request<{ schedules: DaySchedule[]; services: any[] }>('/api/availability');
      setSchedules(data.schedules || []);
      setServices((data.services || []).map(serviceFromApi));
      setIsDbConnected(true);
      setDbError(null);
    } catch (error: any) {
      console.error('Availability load failed:', error);
      setIsDbConnected(false);
      setDbError(error?.message || 'Disponibilité indisponible');
    }
  }, []);

  const refreshAdminBookings = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await request<{ bookings: ClientBooking[] }>('/api/admin/bookings');
      setBookings(data.bookings || []);
    } catch (error: any) {
      if (error?.status === 401) {
        setIsAuthenticated(false);
        setAdminMode(false);
      }
      console.error('Admin booking load failed:', error);
      setDbError(error?.message || 'Réservations indisponibles');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refreshAvailability();
    request('/api/admin/me').then(() => setIsAuthenticated(true)).catch(() => undefined);
  }, [refreshAvailability]);

  useEffect(() => {
    if (isAuthenticated) refreshAdminBookings();
    else setBookings([]);
  }, [isAuthenticated, refreshAdminBookings]);

  const addBooking = async (booking: ClientBooking) => {
    if (!booking.startAt) throw new Error('Créneau invalide');
    const manageToken = newRequestKey() + newRequestKey().replaceAll('-', '');
    const data = await request<{ booking: any }>('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        firstName: booking.client.firstName,
        lastName: booking.client.lastName,
        phone: booking.client.phone,
        serviceId: booking.service.id,
        startAt: booking.startAt,
        referralCode: booking.usedReferralCode,
        idempotencyKey: newRequestKey(),
        manageToken,
      }),
    });
    if (isAuthenticated) await refreshAdminBookings();
    await refreshAvailability();
    if (!data.booking) throw new Error('Réservation non confirmée');
    return data;
  };

  const addManualBooking = async (booking: ClientBooking) => {
    if (!booking.startAt) throw new Error('Créneau invalide');
    await request('/api/admin/bookings', {
      method: 'POST',
      body: JSON.stringify({
        firstName: booking.client.firstName,
        lastName: booking.client.lastName,
        phone: booking.client.phone,
        serviceId: booking.service.id,
        startAt: booking.startAt,
      }),
    });
    await refreshAdminBookings();
    await refreshAvailability();
  };

  const manageBooking = async (token: string, action: 'lookup' | 'cancel') => {
    const data = await request<{ booking: any }>('/api/manage-booking', {
      method: 'POST',
      body: JSON.stringify({ token, action }),
    });
    return data.booking;
  };

  const deleteBooking = async (bookingId: string) => {
    await request(`/api/admin/bookings?id=${encodeURIComponent(bookingId)}`, { method: 'DELETE' });
    await refreshAdminBookings();
    await refreshAvailability();
  };

  const updateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    await request('/api/admin/bookings', { method: 'PATCH', body: JSON.stringify({ id: bookingId, status }) });
    await refreshAdminBookings();
    await refreshAvailability();
  };

  const toggleSlotAvailability = async (date: string, slotId: string) => {
    const slot = schedules.find((schedule) => schedule.date === date)?.slots.find((item) => item.id === slotId);
    if (!slot?.startAt) throw new Error('Créneau invalide');
    await request('/api/admin/blocked-slots', {
      method: 'POST',
      body: JSON.stringify({ startAt: slot.startAt }),
    });
    await refreshAvailability();
  };

  const getBookingsForDate = (date: string) => bookings.filter((booking) => booking.date === date);

  const getClientVisitCount = (phone: string) => {
    const target = cleanPhone(phone);
    if (!target) return 0;
    return bookings.filter((booking) => booking.status === 'completed' && cleanPhone(booking.client.phone) === target).length;
  };

  const lookupCustomerRewards = async (phone: string) => {
    if (!isAuthenticated) throw new Error('Session administrateur requise');
    const data = await request<{ summary: CustomerRewardSummary }>(`/api/admin/rewards?phone=${encodeURIComponent(phone)}`);
    return data.summary;
  };

  const redeemReferralRewards = async (targetBookingId: string, customerId: string) => {
    await request('/api/admin/rewards', {
      method: 'POST',
      body: JSON.stringify({ action: 'referral', customerId, appointmentId: targetBookingId }),
    });
    await refreshAdminBookings();
  };

  const applyLoyaltyFreeCut = async (bookingId: string) => {
    await request('/api/admin/rewards', {
      method: 'POST',
      body: JSON.stringify({ action: 'loyalty', appointmentId: bookingId }),
    });
    await refreshAdminBookings();
  };

  const registerAffiliateCode = async (phone: string, code: string) => {
    if (!isAuthenticated) return false;
    try {
      await request('/api/admin/referral-codes', { method: 'POST', body: JSON.stringify({ phone, code }) });
      await refreshAdminBookings();
      return true;
    } catch {
      return false;
    }
  };

  const authenticate = async (email: string, password: string) => {
    try {
      await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setIsAuthenticated(true);
      setAdminMode(true);
      return true;
    } catch {
      return false;
    }
  };

  const logout = async () => {
    await request('/api/admin/logout', { method: 'POST' }).catch(() => undefined);
    setIsAuthenticated(false);
    setAdminMode(false);
    setBookings([]);
  };

  const getFormattedDate = (dateStr: string) => {
    const date = new Date(`${dateStr}T12:00:00`);
    return {
      day: new Intl.DateTimeFormat('fr-FR', { day: 'numeric' }).format(date),
      month: new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(date),
      weekday: new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(date),
    };
  };

  const value = useMemo<BookingContextType>(() => ({
    schedules,
    services,
    bookings,
    addBooking,
    addManualBooking,
    lookupManagedBooking: (token: string) => manageBooking(token, 'lookup'),
    cancelManagedBooking: (token: string) => manageBooking(token, 'cancel'),
    recordSmsDraftOpened: async (token: string) => {
      await request('/api/manage-booking', { method: 'POST', body: JSON.stringify({ token, action: 'sms_draft_opened' }) });
    },
    recordAdminSmsDraftOpened: async (bookingId: string) => {
      await request('/api/admin/appointment-events', {
        method: 'POST',
        body: JSON.stringify({ bookingId, eventType: 'confirmation_sms_draft_opened' }),
      });
    },
    deleteBooking,
    updateBookingStatus,
    getBookingsForDate,
    getClientVisitCount,
    toggleSlotAvailability,
    isAdminMode,
    setAdminMode,
    isAuthenticated,
    authenticate,
    logout,
    getFormattedDate,
    lookupCustomerRewards,
    redeemReferralRewards,
    applyLoyaltyFreeCut,
    registerAffiliateCode,
    isDbConnected,
    dbError,
    initializeDb: refreshAvailability,
    refreshData: async () => {
      await refreshAvailability();
      await refreshAdminBookings();
    },
  }), [schedules, services, bookings, isAdminMode, isAuthenticated, isDbConnected, dbError, refreshAvailability, refreshAdminBookings]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
};

export const useBooking = () => {
  const context = useContext(BookingContext);
  if (!context) throw new Error('useBooking must be used within a BookingProvider');
  return context;
};
