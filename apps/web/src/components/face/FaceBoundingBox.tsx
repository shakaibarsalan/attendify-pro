interface FaceBoundingBoxProps {
  detected: boolean;
  centered: boolean;
  goodQuality: boolean;
}

export default function FaceBoundingBox({ detected, centered, goodQuality }: FaceBoundingBoxProps) {
  const color = !detected
    ? 'border-gray-400'
    : !centered
      ? 'border-amber-400'
      : goodQuality
        ? 'border-green-500'
        : 'border-amber-400';

  const animClass = !detected
    ? 'animate-pulse-bracket'
    : goodQuality && centered
      ? 'animate-lock-in'
      : '';

  const bracketSize = 20;

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <div className={`absolute top-1/4 left-1/4 w-1/2 h-1/2 -translate-x-0 -translate-y-0 transition-colors duration-300`}>
        <div className={`absolute top-0 left-0 w-${bracketSize} h-${bracketSize} border-t-3 border-l-3 ${color} rounded-tl-lg ${animClass}`} />
        <div className={`absolute top-0 right-0 w-${bracketSize} h-${bracketSize} border-t-3 border-r-3 ${color} rounded-tr-lg ${animClass}`} />
        <div className={`absolute bottom-0 left-0 w-${bracketSize} h-${bracketSize} border-b-3 border-l-3 ${color} rounded-bl-lg ${animClass}`} />
        <div className={`absolute bottom-0 right-0 w-${bracketSize} h-${bracketSize} border-b-3 border-r-3 ${color} rounded-br-lg ${animClass}`} />
      </div>
    </div>
  );
}
