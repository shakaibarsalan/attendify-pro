import { motion } from 'framer-motion';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface FailureScreenProps {
  reason: string;
  isSpoofDetected: boolean;
  onRetry: () => void;
  onClose: () => void;
}

export default function FailureScreen({ reason, isSpoofDetected, onRetry, onClose }: FailureScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center text-center p-8"
      role="alert"
      aria-live="assertive"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', damping: 10 }}
        className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-4"
      >
        {isSpoofDetected ? (
          <ShieldAlert className="w-10 h-10 text-red-600" />
        ) : (
          <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </motion.div>

      <h3 className="text-xl font-bold text-gray-900 mb-2">
        {isSpoofDetected ? 'Suspicious Activity Detected' : 'Verification Failed'}
      </h3>

      <p className="text-sm text-gray-600 mb-2 max-w-xs">
        {isSpoofDetected
          ? 'We detected suspicious activity during verification. This incident has been logged and reported to your instructor.'
          : reason || 'Face verification could not confirm your identity.'}
      </p>

      {!isSpoofDetected && (
        <p className="text-xs text-gray-400 mb-6">You can try again or use QR code instead.</p>
      )}

      <div className="flex gap-3">
        {!isSpoofDetected && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
        )}
        <button
          onClick={onClose}
          className="px-5 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Close
        </button>
      </div>

      {isSpoofDetected && (
        <p className="text-xs text-red-500 mt-4">
          Need help? Contact your instructor or institution administrator.
        </p>
      )}
    </motion.div>
  );
}
