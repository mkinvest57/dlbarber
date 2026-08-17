
export interface Haircut {
  id: number;
  title: string;
  category: string;
  image: string;
}

export interface BookingForm {
  firstName: string;
  lastName: string;
  phone: string;
}

export type SlotStatus = 'Prime' | 'Open' | 'Peak' | 'Booked';
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'rejected' | 'no_show' | 'walk-in';

export interface TimeSlot {
  id: string;
  time: string;
  startAt?: string;
  status: SlotStatus;
  isAvailable: boolean;
  availableServiceIds?: string[];
  isAdminBlocked?: boolean;
  unavailableReason?: 'past' | 'booked' | 'blocked' | 'closed';
}

export interface DaySchedule {
  date: string; // ISO Date String YYYY-MM-DD
  slots: TimeSlot[];
}

export interface ServiceItem {
  id: string;
  name: string;
  duration: string;
  price: string;
  note?: string;
}

export interface ServiceCategory {
  category: string;
  items: ServiceItem[];
}

export interface ClientBooking {
  id: string;
  date: string;
  slotId: string;
  time: string;
  startAt?: string;
  endAt?: string;
  service: ServiceItem;
  client: BookingForm;
  status: BookingStatus;
  customerId?: string;
  referrerPhone?: string; // Legacy: kept for compatibility
  usedReferralCode?: string; // The 4-digit code used by this client
  referralClaimed?: boolean; // True if the referrer has used the reward
  referralDiscountCents?: number;
  loyaltyDiscountCents?: number;
  loyaltyVisitNumber?: number;
  basePriceCents?: number;
  currentPriceCents?: number;
}

export interface CustomerRewardSummary {
  customerId: string;
  firstName: string;
  lastName: string;
  referralCode: string | null;
  referralBalanceCents: number;
  completedVisits: number;
  nextLoyaltyVisit: number;
  loyaltyEligible: boolean;
}
