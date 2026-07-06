import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        accent: {
          DEFAULT: '#0a84ff',
          violet: '#5e5ce6',
        },
      },
      boxShadow: {
        // Liquid-glass elevation stack (specular top edge baked in).
        glass:
          '0 8px 32px rgba(31, 38, 135, 0.10), inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(255,255,255,0.18)',
        'glass-hover':
          '0 16px 48px rgba(31, 38, 135, 0.16), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(255,255,255,0.25)',
        book: '0 4px 20px -2px rgba(0, 0, 0, 0.12), 0 0 3px rgba(0,0,0,0.05)',
        'book-hover': '0 24px 48px -8px rgba(31, 38, 135, 0.28), 0 0 3px rgba(0,0,0,0.05)',
        // Colored glow for the primary accent (gradient buttons, active pills).
        'accent-glow': '0 4px 20px rgba(10, 132, 255, 0.35), 0 1px 3px rgba(10, 132, 255, 0.2)',
      },
      borderRadius: {
        // iOS continuous-corner feel for large surfaces.
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};

export default config;
