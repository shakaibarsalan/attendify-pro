import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface LivenessChallengeCardProps {
  challenge: string;
  icon: string;
  instruction: string;
  countdownSeconds: number;
  active: boolean;
  completed: boolean;
}

const challengeIcons: Record<string, string> = {
  blink_twice: '\uD83D\uDC41\uFE0F',
  blink_thrice: '\uD83D\uDC41\uFE0F',
  turn_left: '\u2B05\uFE0F',
  turn_right: '\u27A1\uFE0F',
  smile: '\uD83D\uDE0A',
  look_up: '\u2B06\uFE0F',
  look_down: '\u2B07\uFE0F',
};

const challengeLabels: Record<string, string> = {
  blink_twice: 'Blink your eyes twice',
  blink_thrice: 'Blink your eyes three times',
  turn_left: 'Turn your head to your LEFT',
  turn_right: 'Turn your head to your RIGHT',
  smile: 'Smile naturally',
  look_up: 'Tilt your head UP',
  look_down: 'Tilt your head DOWN',
};

export default function LivenessChallengeCard({
  challenge,
  countdownSeconds,
  active,
  completed,
}: LivenessChallengeCardProps) {
  const [timeLeft, setTimeLeft] = useState(countdownSeconds);

  useEffect(() => {
    if (!active || completed) return;
    setTimeLeft(countdownSeconds);
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timer); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [active, completed, countdownSeconds]);

  const icon = challengeIcons[challenge] || '\u2728';
  const label = challengeLabels[challenge] || challenge;
  const progress = countdownSeconds > 0 ? ((countdownSeconds - timeLeft) / countdownSeconds) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: active ? 1 : 0.5, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
      className={`relative rounded-xl border-2 p-6 text-center transition-all ${
        completed
          ? 'border-green-400 bg-green-50'
          : active
            ? 'border-blue-400 bg-blue-50 shadow-lg'
            : 'border-gray-200 bg-gray-50'
      }`}
      role="status"
      aria-live="polite"
      aria-label={active ? `Challenge: ${label}. ${timeLeft} seconds remaining.` : undefined}
    >
      <div className="text-5xl mb-3">{icon}</div>
      <p className={`text-lg font-semibold ${completed ? 'text-green-700' : active ? 'text-blue-700' : 'text-gray-500'}`}>
        {completed ? '\u2713 Done' : label}
      </p>
      {active && !completed && (
        <div className="mt-3">
          <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-blue-500 rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <p className="text-sm text-blue-600 mt-1">{timeLeft}s remaining</p>
        </div>
      )}
    </motion.div>
  );
}
