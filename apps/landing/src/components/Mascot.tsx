import styles from './Mascot.module.css';

export type MascotState = 'idle' | 'listening' | 'typing' | 'user_typing' | 'static';

/**
 * Custom inline-SVG cartoon robot head: the Attendify assistant mascot.
 * Built only from rect / circle / ellipse / path / line shapes (no emoji, no icon
 * font, no external image). Four animated states are driven by the `data-state`
 * attribute on the <svg> and animated entirely in CSS:
 *   idle        | slow float, blink, antenna glow, gentle smile
 *   listening   | wider/glowing eyes, open mouth, fast antenna, sound-wave arcs
 *   typing      | squinting eyes, straight mouth, spinning antenna, 3 thinking dots
 *   user_typing | attentive eyes, wide smile, brief excited wiggle
 *   static      | frozen neutral pose (used for tiny message avatars)
 */
export default function Mascot({ state = 'idle', size = 44 }: { state?: MascotState; size?: number }) {
  return (
    <span className={styles.mascot} style={{ width: size, height: size }} aria-hidden="true">
      <svg className={`${styles.svg} mascot-svg`} data-state={state} viewBox="0 0 80 64" width="100%" height="100%">
        <g className={styles.bot}>
          {/* antenna */}
          <g className={styles.antenna}>
            <line className={styles.stem} x1="40" y1="16" x2="40" y2="8" />
            <circle className={styles.tip} cx="40" cy="6.5" r="3.6" />
          </g>

          {/* ears / side bolts */}
          <circle className={styles.ear} cx="20" cy="34" r="3" />
          <circle className={styles.ear} cx="60" cy="34" r="3" />

          {/* head + inset face panel */}
          <rect className={styles.head} x="22" y="16" width="36" height="34" rx="11" />
          <rect className={styles.face} x="26" y="21" width="28" height="22" rx="8" />

          {/* eyes */}
          <ellipse className={styles.eye} cx="34" cy="31" rx="3.4" ry="4.2" />
          <ellipse className={styles.eye} cx="46" cy="31" rx="3.4" ry="4.2" />

          {/* mouths: exactly one shown per state */}
          <path className={`${styles.mouth} ${styles.mSmile}`} d="M34 38 Q40 42 46 38" />
          <path className={`${styles.mouth} ${styles.mWide}`} d="M33 37 Q40 45 47 37" />
          <path className={`${styles.mouth} ${styles.mStraight}`} d="M35 39 L45 39" />
          <ellipse className={`${styles.mouth} ${styles.mOpen}`} cx="40" cy="39" rx="3" ry="2.6" />

          {/* thinking dots (typing) */}
          <g className={styles.thinkDots}>
            <circle className={styles.tdot} cx="35" cy="46" r="1.7" />
            <circle className={styles.tdot} cx="40" cy="46" r="1.7" />
            <circle className={styles.tdot} cx="45" cy="46" r="1.7" />
          </g>

          {/* listening sound-wave arcs */}
          <g className={styles.waves}>
            <path className={styles.wave} d="M60 28 Q66 34 60 40" />
            <path className={styles.wave} d="M63 24 Q72 34 63 44" />
            <path className={styles.wave} d="M66 20 Q78 34 66 48" />
          </g>
        </g>
      </svg>
    </span>
  );
}
