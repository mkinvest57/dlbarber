import React, { useMemo, useState } from 'react';
import {
  Ban,
  CalendarDays,
  CheckCircle,
  CircleDollarSign,
  Gift,
  LogOut,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Star,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { useBooking } from '../BookingContext';
import { BookingStatus, ClientBooking, CustomerRewardSummary } from '../types';

const ACTIVE_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'walk-in'];

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  completed: 'Terminé',
  cancelled: 'Annulé',
  rejected: 'Refusé',
  no_show: 'Absent',
  'walk-in': 'Passage',
};

const STATUS_STYLE: Record<BookingStatus, string> = {
  pending: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  confirmed: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  completed: 'border-green-500/30 bg-green-500/10 text-green-400',
  cancelled: 'border-white/10 bg-white/5 text-white/40',
  rejected: 'border-red-500/30 bg-red-500/10 text-red-400',
  no_show: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  'walk-in': 'border-purple-500/30 bg-purple-500/10 text-purple-400',
};

function money(cents: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Une erreur est survenue.';
  const messages: Record<string, string> = {
    slot_unavailable: 'Ce créneau est déjà occupé.',
    invalid_status_change: 'Ce changement de statut n’est pas autorisé.',
    reward_unavailable: 'Cette récompense n’est pas disponible pour ce rendez-vous.',
    customer_not_found: 'Aucun client ne correspond à ce numéro.',
    rewards_unavailable: 'Le solde fidélité est momentanément indisponible.',
  };
  return messages[error.message] || error.message;
}

function confirmationSmsUrl(booking: ClientBooking) {
  const appointmentDate = booking.startAt
    ? new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'Europe/Paris',
      }).format(new Date(booking.startAt))
    : `${booking.date} à ${booking.time}`;
  const message = `Bonjour ${booking.client.firstName}, votre rendez-vous chez Daryl Barber est confirmé pour le ${appointmentDate}. À bientôt !`;
  const bodySeparator = /iPad|iPhone|iPod/i.test(navigator.userAgent) ? '&' : '?';
  return `sms:${booking.client.phone}${bodySeparator}body=${encodeURIComponent(message)}`;
}

