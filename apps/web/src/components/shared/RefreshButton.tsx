import { RefreshCw } from 'lucide-react';

/**
 * Small circular refresh button for places where a dropdown / list can go stale
 * (e.g. a department or course created in another tab). Re-fetches inline so the
 * user never has to reload the whole page. Spins while `loading`.
 */
export default function RefreshButton({
  onClick,
  loading = false,
  title = 'Refresh',
  size = 13,
  className = '',
}: {
  onClick: () => void;
  loading?: boolean;
  title?: string;
  size?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={title}
      aria-label={title}
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-60 ${className}`}
    >
      <RefreshCw size={size} className={loading ? 'animate-spin' : ''} />
    </button>
  );
}
