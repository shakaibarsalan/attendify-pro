import { useEffect, useRef, useState } from 'react';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';
import robotHello from '../robot-hello.json';
import styles from './RobotGreeter.module.css';

const prefersReduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Looping greeting: the Attendify robot (a self-hosted "hello" Lottie — the
 * polished gradient robot with its own "Hello!" bubble) pops up beside the chat
 * button, plays its hello once, ducks back down, waits, then pops up again — on
 * a gentle loop until the visitor opens the chat. The whole robot is clickable.
 *
 * `onVisible(true|false)` lets the parent sync the button glow to each pop. The
 * Lottie player + JSON live here so they load lazily (only when greeting fires).
 */
export default function RobotGreeter({ onOpen, onVisible }: { onOpen?: () => void; onVisible?: (v: boolean) => void }) {
  const [phase, setPhase] = useState<'rising' | 'idle' | 'leaving' | 'gap'>('rising');
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);
  const reduced = prefersReduced();

  useEffect(() => {
    if (reduced) {
      setPhase('idle');
      onVisible?.(true);
      return;
    }
    let alive = true;
    let timer = 0;
    const at = (ms: number, fn: () => void) => { timer = window.setTimeout(() => { if (alive) fn(); }, ms); };

    const cycle = () => {
      setPhase('rising');
      onVisible?.(true);
      lottieRef.current?.goToAndPlay(0, true); // replay the hello from the start each pop
      at(700, () => {                          // risen → hold while it says hello
        setPhase('idle');
        at(2500, () => {                        // duck back down
          setPhase('leaving');
          at(720, () => {                       // hidden gap, then loop again
            setPhase('gap');
            onVisible?.(false);
            at(2800, cycle);
          });
        });
      });
    };
    cycle();
    return () => { alive = false; clearTimeout(timer); onVisible?.(false); };
  }, [reduced, onVisible]);

  return (
    <div className={styles.wrap} data-phase={phase}>
      <button type="button" className={styles.btn} onClick={onOpen} aria-label="Open the Attendify assistant">
        <Lottie lottieRef={lottieRef} animationData={robotHello} loop autoplay={!reduced} className={styles.lottie} />
      </button>
    </div>
  );
}
