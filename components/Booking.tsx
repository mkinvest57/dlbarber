
import React, { useState, useEffect } from 'react';
import { useBooking } from '../BookingContext';
import { ServiceItem, BookingForm } from '../types';
import { Star, ChevronLeft, Tag, Clock, CheckCircle, MessageSquare } from 'lucide-react';

const DARYL_PHONE = '+33611584979';

function formatFrenchAppointmentDate(startAt: string | undefined, date: string, time: string) {
  if (startAt) {
    const parsed = new Date(startAt);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'Europe/Paris',
      }).format(parsed);
    }
  }
  return `${date} à ${time}`;
}

function createSmsMessage(firstName: string, lastName: string, service: string, startAt: string | undefined, date: string, time: string) {
  return [
    'Bonjour Daryl, je viens de faire une demande de rendez-vous sur dlbarber.fr.',
    '',
    `Service : ${service}`,
    `Date : ${formatFrenchAppointmentDate(startAt, date, time)}`,
    `Nom : ${firstName} ${lastName}`,
    '',
    'Merci de me confirmer le rendez-vous.',
  ].join('\n');
}

function createSmsUrl(message: string) {
  const bodySeparator = /iPad|iPhone|iPod/i.test(navigator.userAgent) ? '&' : '?';
  return `sms:${DARYL_PHONE}${bodySeparator}body=${encodeURIComponent(message)}`;
}

