import {
  Wallet,
  ShieldCheck,
  Smartphone,
  FileBarChart,
  Building2,
  TrendingUp,
} from 'lucide-react';
import styles from './Benefits.module.css';
import { useScrollReveal } from '../hooks/useScrollReveal';

const benefits = [
  {
    icon: Wallet,
    title: 'Cut Hardware Costs',
    desc: 'No fingerprint scanners or biometric terminals to buy or maintain. A phone camera captures both face and fingerprint.',
    color: 'brand',
  },
  {
    icon: ShieldCheck,
    title: 'Fraud-proof',
    desc: 'Liveness detection, GPS geofencing, and duplicate-device checks eliminate buddy punching and proxy clock-ins.',
    color: 'emerald',
  },
  {
    icon: Smartphone,
    title: 'Any Device',
    desc: 'Works on phones, laptops, and tablets your team already owns. No special hardware for face, fingerprint, or QR.',
    color: 'slate',
  },
  {
    icon: FileBarChart,
    title: 'Records & Reports',
    desc: 'Real-time dashboards, trend charts, and one-click exportable reports, ready for HR, payroll, and compliance.',
    color: 'amber',
  },
  {
    icon: Building2,
    title: 'Multi-branch Ready',
    desc: 'Manage multiple offices, sites, and teams from a single dashboard, with each location kept neatly separate.',
    color: 'brand',
  },
  {
    icon: TrendingUp,
    title: 'Scales With You',
    desc: 'From a small team to thousands of employees, Attendify grows with your organization without new hardware.',
    color: 'emerald',
  },
];

const colorMap: Record<string, { bg: string; border: string; icon: string }> = {
  brand:   { bg: 'var(--brand-50)',  border: 'var(--brand-200)',  icon: 'var(--brand-600)'  },
  emerald: { bg: '#ecfdf5',          border: '#a7f3d0',           icon: 'var(--emerald-600)' },
  slate:   { bg: 'var(--slate-100)', border: 'var(--slate-200)',  icon: 'var(--slate-600)'  },
  amber:   { bg: '#fffbeb',          border: '#fde68a',           icon: '#b45309'           },
};

// Column-based animation variety: left ← | flip ↑ | right →
const colAnimation = ['reveal-left', 'reveal-flip', 'reveal-right'];

export default function Benefits() {
  const { ref, revealed } = useScrollReveal(0.1);

  return (
    <section
      id="benefits"
      ref={ref as React.RefObject<HTMLElement>}
      className={`${styles.benefitsSection}${revealed ? ' revealed' : ''}`}
    >
      <div className="container">
        <div className={`${styles.sectionLead} reveal-zoom`}>
          <span className={styles.sectionLabel}>Why Attendify</span>
          <h2 className={styles.sectionTitle}>
            Built for organizations that value people's time.
          </h2>
          <p className={styles.sectionSubtitle}>
            Sign-in sheets and expensive biometric terminals slow teams down and
            drift out of date. Attendify replaces both with a phone, and gives you
            better records than paper ever could.
          </p>
        </div>

        <div className={styles.benefitsGrid}>
          {benefits.map((b, i) => {
            const Icon = b.icon;
            const colors = colorMap[b.color];
            const anim = colAnimation[i % 3];
            // Row-offset delay so second row starts after first row begins
            const rowDelay = Math.floor(i / 3) * 0.15;
            const colDelay = (i % 3) * 0.1;
            return (
              <div
                key={b.title}
                className={`${styles.benefitCard} ${anim}`}
                style={{ '--d': `${rowDelay + colDelay}s` } as React.CSSProperties}
              >
                <div
                  className={styles.benefitIconBox}
                  style={{
                    background: colors.bg,
                    borderColor: colors.border,
                    color: colors.icon,
                  }}
                >
                  <Icon size={22} strokeWidth={1.8} />
                </div>
                <h4 className={styles.benefitTitle}>{b.title}</h4>
                <p className={styles.benefitDesc}>{b.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
