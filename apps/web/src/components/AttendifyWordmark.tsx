import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

// Per-letter animated Attendify wordmark (navy "Atten" + teal "dify", teal check
// over a dotless i). Shared by the login layouts.
const NAVY = '#23286b';
const TEAL = '#0d9488';
const CHARS = [...'Attendıfy']; // dotless ı so the check sits where the dot would be

export default function AttendifyWordmark({ size = 30, float = true }: { size?: number; float?: boolean }) {
  return (
    <motion.div
      className="flex items-baseline select-none" aria-label="Attendify"
      style={{ fontFamily: "'Poppins','Inter',sans-serif", fontWeight: 800, fontSize: size, letterSpacing: '-0.02em', lineHeight: 1 }}
      animate={float ? { y: [0, -3, 0] } : undefined} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
    >
      {CHARS.map((ch, i) => (
        <span key={i} className="relative inline-block" aria-hidden="true">
          <motion.span
            className="inline-block"
            initial={{ opacity: 0, y: size * 0.45, scale: 0.6, rotate: -8 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.07, ease: [0.2, 1.5, 0.4, 1] }}
            style={{ color: i < 6 ? NAVY : TEAL }}
          >
            {ch}
          </motion.span>
          {i === 6 && (
            <motion.span
              className="absolute pointer-events-none" style={{ left: '50%', top: '-0.30em', transform: 'translateX(-50%)', color: TEAL }}
              initial={{ opacity: 0, scale: 0, rotate: -30 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ delay: 0.1 + 6 * 0.07 + 0.18, duration: 0.45, ease: 'backOut' }}
            >
              <Check size={Math.round(size * 0.4)} strokeWidth={4} />
            </motion.span>
          )}
        </span>
      ))}
    </motion.div>
  );
}
