
import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const TRANSFORMATIONS = [
  {
    id: '045',
    label: 'Naturel',
    before: '/images/before-045.png',
    after: '/images/after-045.png'
  },
  {
    id: '044',
    label: 'Texture',
    before: '/images/before-044.png',
    after: '/images/after-044.png'
  },
  {
    id: '042',
    label: 'Restyle',
    before: '/images/before-042.png',
    after: '/images/after-042.png'
  },
  {
    id: '043',
    label: 'Précision',
    before: '/images/before-043.png',
    after: '/images/after-043.png'
  }
];

export const BeforeAfter = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Gesture Intent Refs
  const touchStartRef = useRef<{ x: number, y: number } | null>(null);
  const isScrollingRef = useRef<boolean>(false);

  const activeClient = TRANSFORMATIONS[activeIndex];

  const handleMove = (clientX: number) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const newPos = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setPosition(newPos);
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isDragging) handleMove(e.clientX);
  };

  // Mouse Interaction
  const handleMouseDown = () => setIsDragging(true);

  // Touch Interactions
  const onTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
    isScrollingRef.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !touchStartRef.current) return;

    // If we have determined the user is scrolling, stop updating the slider
    if (isScrollingRef.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;

    const deltaX = Math.abs(currentX - touchStartRef.current.x);
    const deltaY = Math.abs(currentY - touchStartRef.current.y);

    // Intent Detection: 
    // If vertical movement is significant and dominant, assume scroll intent.
    if (deltaY > deltaX && deltaY > 10) {
      isScrollingRef.current = true;
      return;
    }

    // Otherwise, handle slider logic
    handleMove(currentX);
  };
  
  useEffect(() => {
    const handleUp = () => {
      setIsDragging(false);
      isScrollingRef.current = false;
    };
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchend', handleUp);
    };
  }, []);

  const nextClient = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveIndex((prev) => (prev + 1) % TRANSFORMATIONS.length);
  };

  const prevClient = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveIndex((prev) => (prev - 1 + TRANSFORMATIONS.length) % TRANSFORMATIONS.length);
  };

  return (
    <section className="relative w-full bg-[#080808] h-full flex flex-col items-center justify-center overflow-hidden rounded-t-[3rem] z-10 border-t border-white/5">
      <style>{`
        .latex-grain {
          position: absolute;
          inset: 0;
          z-index: 10;
          pointer-events: none;
          opacity: 0.04;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3BaseFilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }
        
        .latex-slider::before {
          content: '';
          position: absolute;
          height: 100%;
          width: 1px;
          background: rgba(255,255,255,0.3);
          left: 50%;
          transform: translateX(-50%);
          pointer-events: none;
        }

        .handle-blob {
          width: 40px;
          height: 40px;
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.3);
          border-radius: 50%;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 20px rgba(0,0,0,0.5);
          transition: transform 0.2s ease;
        }

        .handle-blob::after {
          content: '';
          width: 4px;
          height: 4px;
          background: white;
          border-radius: 50%;
        }

        .active-blob {
          transform: scale(1.2);
          background: rgba(255,255,255,0.2);
          border-color: white;
        }
      `}</style>

      <div className="latex-grain"></div>

      <div className="relative w-full h-full flex flex-col">
        {/* Header UI */}
        <header className="absolute top-12 left-6 right-6 z-50 flex justify-between items-start pointer-events-none">
          <div className="animate-fade-in" key={`header-${activeClient.id}`}>
            <span className="font-mono text-[10px] uppercase tracking-[2px] text-white/50 block mb-2">
              Système.Reforme // {activeClient.id}
            </span>
            <h1 className="text-2xl md:text-3xl font-space font-bold leading-[0.9] uppercase tracking-tight text-white">
              MÉTA<br/><span className="text-white/40">MORPHOSE</span>
            </h1>
          </div>
          
          <div className="flex gap-2 pointer-events-auto mt-2">
            <button 
              type="button"
              onClick={prevClient}
              aria-label="Transformation précédente"
              title="Transformation précédente"
              className="w-10 h-10 flex items-center justify-center border border-white/10 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-white hover:text-black transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button 
              type="button"
              onClick={nextClient}
              aria-label="Transformation suivante"
              title="Transformation suivante"
              className="w-10 h-10 flex items-center justify-center border border-white/10 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-white hover:text-black transition-colors"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Comparison Stage */}
        <div 
          id="stage"
          ref={containerRef}
          className="relative flex-1 w-full cursor-ew-resize touch-pan-y select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={onMouseMove}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
        >
          {/* Side Labels */}
          <div className="absolute top-1/2 -translate-y-1/2 w-full px-5 flex justify-between pointer-events-none z-20 mix-blend-difference">
            <span className="font-mono text-[10px] tracking-[4px] opacity-60 text-white vertical-lr uppercase writing-vertical-lr rotate-180">
              Avant
            </span>
            <span className="font-mono text-[10px] tracking-[4px] opacity-60 text-white vertical-lr uppercase writing-vertical-lr rotate-180">
              Après
            </span>
          </div>

          <div className="absolute inset-0 pointer-events-none">
            {/* After Image (Background) */}
            <div 
              key={`after-${activeClient.id}`}
              className="absolute inset-0 bg-cover bg-center bg-no-repeat z-[1] animate-fade-in"
              style={{ backgroundImage: `url(${activeClient.after})` }}
            />
            
            {/* Before Image (Foreground - Clipped) */}
            <div 
              key={`before-${activeClient.id}`}
              className="absolute inset-0 bg-cover bg-center bg-no-repeat z-[2] animate-fade-in"
              style={{ 
                backgroundImage: `url(${activeClient.before})`,
                clipPath: `polygon(0 0, ${position}% 0, ${position}% 100%, 0 100%)`
              }}
            />
          </div>

          {/* Slider Handle */}
          <div 
            className="absolute top-0 bottom-0 w-[40px] z-30 -translate-x-1/2 flex items-center justify-center latex-slider"
            style={{ left: `${position}%` }}
          >
            <div className={`handle-blob ${isDragging ? 'active-blob' : ''}`}></div>
          </div>
        </div>

        {/* Footer UI */}
        <footer className="absolute bottom-32 left-6 right-6 z-50 flex justify-between items-end pointer-events-none">
          <div className="px-3 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-apple-blue rounded-full animate-pulse"></div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-white">Interactif</span>
          </div>

          <div className="text-right">
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/50 block mb-1">
              Morph
            </span>
            <div className="font-mono text-sm font-medium text-white">
              {position.toFixed(0)}%
            </div>
          </div>
        </footer>
      </div>
    </section>
  );
};
