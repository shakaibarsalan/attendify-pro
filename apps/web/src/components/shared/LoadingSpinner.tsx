import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
  className?: string;
}

export default function LoadingSpinner({ message = 'Loading...', className = '' }: LoadingSpinnerProps) {
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <Loader2 className="animate-spin h-6 w-6 text-blue-500 mr-2" />
      <span className="text-gray-500">{message}</span>
    </div>
  );
}
