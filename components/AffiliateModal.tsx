import React from 'react';
import { X, Ticket, Users, Coins } from 'lucide-react';

interface AffiliateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AffiliateModal: React.FC<AffiliateModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="affiliate-title">
      <div className="bg-[#111] w-full max-w-sm rounded-3xl border border-white/10 overflow-hidden relative flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#111] z-10">
          <h2 id="affiliate-title" className="text-white font-space font-bold text-xl">Ambassadeur</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-white/40 hover:text-white focus-visible:ring-2 focus-visible:ring-apple-blue transition-colors p-2 -mr-2">
            <X className="w-6 h-6" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar p-6 space-y-8">
          <p className="text-sm text-white/70 leading-relaxed">
            Le programme ambassadeur est suivi par Daryl pour protéger les crédits et les données de chaque client. Demandez votre code en boutique après votre rendez-vous.
          </p>
          <div className="space-y-6">
            <div className="flex gap-4 items-start">
              <Ticket className="w-5 h-5 text-white shrink-0" aria-hidden="true" />
              <div><h3 className="text-white font-bold text-sm mb-1">Un code unique</h3><p className="text-xs text-white/50 leading-relaxed">Votre code est lié à votre numéro de téléphone vérifié.</p></div>
            </div>
            <div className="flex gap-4 items-start">
              <Users className="w-5 h-5 text-apple-blue shrink-0" aria-hidden="true" />
              <div><h3 className="text-white font-bold text-sm mb-1">Invitez vos proches</h3><p className="text-xs text-white/50 leading-relaxed">Un proche peut renseigner votre code pendant sa réservation.</p></div>
            </div>
            <div className="flex gap-4 items-start">
              <Coins className="w-5 h-5 text-yellow-500 shrink-0" aria-hidden="true" />
              <div><h3 className="text-white font-bold text-sm mb-1">Gagnez du crédit</h3><p className="text-xs text-white/50 leading-relaxed">Chaque rendez-vous terminé et associé à votre code ajoute 3 € de crédit.</p></div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-full py-3 bg-white text-black font-bold uppercase tracking-wider text-sm rounded-xl hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-apple-blue">Fermer</button>
        </div>
      </div>
    </div>
  );
};
