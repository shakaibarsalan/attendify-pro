import { motion, AnimatePresence } from 'framer-motion';

interface Hint {
  id: string;
  text: string;
  type: 'warning' | 'success' | 'info';
}

interface QualityHintsProps {
  hints: Hint[];
}

const typeStyles = {
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  success: 'bg-green-100 text-green-800 border-green-200',
  info: 'bg-blue-100 text-blue-800 border-blue-200',
};

export default function QualityHints({ hints }: QualityHintsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2 mt-3" aria-live="polite">
      <AnimatePresence mode="popLayout">
        {hints.map((hint) => (
          <motion.span
            key={hint.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${typeStyles[hint.type]}`}
          >
            {hint.text}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
