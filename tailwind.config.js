/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Classes built dynamically as template literals (e.g. `text-${color}` in
  // the Glance KPI cards) aren't seen by the Tailwind JIT scanner — they
  // would be purged in production and the chiffres KPI s'afficheraient en
  // gris. Lock them down explicitly.
  safelist: [
    'text-signal-green',
    'text-signal-yellow',
    'text-signal-red',
    'text-signal-blue',
    'text-signal-violet',
    'text-atlas-amber',
    'text-atlas-amber-deep',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        atlas: {
          // LIGHT THEME — token names kept (black = primary bg surface, fg-1 = primary text, etc.)
          black: '#F4F2E9',        // primary canvas (warm off-white)
          ink: '#FBFAF4',          // brightest surface
          obsidian: '#EDEAE0',     // raised tonal
          panel: '#FFFFFF',        // cards
          'panel-2': '#F8F6EE',
          surface: '#F0EEE4',
          'surface-2': '#E6E3D6',
          line: '#DCD9CB',
          'line-2': '#C7C3B3',
          mute: '#A4A99B',
          'fg-3': '#7A8071',
          'fg-2': '#3F443A',
          'fg-1': '#1A1D17',       // primary text
          white: '#0E1110',        // inverted (deepest contrast)
          // Sage primary — both naming conventions point at the same colors.
          // 'amber-*' is historical (early WIP); 'sage-*' is the canonical
          // alias used in newer code. Keep both so old templates don't break.
          amber: '#6E8B58',
          'amber-soft': '#95B07D',
          'amber-deep': '#52693F',
          'amber-glow': '#C8DBAE',
          sage: '#95B07D',          // softer sage for subtle accents/borders
          'sage-deep': '#6E8B58',   // primary brand button bg
          'sage-deeper': '#52693F', // hover / pressed
          'sage-glow': '#C8DBAE',
        },
        signal: {
          green: '#4D9A6A',
          'green-soft': '#DDE9DA',
          yellow: '#B69248',
          'yellow-soft': '#F2EAD0',
          red: '#B85B4D',
          'red-soft': '#F2DAD3',
          blue: '#5C7BA1',
          'blue-soft': '#DAE2EE',
          violet: '#7E6BA8',
          'violet-soft': '#E2DCEE',
          pink: '#B0617B',
        },
      },
      fontFamily: {
        display: ['Dosis', 'system-ui', 'sans-serif'],
        sans: ['Dosis', 'system-ui', 'sans-serif'],
        logo: ['"Grand Hotel"', 'cursive'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.95rem', letterSpacing: '0.02em' }],
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      borderRadius: {
        'xl-2': '1.25rem',
        '4xl': '2rem',
      },
      boxShadow: {
        'panel': '0 1px 0 0 rgba(255,255,255,0.6) inset, 0 0 0 1px rgba(26,29,23,0.05), 0 1px 2px -1px rgba(26,29,23,0.06), 0 14px 28px -18px rgba(26,29,23,0.18)',
        'amber-glow': '0 0 0 1px rgba(110,139,88,0.35), 0 6px 22px -6px rgba(110,139,88,0.35)',
        'amber-deep': '0 8px 22px -8px rgba(110,139,88,0.45), inset 0 1px 0 rgba(255,255,255,0.4)',
        'inner-line': 'inset 0 0 0 1px rgba(26,29,23,0.06)',
        'soft-pop': '0 24px 48px -22px rgba(26,29,23,0.18), 0 0 0 1px rgba(26,29,23,0.05)',
      },
      backgroundImage: {
        'grid-fade': 'radial-gradient(circle at center, rgba(110,139,88,0.08), transparent 65%)',
        'amber-gradient': 'linear-gradient(135deg, #95B07D 0%, #6E8B58 50%, #52693F 100%)',
        'panel-gradient': 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.1) 100%)',
        'aurora': 'radial-gradient(ellipse at top, rgba(110,139,88,0.12), transparent 55%), radial-gradient(ellipse at bottom right, rgba(92,123,161,0.08), transparent 60%)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0, transform: 'translateY(4px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        'fade-in-up': { '0%': { opacity: 0, transform: 'translateY(12px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        'fade-in-scale': { '0%': { opacity: 0, transform: 'scale(0.96)' }, '100%': { opacity: 1, transform: 'scale(1)' } },
        'pulse-soft': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.55 } },
        'shimmer': { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        'aurora-spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
        'tick': { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.05)' } },
        'rise': { '0%': { transform: 'translateY(8px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out forwards',
        'fade-in-up': 'fade-in-up 320ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'fade-in-scale': 'fade-in-scale 220ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        'shimmer': 'shimmer 2.4s linear infinite',
        'aurora-spin': 'aurora-spin 22s linear infinite',
        'tick': 'tick 1.6s ease-in-out infinite',
        'rise': 'rise 360ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
