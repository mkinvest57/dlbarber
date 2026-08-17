import React, { useState } from 'react';
import { Check, Copy, Gift, Link, Ticket, X } from 'lucide-react';

interface AffiliateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AffiliateModal: React.FC<AffiliateModalProps> = ({ isOpen, onClose }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;
  const referralUrl = code ? `${window.location.origin}/?ref=${code}#booking` : '';

  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/referral/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, phone }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.code) throw new Error('join_failed');
      setCode(payload.code);
    } catch {
      setError('Impossible de créer votre code. Vérifiez votre numéro puis réessayez.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
    } catch {
      setError('Copiez le lien depuis la barre d’adresse.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="affiliate-title">
      <div className="relative flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-lg border border-white/10 bg-[#111]">
        <div className="flex items-center justify-between border-b border-white/5 p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-apple-blue text-white"><Gift className="h-4 w-4" aria-hidden="true" /></span>
            <h2 id="affiliate-title" className="font-space text-xl font-bold text-white">Ambassadeur</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="p-2 text-white/40 hover:text-white focus-visible:ring-2 focus-visible:ring-apple-blue"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>

        <div className="overflow-y-auto p-6">
          {!code ? (
            <form onSubmit={join} className="space-y-4">
              <p className="text-sm leading-relaxed text-white/65">Créez votre code, partagez-le et gagnez 3 EUR de crédit pour chaque proche dont le rendez-vous est terminé.</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-white/50">Prénom<input required value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-2 w-full rounded-md border border-white/15 bg-black p-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-apple-blue" /></label>
                <label className="text-xs text-white/50">Nom<input required value={lastName} onChange={(event) => setLastName(event.target.value)} className="mt-2 w-full rounded-md border border-white/15 bg-black p-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-apple-blue" /></label>
              </div>
              <label className="block text-xs text-white/50">Numéro de téléphone<input required type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="06 12 34 56 78" className="mt-2 w-full rounded-md border border-white/15 bg-black p-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-apple-blue" /></label>
              {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
              <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-md bg-white py-3 text-sm font-bold uppercase text-black disabled:opacity-50"><Ticket className="h-4 w-4" aria-hidden="true" />{submitting ? 'Création...' : 'Créer mon code'}</button>
            </form>
          ) : (
            <div className="space-y-5">
              <p className="text-sm text-white/65">Votre code ambassadeur est prêt.</p>
              <div className="rounded-md border border-apple-blue/40 bg-apple-blue/10 p-5 text-center"><span className="block text-xs uppercase text-white/50">Votre code</span><strong className="mt-2 block font-mono text-4xl tracking-[0.25em] text-white">{code}</strong></div>
              {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
              <button type="button" onClick={copyLink} className="flex w-full items-center justify-center gap-2 rounded-md border border-white/15 py-3 text-sm font-bold text-white hover:bg-white/5">{copied ? <Check className="h-4 w-4 text-green-400" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied ? 'Lien copié' : 'Copier mon lien'}</button>
              <a href={referralUrl} onClick={onClose} className="flex w-full items-center justify-center gap-2 rounded-md bg-white py-3 text-sm font-bold uppercase text-black"><Link className="h-4 w-4" aria-hidden="true" />Réserver avec mon code</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
