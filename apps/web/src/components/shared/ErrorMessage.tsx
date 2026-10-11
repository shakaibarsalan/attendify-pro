import { AlertCircle } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export default function ErrorMessage({ message, onRetry, className = '' }: ErrorMessageProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
      <AlertCircle className="h-8 w-8 text-red-400 mb-2" />
      <p className="text-red-600 text-sm mb-2">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-blue-600 text-sm hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}
