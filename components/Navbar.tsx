
import React, { useState, useEffect } from 'react';
import { AffiliateModal } from './AffiliateModal';

export const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAffiliateOpen, setIsAffiliateOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Changed threshold slightly to account for full screen hero
      setIsScrolled(window.scrollY > window.innerHeight - 100);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToBooking = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const element = document.getElementById('booking');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
        <nav 
        className={`fixed top-0 w-full z-50 transition-all duration-500 ${
            isScrolled 
            ? 'glass-nav py-3 border-b border-white/10' 
            : 'bg-transparent py-6 mix-blend-difference'
        }`}
        >
        <div className="px-6 flex items-center justify-between">
            {/* Minimal Logo */}
            <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-wide text-white opacity-90">DARYL</span>
            </div>

            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => setIsAffiliateOpen(true)}
                    aria-label="Fidélité"
                    className={`px-2 py-1 text-xs font-medium transition-all duration-300 ${
                         isScrolled ? 'text-black hover:text-apple-blue' : 'text-white hover:text-white/70'
                    }`}
                >
                    Fidélité
                </button>

                {/* Minimal Action */}
                <a 
                href="#booking"
                onClick={scrollToBooking}
                className={`text-xs font-medium px-4 py-2 rounded-full transition-all duration-300 cursor-pointer ${
                    isScrolled 
                        ? 'bg-white text-black' 
                        : 'border border-white text-white'
                }`}
                >
                Réserver
                </a>
            </div>
        </div>
        </nav>
        
        <AffiliateModal isOpen={isAffiliateOpen} onClose={() => setIsAffiliateOpen(false)} />
    </>
  );
};