export const Booking = () => {
  const { schedules, services, getFormattedDate, addBooking, lookupManagedBooking, cancelManagedBooking, recordSmsDraftOpened, dbError, initializeDb } = useBooking();

  // -- State --
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [selectedDateIndex, setSelectedDateIndex] = useState<number>(0);

  // Time Selection State
  const [selectedHour, setSelectedHour] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const [guestForm, setGuestForm] = useState<BookingForm>({
    firstName: '',
    lastName: '',
    phone: ''
  });

  const [referralCode, setReferralCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [manageToken, setManageToken] = useState('');
  const [managedBooking, setManagedBooking] = useState<any>(null);
  const [copiedManageLink, setCopiedManageLink] = useState(false);
  const [smsDraftUrl, setSmsDraftUrl] = useState('');

  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const refCode = params.get('ref');
      if (refCode) {
          setReferralCode(refCode.toUpperCase());
      }
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('manage');
    if (!token) return;
    setManageToken(token);
    lookupManagedBooking(token)
      .then((booking) => { setManagedBooking(booking); setCurrentStep(5); requestAnimationFrame(() => document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth' })); })
      .catch(() => { setSubmitError('Ce lien de réservation est invalide ou expiré.'); setCurrentStep(5); });
  }, []);

  // -- Derived State --
  const currentSchedule = schedules[selectedDateIndex];
  const allSlots = currentSchedule?.slots || [];
  const isAvailableForService = (slot: (typeof allSlots)[number]) => slot.isAvailable
    && (!slot.availableServiceIds || !selectedService || slot.availableServiceIds.includes(selectedService.id));
  const uniqueHours = Array.from(new Set(allSlots.filter(isAvailableForService).map(s => s.time.split(':')[0])));

  // -- Handlers --
  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(prev => prev + 1);
    } else if (currentStep === 3) {
      handleConfirmBooking();
    }
  };

  const handleBack = () => {
    if (currentStep === 2 && selectedHour) {
        setSelectedHour(null);
        setSelectedSlotId(null);
        return;
    }
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedService || !currentSchedule || !selectedSlotId) return;

    const slot = allSlots.find(s => s.id === selectedSlotId);
    if (!slot) return;

    setIsSubmitting(true);
    setSubmitError('');
    try {
      const result = await addBooking({
      id: crypto.randomUUID(),
      date: currentSchedule.date,
      slotId: slot.id,
      time: slot.time,
      startAt: slot.startAt,
      service: selectedService,
      client: guestForm,
      status: 'pending',
      usedReferralCode: /^[A-Z0-9]{4}$/.test(referralCode) ? referralCode : undefined
      });
      setManageToken(result.manageToken);
      const smsMessage = createSmsMessage(
        guestForm.firstName,
        guestForm.lastName,
        selectedService.name,
        slot.startAt,
        currentSchedule.date,
        slot.time,
      );
      const nextSmsDraftUrl = createSmsUrl(smsMessage);
      setSmsDraftUrl(nextSmsDraftUrl);
      // The event is best-effort: the booking must remain successful if telemetry fails.
      await recordSmsDraftOpened(result.manageToken).catch(() => undefined);
      setCurrentStep(4);
      // Mobile browsers may block this after the async request; the visible button below
      // provides the same handoff as a reliable fallback.
      try {
        window.location.assign(nextSmsDraftUrl);
      } catch {
        // The reservation is already saved; keep the success screen and fallback link.
      }
    } catch (error: any) {
      setSubmitError(
        error?.code === 'slot_unavailable'
          ? 'Ce créneau vient d’être réservé. Choisissez-en un autre.'
          : error?.code === 'invalid_referral_code'
            ? 'Ce code parrain est invalide.'
            : error?.code === 'rate_limited'
              ? 'Trop de réservations ont été créées pour ce numéro. Réessayez plus tard.'
              : error?.message || 'La réservation n’a pas pu être enregistrée.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStepValid = () => {
    if (currentStep === 1) return !!selectedService;
    if (currentStep === 2) return !!selectedSlotId;
    if (currentStep === 3) {
        const isFormFilled = guestForm.firstName.length > 1 && guestForm.lastName.length > 1 && guestForm.phone.length > 9;
        const isCodeValid = referralCode.length === 0 || /^[A-Z0-9]{4}$/.test(referralCode);
        return isFormFilled && isCodeValid;
    }
    return false;
  };

  const copyManageLink = async () => {
    if (!manageToken || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#manage=${manageToken}`);
      setCopiedManageLink(true);
    } catch {
      setCopiedManageLink(false);
    }
  };

  const resetBooking = () => {
    setCurrentStep(1);
    setSelectedService(null);
    setSelectedSlotId(null);
    setSelectedHour(null);
    setReferralCode('');
    setGuestForm({ firstName: '', lastName: '', phone: '' });
    setManageToken('');
    setManagedBooking(null);
    setCopiedManageLink(false);
    setSmsDraftUrl('');
    setSubmitError('');
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  };


const styles = `
    .apple-glass {
        background: rgba(30, 30, 30, 0.6);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .apple-card {
        background: #1c1c1e;
        border-radius: 18px;
        transition: all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .apple-card:active {
        transform: scale(0.98);
    }

    .apple-card.selected {
        border-color: #0071e3;
        background: rgba(0, 113, 227, 0.15);
        box-shadow: 0 0 0 1px #0071e3;
    }

    .apple-input {
        background: transparent;
        border: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        transition: border-color 0.3s ease;
        border-radius: 0;
    }

    .apple-input:focus {
        border-color: #0071e3;
        outline: none;
    }

    .apple-btn {
        background: #0071e3;
        color: white;
        border-radius: 9999px;
        font-weight: 600;
        letter-spacing: -0.01em;
        transition: all 0.3s ease;
    }

    .apple-btn:hover:not(:disabled) {
        background: #0077ed;
        box-shadow: 0 4px 12px rgba(0, 113, 227, 0.3);
    }

    .apple-btn:disabled {
        background: #3a3a3c;
        color: rgba(255, 255, 255, 0.3);
        cursor: not-allowed;
    }

    .apple-btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: white;
        border-radius: 9999px;
        font-weight: 500;
    }

    /* Scrollbar invisible but functional */
    .scrollbar-hide::-webkit-scrollbar {
        display: none;
    }
    .scrollbar-hide {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .animate-enter {
        animation: fadeIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
    }
  `;

  return (
    <section id="booking" className="bg-black relative min-h-screen flex items-center justify-center py-20 px-4">
      <style>{styles}</style>

      <div className="w-full max-w-[460px] mx-auto relative z-10">

        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-4xl font-semibold tracking-tight text-white mb-2">Réservation.</h2>
          <p className="text-white/40 text-sm font-medium">L'excellence, simplement.</p>
        </div>

        {/* STEP 1: SERVICE */}
        {currentStep === 1 && (
          <div className="animate-enter space-y-4">
            <div className="flex justify-between items-center mb-4 px-1">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wide">01. Service</span>
            </div>
            {services.length === 0 && !dbError && <p className="text-center text-white/40 py-8" aria-live="polite">Chargement des services…</p>}
            {services.length === 0 && dbError && <div className="space-y-3 py-8 text-center"><p role="alert" className="text-sm text-red-300">Les réservations sont momentanément indisponibles.</p><button type="button" onClick={initializeDb} className="rounded border border-white/20 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-white/10">Réessayer</button></div>}
            {services.map((service) => (
                <button
                    type="button"
                    key={service.id}
                    className={`apple-card p-5 cursor-pointer flex justify-between items-center w-full text-left focus-visible:ring-2 focus-visible:ring-apple-blue ${selectedService?.id === service.id ? 'selected' : 'hover:bg-[#2c2c2e]'}`}
                    onClick={() => setSelectedService(service)}
                >
                    <div>
                        <h3 className="text-lg font-medium text-white mb-1">{service.name}</h3>
                        <p className="text-xs text-white/50">{service.note}</p>
                    </div>
                    <div className="text-white font-medium bg-white/10 px-3 py-1 rounded-full text-sm">
                        {service.price}
                    </div>
                </button>
            ))}
          </div>
        )}

        {/* STEP 2: DATE & TIME */}
        {currentStep === 2 && (
          <div className="animate-enter">
             <div className="flex justify-between items-center mb-4 px-1">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wide">02. Disponibilité</span>
            </div>

            {/* Date Strip */}
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-4 mb-4">
              {schedules.map((schedule, index) => {
                  const d = getFormattedDate(schedule.date);
                  const isSelected = selectedDateIndex === index;
                  return (
                      <button
                          type="button"
                          key={schedule.date}
                          className={`min-w-[70px] h-[85px] rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-colors border ${isSelected ? 'bg-white text-black border-white' : 'bg-[#1c1c1e] text-white/60 border-transparent hover:bg-[#2c2c2e]'}`}
                          onClick={() => {
                              setSelectedDateIndex(index);
                              setSelectedHour(null);
                              setSelectedSlotId(null);
                          }}
                      >
                          <span className="text-[10px] uppercase font-bold tracking-wider mb-1 opacity-60">{d.weekday}</span>
                          <span className="text-xl font-bold">{d.day}</span>
                          <span className="text-[10px] opacity-40 mt-1">{d.month}</span>
                      </button>
                  );
              })}
            </div>

            {/* Level 1: HOURS */}
            {!selectedHour && (
                <div className="animate-enter">
                    <p className="text-center text-white/30 text-xs mb-4 font-medium">Sélectionnez une heure</p>
                    <div className="grid grid-cols-4 gap-3">
                      {allSlots.length === 0 ? (
                          <div className="col-span-4 text-center py-10 text-white/30 text-sm">Aucun créneau ce jour</div>
                      ) : (
                          uniqueHours.map((hour) => {
                              const hasAvailability = allSlots.some(s => s.time.startsWith(hour) && isAvailableForService(s));
                              return (
                                  <button
                                      key={hour}
                                      disabled={!hasAvailability}
                                      onClick={() => hasAvailability && setSelectedHour(hour)}
                                      className={`py-3 rounded-xl text-sm font-medium transition-all ${
                                          hasAvailability
                                          ? 'bg-[#1c1c1e] text-white hover:bg-[#2c2c2e] hover:scale-105'
                                          : 'bg-[#1c1c1e]/30 text-white/10 cursor-not-allowed'
                                      }`}
                                  >
                                      {hour}h
                                  </button>
                              );
                          })
                      )}
                    </div>
                </div>
            )}

            {/* Level 2: MINUTES */}
            {selectedHour && (
                <div className="animate-enter">
                    <div className="flex items-center justify-between mb-6">
                        <button
                            onClick={() => { setSelectedHour(null); setSelectedSlotId(null); }}
                            className="flex items-center text-apple-blue text-sm font-medium hover:opacity-80 transition-opacity"
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" /> Retour
                        </button>
                        <span className="text-white font-bold text-lg">{selectedHour}h</span>
                        <div className="w-10"></div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {allSlots
                          .filter(s => s.time.startsWith(selectedHour))
                          .map((slot) => {
                            const isTaken = !isAvailableForService(slot);
                            return (
                                <button
                                    key={slot.id}
                                    disabled={isTaken}
                                    className={`py-4 rounded-xl text-sm font-medium border transition-all ${
                                        selectedSlotId === slot.id
                                        ? 'bg-apple-blue border-apple-blue text-white shadow-lg'
                                        : isTaken
                                            ? 'bg-[#1c1c1e]/30 border-transparent text-white/10 cursor-not-allowed'
                                            : 'bg-[#1c1c1e] border-transparent text-white hover:bg-[#2c2c2e]'
                                    }`}
                                    onClick={() => !isTaken && setSelectedSlotId(slot.id)}
                                >
                                    {slot.time}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
          </div>
        )}

        {/* STEP 3: INFO */}
        {currentStep === 3 && (
          <div className="animate-enter space-y-6">
             <div className="flex justify-between items-center mb-4 px-1">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wide">03. Coordonnées</span>
            </div>

            {submitError && <p role="alert" aria-live="polite" className="text-red-400 text-sm">{submitError}</p>}
            <div className="space-y-5">
                <div className="group">
                    <input
                        type="text"
                        aria-label="Prénom"
                        autoComplete="given-name"
                        placeholder="Prénom…"
                        value={guestForm.firstName}
                        onChange={(e) => setGuestForm({...guestForm, firstName: e.target.value})}
                        className="apple-input w-full py-3 text-lg text-white placeholder:text-white/20"
                    />
                </div>
                <div className="group">
                    <input
                        type="text"
                        aria-label="Nom"
                        autoComplete="family-name"
                        placeholder="Nom…"
                        value={guestForm.lastName}
                        onChange={(e) => setGuestForm({...guestForm, lastName: e.target.value})}
                        className="apple-input w-full py-3 text-lg text-white placeholder:text-white/20"
                    />
                </div>
                <div className="group">
                    <input
                        type="tel"
                        aria-label="Téléphone"
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="Téléphone…"
                        value={guestForm.phone}
                        onChange={(e) => setGuestForm({...guestForm, phone: e.target.value})}
                        className="apple-input w-full py-3 text-lg text-white placeholder:text-white/20"
                    />
                </div>

                {/* Referral */}
                <div className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Tag className="w-4 h-4 text-white/40" />
                        <span className="text-xs text-white/40 font-medium uppercase tracking-wide">Code Parrain (Optionnel)</span>
                    </div>
                    <div className="relative">
                        <input
                            type="text"
                            maxLength={4}
                            aria-label="Code parrain"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="ex. LUC4…"
                            value={referralCode}
                            onChange={(e) => setReferralCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())}
                            className="w-full bg-[#1c1c1e] rounded-xl py-3 px-4 text-white text-center tracking-[0.2em] font-medium border border-white/10 focus:border-apple-blue outline-none transition-colors"
                        />
                        {referralCode.length === 4 && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <span className="text-[10px] text-green-500 font-bold bg-green-500/10 px-2 py-1 rounded">Format OK</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
          </div>
        )}

        {/* STEP 4: SUCCESS */}
        {currentStep === 4 && (
          <div className="animate-enter text-center pt-8">
            <div className="w-20 h-20 bg-[#1c1c1e] rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl relative">
                {false ? (
                    <Star className="w-10 h-10 text-yellow-400 fill-yellow-400 animate-pulse" />
                ) : (
                    <Clock className="w-10 h-10 text-white/80" />
                )}
                <div className="absolute -bottom-2 -right-2 bg-green-500 rounded-full p-1.5 border-4 border-black">
                    <CheckCircle className="w-4 h-4 text-black" />
                </div>
            </div>

            <h2 className="text-3xl font-semibold text-white mb-2">Demande Envoyée</h2>
            <p className="text-white/50 text-sm mb-8 leading-relaxed max-w-xs mx-auto">
                Votre demande a bien été enregistrée. Ouvrez le SMS prérempli pour prévenir Daryl, puis envoyez-le depuis votre téléphone.
            </p>

            {smsDraftUrl && (
              <div className="apple-card p-4 text-left mb-8 space-y-3">
                <div className="flex items-start gap-3">
                  <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-apple-blue" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-white">Prévenir Daryl par SMS</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/50">Le message est préparé pour le {DARYL_PHONE}. Votre téléphone vous demandera de l'envoyer.</p>
                  </div>
                </div>
                <a
                  href={smsDraftUrl}
                  onClick={() => { recordSmsDraftOpened(manageToken).catch(() => undefined); }}
                  className="apple-btn flex w-full items-center justify-center gap-2 py-3 text-sm"
                >
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  Ouvrir le SMS
                </a>
              </div>
            )}

            {manageToken && (
              <div className="apple-card p-4 text-left mb-8 space-y-3">
                <p className="text-xs text-white/60">Conservez ce lien pour consulter ou annuler votre demande :</p>
                <button type="button" onClick={copyManageLink} className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-left text-[10px] text-white/50 break-all hover:text-white focus-visible:ring-2 focus-visible:ring-apple-blue">
                  {copiedManageLink ? 'Lien copié' : `${window.location.origin}${window.location.pathname}#manage=${manageToken}`}
                </button>
                <button type="button" onClick={async () => { try { const booking = await cancelManagedBooking(manageToken); setManagedBooking(booking); setCurrentStep(5); } catch { setSubmitError('Cette demande ne peut plus être annulée.'); } }} className="w-full rounded border border-red-500/30 py-2 text-xs font-bold uppercase text-red-400 hover:bg-red-500/10">Annuler la demande</button>
              </div>
            )}

            <div className="apple-card p-6 text-left mb-8 space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-white/40 text-sm">Service</span>
                    <span className="text-white font-medium">{selectedService?.name}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-white/40 text-sm">Date</span>
                    <span className="text-white font-medium">{getFormattedDate(currentSchedule.date).day} {getFormattedDate(currentSchedule.date).month} à {allSlots.find(s => s.id === selectedSlotId)?.time}</span>
                </div>
            </div>

            {submitError && <p role="alert" aria-live="polite" className="text-red-400 text-sm mb-4">{submitError}</p>}

            <button
                onClick={resetBooking}
                className="apple-btn-secondary py-3 px-8 text-sm"
            >
                Nouvelle Réservation
            </button>
          </div>
        )}

        {currentStep === 5 && (
          <div className="animate-enter pt-8 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#1c1c1e] shadow-2xl">
              <CheckCircle className={`h-10 w-10 ${managedBooking?.status === 'cancelled' ? 'text-white/40' : 'text-green-400'}`} />
            </div>
            <h2 className="mb-2 text-3xl font-semibold text-white">{!managedBooking ? 'Lien invalide' : managedBooking.status === 'cancelled' ? 'Demande annulée' : 'Votre demande'}</h2>
            {managedBooking && <p className="text-sm leading-relaxed text-white/50">{managedBooking.service_name} · {new Date(managedBooking.start_at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })}<br />Statut : {managedBooking.status === 'pending' ? 'en attente de confirmation' : managedBooking.status === 'confirmed' ? 'confirmé' : managedBooking.status}</p>}
            {managedBooking?.status === 'pending' || managedBooking?.status === 'confirmed' ? (
              <button type="button" onClick={async () => { try { const booking = await cancelManagedBooking(manageToken); setManagedBooking(booking); } catch { setSubmitError('Cette demande ne peut plus être annulée.'); } }} className="mt-8 rounded border border-red-500/30 px-6 py-3 text-sm font-bold uppercase text-red-400 hover:bg-red-500/10">Annuler la demande</button>
            ) : null}
            {submitError && <p role="alert" className="mt-4 text-sm text-red-400">{submitError}</p>}
            <button type="button" onClick={resetBooking} className="mt-8 rounded border border-white/10 px-6 py-3 text-sm font-bold uppercase text-white/60 hover:text-white">Nouvelle réservation</button>
          </div>
        )}

        {/* Navigation */}
        {currentStep < 4 && (
            <div className="mt-12 flex gap-3">
                {(currentStep > 1 || (currentStep === 2 && selectedHour)) && (
                     <button
                        onClick={handleBack}
                        className="apple-btn-secondary flex-1 py-4 text-sm"
                    >
                        Retour
                    </button>
                )}

                <button
                    disabled={!isStepValid() || isSubmitting}
                    onClick={handleNext}
                    className="apple-btn flex-1 py-4 text-sm shadow-lg shadow-blue-900/20"
                >
                    {currentStep === 3 ? (isSubmitting ? 'Enregistrement…' : 'Confirmer la demande') : 'Continuer'}
                </button>
            </div>
        )}

      </div>
    </section>
  );
};
