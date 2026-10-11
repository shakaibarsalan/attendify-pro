import { Building2, Users, QrCode, BarChart3 } from 'lucide-react';
import styles from './HowItWorks.module.css';
import { useScrollReveal } from '../hooks/useScrollReveal';

const steps = [
  {
    num: 1,
    icon: Building2,
    title: 'Register Institution',
    desc: 'Set up your university profile, add departments and courses in minutes.',
  },
  {
    num: 2,
    icon: Users,
    title: 'Add Teachers & Students',
    desc: 'Import rosters, invite faculty, and enroll students for biometric registration.',
  },
  {
    num: 3,
    icon: QrCode,
    title: 'Start Attendance Sessions',
    desc: 'Launch face recognition, fingerprint, or QR-based check-ins with one click.',
  },
  {
    num: 4,
    icon: BarChart3,
    title: 'View Real-time Analytics',
    desc: 'Instant dashboards with attendance rates, trends, and fraud alerts.',
  },
];

export default function HowItWorks() {
  // Observe the timeline track itself so the step cards animate only once
  // they're actually scrolled into view, not when the heading first appears.
  const { ref, revealed } = useScrollReveal(0.25, '0px 0px -18% 0px');

  return (
    <section
      id="how-it-works"
      className={`${styles.timelineSection}${revealed ? ' revealed' : ''}`}
    >
      <div className="container">
        <div className={styles.sectionLead}>
          <span className={styles.sectionLabel}>How it works</span>
          <h2 className={styles.sectionTitle}>Four steps. Zero complexity.</h2>
          <p className={styles.sectionSubtitle}>
            From registration to your first AI-powered attendance session. Get
            everything running in under 10 minutes.
          </p>
        </div>

        <div className={styles.timelineTrack} ref={ref as React.RefObject<HTMLDivElement>}>
          <div className={`${styles.connectorLine} reveal-left`} style={{ '--d': '0.3s' } as React.CSSProperties} />

          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className={`${styles.stepNode} reveal-pop`}
                style={{ '--d': `${0.1 + i * 0.14}s` } as React.CSSProperties}
              >
                <div className={styles.stepCircle}>
                  <span className={styles.stepNumber}>{step.num}</span>
                </div>
                <div className={styles.stepIconWrap}>
                  <Icon size={24} strokeWidth={1.8} />
                </div>
                <h4 className={styles.stepTitle}>{step.title}</h4>
                <p className={styles.stepDesc}>{step.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
