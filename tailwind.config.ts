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
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.04)',
        'glass-hover': '0 8px 32px 0 rgba(0, 0, 0, 0.08)',
        'book': '0 4px 20px -2px rgba(0, 0, 0, 0.1), 0 0 3px rgba(0,0,0,0.05)',
        'book-hover': '0 20px 40px -4px rgba(0, 0, 0, 0.15), 0 0 3px rgba(0,0,0,0.05)',
      }
    },
  },
  plugins: [],
};

export default config;
