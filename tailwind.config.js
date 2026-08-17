/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './App.tsx', './BookingContext.tsx', './components/**/*.{ts,tsx}', './api/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        space: ['"Space Grotesk"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        outfit: ['"Outfit"', 'sans-serif'],
      },
      colors: {
        'apple-gray': '#f5f5f7',
        'apple-dark': '#1d1d1f',
        'apple-blue': '#0071e3',
        'apple-blue-hover': '#0077ed',
        'basalt-dark': '#0f0f0f',
        'basalt-mid': '#1a1a1a',
        'basalt-light': '#2c2c2c',
        'basalt-accent': '#e0e0e0',
      },
      animation: {
        'fade-in': 'fadeIn 1s ease-out forwards',
        'slide-up': 'slideUp 0.8s ease-out forwards',
        'slab-entry': 'slabEntry 1s ease-out forwards',
        'drift-slow': 'drift 10s infinite alternate',
        'drift-medium': 'drift 12s infinite alternate-reverse',
        'drift-fast': 'drift 8s infinite alternate',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slabEntry: { '0%': { opacity: '0', transform: 'translateY(40px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        drift: { '0%': { transform: 'translate(-20%, -20%) scale(1)' }, '100%': { transform: 'translate(20%, 20%) scale(1.2)' } },
      },
    },
  },
  plugins: [],
};
