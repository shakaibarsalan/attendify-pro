/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a' },
      },
      keyframes: {
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'pulse-bracket': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.02)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'lock-in': {
          '0%': { transform: 'scale(1.1)', opacity: '0.7' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-in-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fp-scan': {
          '0%': { transform: 'translateY(0)', opacity: '0' },
          '12%': { opacity: '1' },
          '50%': { transform: 'translateY(176px)' },
          '88%': { opacity: '1' },
          '100%': { transform: 'translateY(0)', opacity: '0' },
        },
        'fp-glow': {
          '0%, 100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.04)' },
        },
      },
      animation: {
        'scan-line': 'scan-line 1s ease-in-out',
        'pulse-bracket': 'pulse-bracket 2s ease-in-out infinite',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
        'lock-in': 'lock-in 300ms ease-out',
        'slide-in-right': 'slide-in-right 300ms ease-out',
        'fade-in-up': 'fade-in-up 300ms ease-out',
        'fp-scan': 'fp-scan 2.8s ease-in-out infinite',
        'fp-glow': 'fp-glow 3.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