export const AdminInterface = () => {
  const {
    isAdminMode,
    setAdminMode,
    isAuthenticated,
    authenticate,
    logout,
    schedules,
    services,
    bookings,
    getBookingsForDate,
    getFormattedDate,
    updateBookingStatus,
    deleteBooking,
    addManualBooking,
    toggleSlotAvailability,
    lookupCustomerRewards,
    redeemReferralRewards,
    applyLoyaltyFreeCut,
    registerAffiliateCode,
    recordAdminSmsDraftOpened,
    isDbConnected,
    refreshData,
  } = useBooking();

  const [loginCode, setLoginCode] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [view, setView] = useState<'schedule' | 'stats' | 'loyalty'>('schedule');
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [selectedBooking, setSelectedBooking] = useState<ClientBooking | null>(null);
  const [actionError, setActionError] = useState('');
  const [pendingAction, setPendingAction] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [manualSlotId, setManualSlotId] = useState<string | null>(null);
  const nextBookings = useMemo(() => bookings.filter((booking) => ACTIVE_STATUSES.includes(booking.status) && Date.parse(booking.startAt || '') >= Date.now()).sort((a, b) => Date.parse(a.startAt || '') - Date.parse(b.startAt || '')).slice(0, 4), [bookings]);
  const [manualFirstName, setManualFirstName] = useState('');
  const [manualLastName, setManualLastName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualServiceId, setManualServiceId] = useState('');

  const [scanPhone, setScanPhone] = useState('');
  const [rewardSummary, setRewardSummary] = useState<CustomerRewardSummary | null>(null);
  const [rewardError, setRewardError] = useState('');
  const [isRewardLoading, setIsRewardLoading] = useState(false);
  const [newReferralCode, setNewReferralCode] = useState('');

  const currentSchedule = schedules[selectedDateIndex] || { date: '', slots: [] };
  const dayBookings = currentSchedule.date ? getBookingsForDate(currentSchedule.date) : [];

  const stats = useMemo(() => {
    const now = Date.now();
    const month = new Date().toISOString().slice(0, 7);
    const completedThisMonth = bookings.filter((booking) => booking.status === 'completed' && booking.date.startsWith(month));
    return {
      pending: bookings.filter((booking) => booking.status === 'pending').length,
      upcoming: bookings.filter((booking) => ACTIVE_STATUSES.includes(booking.status) && Date.parse(booking.startAt || '') >= now).length,
      completed: bookings.filter((booking) => booking.status === 'completed').length,
      revenue: completedThisMonth.reduce((total, booking) => total + (booking.currentPriceCents || 0), 0),
    };
  }, [bookings]);

  const rewardBookings = useMemo(() => {
    if (!rewardSummary) return [];
    return bookings
      .filter((booking) => booking.customerId === rewardSummary.customerId && ACTIVE_STATUSES.includes(booking.status))
      .sort((a, b) => Date.parse(a.startAt || '') - Date.parse(b.startAt || ''));
  }, [bookings, rewardSummary]);

  if (!isAdminMode) return null;

  const runAction = async (name: string, action: () => Promise<void>) => {
    setPendingAction(name);
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(errorMessage(error));
      throw error;
    } finally {
      setPendingAction('');
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoginSubmitting(true);
    setLoginError('');
    const valid = await authenticate(loginCode);
    if (!valid) setLoginError('Code invalide. Réessaie dans quelques minutes.');
    setIsLoginSubmitting(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setActionError('');
    try {
      await refreshData();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStatus = async (status: BookingStatus) => {
    if (!selectedBooking) return;
    const booking = selectedBooking;
    try {
      await runAction(`status-${status}`, () => updateBookingStatus(booking.id, status));
      if (status === 'confirmed') {
        setSelectedBooking({ ...booking, status });
        await recordAdminSmsDraftOpened(booking.id).catch(() => undefined);
        try {
          window.location.assign(confirmationSmsUrl(booking));
        } catch {
          // The confirmed booking remains open with a manual SMS fallback.
        }
        return;
      }
      setSelectedBooking(null);
    } catch {
      // The modal stays open so the operator can retry.
    }
  };

  const handleCancel = async () => {
    if (!selectedBooking || !window.confirm('Annuler ce rendez-vous ?')) return;
    try {
      await runAction('cancel', () => deleteBooking(selectedBooking.id));
      setSelectedBooking(null);
    } catch {
      // The modal stays open so the operator can retry.
    }
  };

  const openManualBooking = (slotId: string, availableServiceIds?: string[]) => {
    const firstService = services.find((service) => !availableServiceIds || availableServiceIds.includes(service.id));
    if (!firstService) return;
    setManualServiceId(firstService.id);
    setManualSlotId(slotId);
    setActionError('');
  };

  const handleManualBooking = async (event: React.FormEvent) => {
    event.preventDefault();
    const slot = currentSchedule.slots.find((item) => item.id === manualSlotId);
    const service = services.find((item) => item.id === manualServiceId);
    if (!slot?.startAt || !service) return;
    try {
      await runAction('manual-booking', () => addManualBooking({
        id: 'pending',
        date: currentSchedule.date,
        slotId: slot.id,
        time: slot.time,
        startAt: slot.startAt,
        service,
        client: { firstName: manualFirstName, lastName: manualLastName, phone: manualPhone },
        status: 'walk-in',
      }));
      setManualSlotId(null);
      setManualFirstName('');
      setManualLastName('');
      setManualPhone('');
    } catch {
      // Error is shown in the modal.
    }
  };

  const refreshRewards = async () => {
    setIsRewardLoading(true);
    setRewardError('');
    try {
      setRewardSummary(await lookupCustomerRewards(scanPhone));
    } catch (error) {
      setRewardSummary(null);
      setRewardError(errorMessage(error));
    } finally {
      setIsRewardLoading(false);
    }
  };

  const applyReward = async (kind: 'referral' | 'loyalty', booking: ClientBooking) => {
    if (!rewardSummary) return;
    const prompt = kind === 'referral'
      ? `Appliquer jusqu’à ${money(rewardSummary.referralBalanceCents)} de crédit à ce rendez-vous ?`
      : 'Appliquer la coupe fidélité offerte à ce rendez-vous ?';
    if (!window.confirm(prompt)) return;
    setRewardError('');
    try {
      if (kind === 'referral') await redeemReferralRewards(booking.id, rewardSummary.customerId);
      else await applyLoyaltyFreeCut(booking.id);
      await refreshRewards();
    } catch (error) {
      setRewardError(errorMessage(error));
    }
  };

  const createReferralCode = async () => {
    if (!/^[A-Z0-9]{4}$/.test(newReferralCode)) return;
    setRewardError('');
    const created = await registerAffiliateCode(scanPhone, newReferralCode);
    if (!created) {
      setRewardError('Ce code est invalide ou déjà utilisé.');
      return;
    }
    setNewReferralCode('');
    await refreshRewards();
  };

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-6" role="dialog" aria-modal="true" aria-labelledby="admin-login-title">
        <button type="button" onClick={() => setAdminMode(false)} aria-label="Fermer" className="absolute right-5 top-5 p-3 text-white/50 hover:text-white focus-visible:ring-2 focus-visible:ring-apple-blue">
          <X className="h-6 w-6" aria-hidden="true" />
        </button>
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-5 rounded-lg border border-white/10 bg-[#111] p-6">
          <div>
            <h2 id="admin-login-title" className="font-space text-2xl font-bold text-white">Accès administrateur</h2>
            <p className="mt-2 text-sm text-white/40">Code d’accès professionnel</p>
          </div>
          <label className="block text-xs text-white/50">Code d’accès
            <input type="password" inputMode="numeric" pattern="[0-9]{4}" required minLength={4} maxLength={4} autoComplete="one-time-code" value={loginCode} onChange={(event) => setLoginCode(event.target.value.replace(/\D/g, '').slice(0, 4))} className="mt-2 w-full rounded border border-white/20 bg-black p-3 text-center font-mono text-xl tracking-[0.3em] text-white outline-none focus-visible:ring-2 focus-visible:ring-apple-blue" />
          </label>
          {loginError && <p role="alert" className="text-sm text-red-400">{loginError}</p>}
          <button type="submit" disabled={isLoginSubmitting} className="w-full rounded bg-white py-3 text-sm font-bold uppercase text-black disabled:opacity-50">
            {isLoginSubmitting ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#090909] text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-apple-blue"><Settings className="h-4 w-4" aria-hidden="true" /></span>
          <div>
            <h1 className="font-space text-lg font-bold">Administration</h1>
            <span className={`text-[10px] font-bold uppercase ${isDbConnected ? 'text-green-400' : 'text-red-400'}`}>{isDbConnected ? 'Synchronisé' : 'Indisponible'}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleRefresh} disabled={isRefreshing} aria-label="Actualiser" title="Actualiser" className="flex h-10 w-10 items-center justify-center rounded-md bg-white/5 text-white/60 hover:text-white disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          <button type="button" onClick={logout} aria-label="Se déconnecter" title="Se déconnecter" className="flex h-10 w-10 items-center justify-center rounded-md bg-white/5 text-white/60 hover:bg-red-500/10 hover:text-red-400">
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <nav className="grid grid-cols-3 gap-1 border-b border-white/10 bg-black p-2" aria-label="Vues administrateur">
        {([
          ['schedule', CalendarDays, 'Planning'],
          ['stats', CircleDollarSign, 'Activité'],
          ['loyalty', Gift, 'Fidélité'],
        ] as const).map(([id, Icon, label]) => (
          <button key={id} type="button" onClick={() => setView(id)} aria-pressed={view === id} className={`flex items-center justify-center gap-2 rounded-md py-2 text-xs font-bold uppercase ${view === id ? 'bg-white text-black' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
          </button>
        ))}
      </nav>

      {actionError && <p role="alert" className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-300">{actionError}</p>}

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        {view === 'schedule' && (
          <div className="mx-auto max-w-3xl">
            {nextBookings.length > 0 && <div className="mb-5 border border-orange-500/30 bg-orange-500/10 p-3"><div className="mb-2 text-xs font-bold uppercase text-orange-300">Prochains rendez-vous à traiter</div><div className="grid gap-2 sm:grid-cols-2">{nextBookings.map((booking) => <button key={booking.id} type="button" onClick={() => setSelectedBooking(booking)} className="flex items-center justify-between bg-black/40 p-3 text-left"><span><b className="block text-sm">{booking.client.firstName} {booking.client.lastName}</b><span className="text-xs text-white/50">{booking.service.name}</span></span><b className="font-mono text-sm text-orange-300">{booking.time}</b></button>)}</div></div>}
            <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
              {schedules.map((schedule, index) => {
                const date = getFormattedDate(schedule.date);
                return (
                  <button key={schedule.date} type="button" onClick={() => setSelectedDateIndex(index)} className={`h-16 min-w-[64px] rounded-md border text-center ${selectedDateIndex === index ? 'border-apple-blue bg-blue-500/10 text-white' : 'border-white/10 bg-white/[0.03] text-white/40'}`}>
                    <span className="block text-[9px] uppercase">{date.weekday}</span>
                    <strong className="text-lg">{date.day}</strong>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              {currentSchedule.slots.map((slot) => {
                const startingBooking = dayBookings.find((booking) => booking.time === slot.time);
                const slotStart = Date.parse(slot.startAt || '');
                const coveringBooking = dayBookings.find((booking) => ACTIVE_STATUSES.includes(booking.status)
                  && Date.parse(booking.startAt || '') < slotStart + 15 * 60_000
                  && Date.parse(booking.endAt || booking.startAt || '') > slotStart);
                const canBlock = Boolean(slot.startAt && !coveringBooking && (slot.isAvailable || slot.isAdminBlocked));
                const canBook = Boolean(slot.startAt && slot.isAvailable && slot.availableServiceIds?.length !== 0);
                return (
                  <div key={slot.id} className={`grid min-h-[64px] grid-cols-[52px_1fr_auto] items-center gap-3 rounded-md border px-3 py-2 ${coveringBooking ? 'border-blue-500/20 bg-blue-500/5' : slot.isAdminBlocked ? 'border-red-500/20 bg-red-500/5' : 'border-white/5 bg-black'}`}>
                    <span className="font-mono text-xs text-white/50">{slot.time}</span>
                    {startingBooking ? (
                      <button type="button" onClick={() => setSelectedBooking(startingBooking)} className="min-w-0 text-left focus-visible:ring-2 focus-visible:ring-apple-blue">
                        <span className="block truncate text-sm font-bold">{startingBooking.client.firstName} {startingBooking.client.lastName}</span>
                        <span className="block truncate text-[10px] text-white/40">{startingBooking.service.name} · {STATUS_LABEL[startingBooking.status]}</span>
                      </button>
                    ) : (
                      <span className="text-[10px] uppercase text-white/30">{coveringBooking ? 'Occupé' : slot.isAdminBlocked ? 'Bloqué' : slot.unavailableReason === 'past' ? 'Passé' : slot.isAvailable ? 'Libre' : 'Fermé'}</span>
                    )}
                    <div className="flex gap-1">
                      {canBlock && (
                        <button type="button" onClick={() => runAction(`block-${slot.id}`, () => toggleSlotAvailability(currentSchedule.date, slot.id)).catch(() => undefined)} disabled={Boolean(pendingAction)} aria-label={slot.isAdminBlocked ? `Débloquer ${slot.time}` : `Bloquer ${slot.time}`} title={slot.isAdminBlocked ? 'Débloquer' : 'Bloquer'} className={`flex h-9 w-9 items-center justify-center rounded-md ${slot.isAdminBlocked ? 'bg-red-500 text-white' : 'bg-white/5 text-white/40 hover:text-white'}`}>
                          <Ban className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                      {canBook && !coveringBooking && (
                        <button type="button" onClick={() => openManualBooking(slot.id, slot.availableServiceIds)} aria-label={`Ajouter un rendez-vous à ${slot.time}`} title="Ajouter un rendez-vous" className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-white/40 hover:bg-white hover:text-black">
                          <UserPlus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'stats' && (
          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [Users, 'À venir', stats.upcoming.toString()],
              [CalendarDays, 'En attente', stats.pending.toString()],
              [CheckCircle, 'Terminés', stats.completed.toString()],
              [CircleDollarSign, 'CA du mois', money(stats.revenue)],
            ].map(([Icon, label, value]) => {
              const StatIcon = Icon as typeof Users;
              return (
                <div key={label as string} className="rounded-md border border-white/10 bg-[#111] p-4">
                  <StatIcon className="mb-5 h-5 w-5 text-white/40" aria-hidden="true" />
                  <strong className="block font-space text-2xl">{value as string}</strong>
                  <span className="text-[10px] uppercase text-white/40">{label as string}</span>
                </div>
              );
            })}
          </div>
        )}

        {view === 'loyalty' && (
          <div className="mx-auto max-w-xl space-y-4">
            <form onSubmit={(event) => { event.preventDefault(); refreshRewards(); }} className="flex gap-2 rounded-md border border-white/10 bg-[#111] p-3">
              <label className="sr-only" htmlFor="reward-phone">Téléphone du client</label>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" aria-hidden="true" />
                <input id="reward-phone" type="tel" required autoComplete="tel" inputMode="tel" value={scanPhone} onChange={(event) => { setScanPhone(event.target.value); setRewardSummary(null); setRewardError(''); }} placeholder="Téléphone du client" className="w-full rounded border border-white/10 bg-black py-3 pl-10 pr-3 text-white outline-none focus-visible:ring-2 focus-visible:ring-apple-blue" />
              </div>
              <button type="submit" disabled={isRewardLoading} className="rounded bg-white px-4 text-xs font-bold uppercase text-black disabled:opacity-50">{isRewardLoading ? '…' : 'Chercher'}</button>
            </form>
            {rewardError && <p role="alert" className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{rewardError}</p>}

            {rewardSummary && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-white/10 bg-[#111] p-4">
                    <Star className={`mb-4 h-5 w-5 ${rewardSummary.loyaltyEligible ? 'fill-yellow-400 text-yellow-400' : 'text-white/30'}`} aria-hidden="true" />
                    <strong className="block text-2xl">{rewardSummary.completedVisits % 8} / 8</strong>
                    <span className="text-[10px] uppercase text-white/40">Prochaine coupe n° {rewardSummary.nextLoyaltyVisit}</span>
                  </div>
                  <div className="rounded-md border border-white/10 bg-[#111] p-4">
                    <Gift className="mb-4 h-5 w-5 text-apple-blue" aria-hidden="true" />
                    <strong className="block text-2xl text-apple-blue">{money(rewardSummary.referralBalanceCents)}</strong>
                    <span className="text-[10px] uppercase text-white/40">Crédit parrainage</span>
                  </div>
                </div>

                <div className="rounded-md border border-white/10 bg-[#111] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">{rewardSummary.firstName} {rewardSummary.lastName}</p>
                      <p className="text-xs text-white/40">Code ambassadeur : {rewardSummary.referralCode || 'non créé'}</p>
                    </div>
                    {!rewardSummary.referralCode && (
                      <div className="flex gap-1">
                        <input aria-label="Nouveau code ambassadeur" maxLength={4} value={newReferralCode} onChange={(event) => setNewReferralCode(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} className="w-20 rounded border border-white/10 bg-black p-2 text-center font-mono uppercase outline-none focus-visible:ring-2 focus-visible:ring-apple-blue" />
                        <button type="button" onClick={createReferralCode} disabled={!/^[A-Z0-9]{4}$/.test(newReferralCode)} aria-label="Créer le code" title="Créer le code" className="flex h-10 w-10 items-center justify-center rounded bg-white text-black disabled:opacity-30"><Plus className="h-4 w-4" aria-hidden="true" /></button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-xs font-bold uppercase text-white/40">Rendez-vous éligibles</h2>
                  {rewardBookings.length === 0 && <p className="rounded-md border border-white/10 p-4 text-sm text-white/40">Aucun rendez-vous actif.</p>}
                  {rewardBookings.map((booking) => (
                    <div key={booking.id} className="rounded-md border border-white/10 bg-[#111] p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div><p className="text-sm font-bold">{booking.date} à {booking.time}</p><p className="text-xs text-white/40">{booking.service.name}</p></div>
                        <strong>{money(booking.currentPriceCents || 0)}</strong>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => applyReward('referral', booking)} disabled={booking.status === 'pending' || rewardSummary.referralBalanceCents <= 0 || (booking.loyaltyDiscountCents || 0) > 0} className="rounded border border-blue-500/30 bg-blue-500/10 py-2 text-xs font-bold text-blue-400 disabled:opacity-30">Utiliser le crédit</button>
                        <button type="button" onClick={() => applyReward('loyalty', booking)} disabled={booking.status === 'pending' || !rewardSummary.loyaltyEligible || (booking.referralDiscountCents || 0) > 0} className="rounded border border-yellow-500/30 bg-yellow-500/10 py-2 text-xs font-bold text-yellow-400 disabled:opacity-30">Coupe offerte</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {manualSlotId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="manual-title">
          <form onSubmit={handleManualBooking} className="w-full max-w-sm space-y-4 rounded-lg border border-white/10 bg-[#111] p-5">
            <div className="flex items-center justify-between"><h2 id="manual-title" className="font-space text-lg font-bold">Rendez-vous manuel</h2><button type="button" onClick={() => setManualSlotId(null)} aria-label="Fermer" className="p-2 text-white/40 hover:text-white"><X className="h-5 w-5" aria-hidden="true" /></button></div>
            {actionError && <p role="alert" className="text-sm text-red-400">{actionError}</p>}
            <label className="block text-xs text-white/50">Prénom<input autoFocus required autoComplete="given-name" value={manualFirstName} onChange={(event) => setManualFirstName(event.target.value)} className="mt-1 w-full rounded border border-white/20 bg-black p-3 text-white outline-none focus-visible:ring-2 focus-visible:ring-apple-blue" /></label>
            <label className="block text-xs text-white/50">Nom<input required autoComplete="family-name" value={manualLastName} onChange={(event) => setManualLastName(event.target.value)} className="mt-1 w-full rounded border border-white/20 bg-black p-3 text-white outline-none focus-visible:ring-2 focus-visible:ring-apple-blue" /></label>
            <label className="block text-xs text-white/50">Téléphone<input required type="tel" autoComplete="tel" inputMode="tel" value={manualPhone} onChange={(event) => setManualPhone(event.target.value)} className="mt-1 w-full rounded border border-white/20 bg-black p-3 text-white outline-none focus-visible:ring-2 focus-visible:ring-apple-blue" /></label>
            <label className="block text-xs text-white/50">Service<select required value={manualServiceId} onChange={(event) => setManualServiceId(event.target.value)} className="mt-1 w-full rounded border border-white/20 bg-black p-3 text-white outline-none focus-visible:ring-2 focus-visible:ring-apple-blue">{services.filter((service) => currentSchedule.slots.find((slot) => slot.id === manualSlotId)?.availableServiceIds?.includes(service.id) !== false).map((service) => <option key={service.id} value={service.id}>{service.name} · {service.price}</option>)}</select></label>
            <button type="submit" disabled={pendingAction === 'manual-booking'} className="w-full rounded bg-white py-3 text-sm font-bold uppercase text-black disabled:opacity-50">{pendingAction === 'manual-booking' ? 'Enregistrement…' : 'Ajouter'}</button>
          </form>
        </div>
      )}

      {selectedBooking && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="booking-detail-title">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-white/10 bg-[#111]">
            <header className="flex items-start justify-between border-b border-white/10 p-5">
              <div><p className="mb-1 text-[10px] uppercase text-white/40">{selectedBooking.date} · {selectedBooking.time}</p><h2 id="booking-detail-title" className="font-space text-xl font-bold">{selectedBooking.client.firstName} {selectedBooking.client.lastName}</h2></div>
              <button type="button" onClick={() => setSelectedBooking(null)} aria-label="Fermer" className="p-2 text-white/40 hover:text-white"><X className="h-5 w-5" aria-hidden="true" /></button>
            </header>
            <div className="space-y-4 overflow-y-auto p-5">
              {actionError && <p role="alert" className="rounded border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{actionError}</p>}
              <span className={`inline-flex rounded border px-2 py-1 text-[10px] font-bold uppercase ${STATUS_STYLE[selectedBooking.status]}`}>{STATUS_LABEL[selectedBooking.status]}</span>
              <div className="rounded-md border border-white/10 bg-black p-4"><p className="text-xs text-white/40">Service</p><p className="font-bold">{selectedBooking.service.name} · {selectedBooking.service.price}</p></div>
              <a href={`tel:${selectedBooking.client.phone}`} className="flex items-center gap-3 rounded-md border border-white/10 bg-black p-4 hover:border-white/20"><Phone className="h-4 w-4 text-white/40" aria-hidden="true" /><span>{selectedBooking.client.phone}</span></a>
              {selectedBooking.status === 'confirmed' && (
                <a
                  href={confirmationSmsUrl(selectedBooking)}
                  onClick={() => { recordAdminSmsDraftOpened(selectedBooking.id).catch(() => undefined); }}
                  className="flex items-center justify-center gap-2 rounded bg-white p-3 text-sm font-bold text-black"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  Ouvrir le SMS de confirmation
                </a>
              )}
            </div>
            {ACTIVE_STATUSES.includes(selectedBooking.status) && (
              <footer className="grid grid-cols-2 gap-2 border-t border-white/10 bg-black p-4">
                {selectedBooking.status === 'pending' && <><button type="button" onClick={() => handleStatus('rejected')} disabled={Boolean(pendingAction)} className="rounded border border-red-500/30 py-3 text-xs font-bold text-red-400 disabled:opacity-50"><XCircle className="mr-1 inline h-4 w-4" aria-hidden="true" />Refuser</button><button type="button" onClick={() => handleStatus('confirmed')} disabled={Boolean(pendingAction)} className="rounded bg-white py-3 text-xs font-bold text-black disabled:opacity-50"><CheckCircle className="mr-1 inline h-4 w-4" aria-hidden="true" />Confirmer</button></>}
                {(selectedBooking.status === 'confirmed' || selectedBooking.status === 'walk-in') && <><button type="button" onClick={() => handleStatus('no_show')} disabled={Boolean(pendingAction)} className="rounded border border-yellow-500/30 py-3 text-xs font-bold text-yellow-400 disabled:opacity-50">Absent</button><button type="button" onClick={() => handleStatus('completed')} disabled={Boolean(pendingAction)} className="rounded bg-green-500 py-3 text-xs font-bold text-black disabled:opacity-50"><CheckCircle className="mr-1 inline h-4 w-4" aria-hidden="true" />Terminé</button></>}
                <button type="button" onClick={handleCancel} disabled={Boolean(pendingAction)} className="col-span-2 rounded border border-white/10 py-3 text-xs font-bold text-white/50 hover:text-red-400 disabled:opacity-50">Annuler le rendez-vous</button>
              </footer>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
