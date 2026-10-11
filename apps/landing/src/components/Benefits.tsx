import {
  Target,
  ShieldCheck,
  Smartphone,
  FileBarChart,
  Users,
  Infinity,
} from 'lucide-react';
import styles from './Benefits.module.css';
import { useScrollReveal } from '../hooks/useScrollReveal';

const benefits = [
  {
    icon: Target,
    title: '99.7% Accuracy',
    desc: 'AI models trained on millions of faces deliver near-perfect recognition across all conditions.',
    color: 'brand',
  },
  {
    icon: ShieldCheck,
    title: 'Fraud-proof',
    desc: 'Liveness detection, GPS geofencing, and multi-factor checks eliminate proxy attendance.',
    color: 'emerald',
  },
  {
    icon: Smartphone,
    title: 'Any Device',
    desc: 'Works on phones, laptops, and tablets. No special hardware required for face or QR check-ins.',
    color: 'slate',
  },
  {
    icon: FileBarChart,
    title: 'Instant Reports',
    desc: 'Real-time dashboards, trend charts, and one-click exportable reports for compliance.',
    color: 'amber',
  },
  {
    icon: Users,
    title: 'Multi-role Access',
    desc: 'Tailored dashboards for admins, teachers, and students with scoped permissions.',
    color: 'brand',
  },
  {
    icon: Infinity,
    title: 'Unlimited Scale',
    desc: 'From one class to 50,000+ students. Attendify handles any institution size.',
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
            Built for universities that take attendance seriously.
          </h2>
          <p className={styles.sectionSubtitle}>
            Manual roll calls waste 15+ minutes per class. Attendify gives that
            time back, with better data than any paper sheet ever could.
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
