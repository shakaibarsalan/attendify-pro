import { useEffect, useState, type CSSProperties } from 'react';
import styles from './Hero.module.css';

const appUrl = () => `https://${window.location.hostname}/login`;

const headlineWords = ['Track', 'Every', 'Student.', 'Zero', 'Effort', 'Required.'];
const marqueeStats = ['50K+ Students Tracked', '99.9% Uptime', '200+ Institutions', '<2s Recognition'];

function useCountUp(target: number, durationMs = 1800) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setValue(target);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      setValue(target * easeOutExpo(progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, target]);

  return value;
}

export default function Hero() {
  const attendanceRate = useCountUp(96.4);

  return (
    <section className={styles.heroSection}>
      <div className={styles.aurora} aria-hidden="true" />
      <div className="container">
        <div className={styles.heroStage}>
          <div className={styles.heroCopy}>
            <div className={styles.heroTag}>Attendance, Reimagined</div>

            <h1 className={styles.heroTitle} aria-label="Track Every Student. Zero Effort Required.">
              {headlineWords.map((word, index) => (
                <span
                  key={word}
                  className={`${styles.word} ${word === 'Zero' || word === 'Effort' ? styles.gradientWord : ''}`}
                  style={{ '--delay': `${index * 80}ms` } as CSSProperties}
                >
                  {word}
                </span>
              ))}
            </h1>

            <div className={styles.shimmerRule} />

            <p className={styles.heroDesc}>
              AI-powered face recognition, biometric verification, and real-time
              analytics, built for universities that refuse to settle for
              manual roll calls.
            </p>

            <div className={styles.heroButtons}>
              <a href={appUrl()} className={styles.btnPrimary}>
                Start Free Trial
                <span className={styles.btnArrow}>→</span>
              </a>
              <a href="#how-it-works" className={styles.btnSecondary}>
                See How It Works
              </a>
            </div>

            <div className={styles.heroTrust}>
              <span>No credit card</span>
              <span aria-hidden="true">·</span>
              <span>Setup in 5 minutes</span>
              <span aria-hidden="true">·</span>
              <span>Cancel anytime</span>
            </div>
          </div>

          <div className={styles.dataTheater} aria-label="Live attendance data preview">
            <div className={`${styles.fragment} ${styles.rateFragment}`}>
              <div className={styles.floatA}>
                <div className={styles.fragmentEyebrow}>Attendance Rate</div>
                <div className={styles.rateNumber}>{attendanceRate.toFixed(1)}%</div>
                <div className={styles.rateCaption}>verified in real time</div>
                <svg className={styles.sparkline} viewBox="0 0 140 44" fill="none" aria-hidden="true">
                  <path d="M4 35 C18 29 25 31 39 22 C53 12 62 21 76 14 C94 5 108 16 136 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  <path d="M4 35 C18 29 25 31 39 22 C53 12 62 21 76 14 C94 5 108 16 136 7 L136 44 L4 44 Z" fill="currentColor" opacity="0.08" />
                </svg>
              </div>
            </div>

            <div className={`${styles.fragment} ${styles.liveFragment}`}>
              <div className={styles.floatB}>
                <span className={styles.liveDot} />
                <span>CS · Data Structures · 10:00 AM</span>
              </div>
            </div>

            <div className={`${styles.fragment} ${styles.splitFragment}`}>
              <div className={styles.floatC}>
                <div className={styles.splitTop}>
                  <span>847 present</span>
                  <span>23 absent</span>
                </div>
                <div className={styles.barTrack}>
                  <span className={styles.presentBar} />
                  <span className={styles.absentBar} />
                </div>
                <svg className={styles.donut} viewBox="0 0 42 42" aria-hidden="true">
                  <circle cx="21" cy="21" r="15" fill="none" stroke="rgba(15,23,42,0.1)" strokeWidth="5" />
                  <circle cx="21" cy="21" r="15" fill="none" stroke="#4f98a3" strokeWidth="5" strokeDasharray="89 95" strokeLinecap="round" transform="rotate(-90 21 21)" />
                </svg>
              </div>
            </div>

            <div className={`${styles.fragment} ${styles.scanFragment}`}>
              <div className={styles.floatD}>
                <div className={styles.heatCard}>
                  <div className={styles.heatHeader}>
                    <div className={styles.heatTitle}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#01696f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                      <span>Weekly Attendance</span>
                    </div>
                    <span className={styles.heatLive}>
                      <span className={styles.heatLiveDot} /> LIVE
                    </span>
                  </div>
                  <div className={styles.heatGrid}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => (
                      <span key={d} className={styles.heatColLabel}>{d}</span>
                    ))}
                    {[
                      'p','p','p','p','p',
                      'p','p','p','a','p',
                      'p','p','u','u','u',
                    ].map((s, i) => (
                      <span key={i} className={`${styles.heatDot} ${styles[`heat_${s}`]}`} />
                    ))}
                  </div>
                  <div className={styles.heatFooter}>
                    <div className={styles.heatStatLeft}>
                      <span className={styles.heatPct}>96.4%</span>
                      <span className={styles.heatStatLabel}>this week</span>
                    </div>
                    <div className={styles.heatProgressTrack}>
                      <span className={styles.heatProgressFill} />
                    </div>
                    <div className={styles.heatStatRight}>
                      <span className={styles.heatAbsent}>1 absent</span>
                      <span className={styles.heatStatLabel}>flagged</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={`${styles.fragment} ${styles.sessionsFragment}`}>
              <div className={styles.floatE}>
                <div className={styles.sessionsTitle}>Upcoming Sessions</div>
                <div className={styles.sessionRow}>
                  <span>Linear Algebra</span>
                  <strong>11:30</strong>
                </div>
                <div className={styles.sessionRow}>
                  <span>Technical Writing</span>
                  <strong>13:00</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.socialProof} aria-label="Attendify platform metrics">
        <div className={styles.marqueeTrack}>
          {[...marqueeStats, ...marqueeStats, ...marqueeStats].map((item, index) => (
            <span key={`${item}-${index}`} className={styles.marqueeChip}>{item}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
