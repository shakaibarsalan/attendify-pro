import { Building2, Users, QrCode, BarChart3 } from 'lucide-react';
import styles from './HowItWorks.module.css';
import { useScrollReveal } from '../hooks/useScrollReveal';

const steps = [
  {
    num: 1,
    icon: Building2,
    title: 'Register Your Organization',
    desc: 'Set up your company profile, add departments, teams, and branches in minutes.',
  },
  {
    num: 2,
    icon: Users,
    title: 'Add Employees & Managers',
    desc: 'Import your staff list, invite managers, and enroll employees for biometric setup.',
  },
  {
    num: 3,
    icon: QrCode,
    title: 'Start Clocking In',
    desc: 'Employees check in with face, contactless fingerprint, or QR, right from their phone.',
  },
  {
    num: 4,
    icon: BarChart3,
    title: 'Get Real-time Records',
    desc: 'Instant dashboards with attendance, shift coverage, and exportable reports.',
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
            From sign-up to your first biometric clock-in. Get your whole team
            running in under 10 minutes, with no hardware to install.
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
