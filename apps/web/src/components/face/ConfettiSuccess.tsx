import { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

interface ConfettiSuccessProps {
  message: string;
  subtitle?: string;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export default function ConfettiSuccess({ message, subtitle, onDismiss, autoDismissMs = 3000 }: ConfettiSuccessProps) {
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b'],
      });
    }

    if (autoDismissMs > 0) {
      const timer = setTimeout(onDismiss, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [onDismiss, autoDismissMs]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 15 }}
      className="flex flex-col items-center text-center p-8"
      role="alert"
      aria-live="polite"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', damping: 10 }}
        className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4"
      >
        <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </motion.div>
      <h3 className="text-xl font-bold text-gray-900 mb-1">{message}</h3>
      {subtitle && <p className="text-sm text-gray-500 mb-4">{subtitle}</p>}
      <button
        onClick={onDismiss}
        className="px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
      >
        View My Attendance
      </button>
    </motion.div>
  );
}
