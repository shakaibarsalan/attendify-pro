import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Smile } from 'lucide-react';

/**
 * Low-opacity guide drawn on top of the (mirrored) camera feed during a liveness
 * challenge. The arrow points in the same on-screen direction the user should move,
 * which removes the left/right confusion that comes from reading a text label
 * against a mirrored selfie view.
 *
 * Direction note: the video display and the captured screenshot are mirrored
 * identically, and the backend turn detector is mapped so "turn_left" expects the
 * nose to move to the LEFT of the screen — so a left-pointing arrow is correct.
 */
const GUIDE: Record<string, { label: string; icon: any; anim: any }> = {
  turn_left: { label: 'Turn your head to your LEFT', icon: ArrowLeft, anim: { x: [0, -26, 0] } },
  turn_right: { label: 'Turn your head to your RIGHT', icon: ArrowRight, anim: { x: [0, 26, 0] } },
  look_up: { label: 'Tilt your head UP', icon: ArrowUp, anim: { y: [0, -22, 0] } },
  look_down: { label: 'Tilt your head DOWN', icon: ArrowDown, anim: { y: [0, 22, 0] } },
  smile: { label: 'Give a natural SMILE', icon: Smile, anim: { scale: [1, 1.18, 1] } },
};

export default function GestureGuideOverlay({ challenge }: { challenge?: string }) {
  if (!challenge) return null;
  const guide = GUIDE[challenge];
  if (!guide) return null;
  const Icon = guide.icon;

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
      {/* Instruction banner */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm">
        <p className="text-white text-sm font-semibold tracking-wide whitespace-nowrap">{guide.label}</p>
      </div>

      {/* Large translucent animated arrow showing the motion */}
      <motion.div
        animate={guide.anim}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        className="opacity-40"
      >
        <Icon size={120} strokeWidth={2.5} className="text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" />
      </motion.div>
    </div>
  );
}
