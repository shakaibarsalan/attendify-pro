import { ShieldCheck, ScanEye, Users, BadgeCheck, Trash2, MapPin } from 'lucide-react';
import styles from './Security.module.css';
import { useScrollReveal } from '../hooks/useScrollReveal';

const pillars = [
  {
    icon: ShieldCheck,
    title: 'Encrypted Biometric Templates',
    desc: 'Faces and fingerprints are stored as one-way encrypted mathematical vectors, never as photos or raw scans. Original images are discarded after enrollment.',
  },
  {
    icon: ScanEye,
    title: 'Liveness & Anti-Spoofing',
    desc: 'On-device liveness detection blocks photos, screen replays, and masks. A printed picture or a phone video will never mark attendance.',
  },
  {
    icon: Users,
    title: 'Role-Based Access Control',
    desc: 'A four-tier permission model (system admin, institution admin, teacher, student) ensures every user sees only the data their role allows.',
  },
  {
    icon: BadgeCheck,
    title: 'Privacy-Regulation Aligned',
    desc: 'Data handling is built around student-privacy principles found in FERPA and GDPR, with explicit consent captured at enrollment.',
  },
  {
    icon: Trash2,
    title: 'Student Data Control',
    desc: 'Students can review and permanently delete their own biometric data at any time, directly from their account. No email tickets required.',
  },
  {
    icon: MapPin,
    title: 'Geofencing & Audit Trails',
    desc: 'Every check-in is GPS-verified against the campus boundary and written to a tamper-evident audit log for full accountability.',
  },
];

export default function Security() {
  const { ref, revealed } = useScrollReveal(0.1);

  return (
    <section
      id="security"
      ref={ref as React.RefObject<HTMLElement>}
      className={`${styles.securitySection}${revealed ? ' revealed' : ''}`}
    >
      <div className="container">
        <div className={styles.securityGrid}>
          <div className={`${styles.securityLead} reveal-left`}>
            <span className={styles.sectionLabel}>Security &amp; privacy</span>
            <h2 className={styles.sectionTitle}>
              Built for the most sensitive data on campus.
            </h2>
            <p className={styles.sectionSubtitle}>
              Biometric attendance only works if students and institutions trust
              it. Attendify treats every face and fingerprint as protected data:
              encrypted, consented, and fully under the student's control.
            </p>
            <div className={styles.trustStrip}>
              <div className={styles.trustStat}>
                <span className={styles.trustStatValue}>AES-256</span>
                <span className={styles.trustStatLabel}>Data encryption</span>
              </div>
              <div className={styles.trustDivider} />
              <div className={styles.trustStat}>
                <span className={styles.trustStatValue}>Zero</span>
                <span className={styles.trustStatLabel}>Raw images stored</span>
              </div>
              <div className={styles.trustDivider} />
              <div className={styles.trustStat}>
                <span className={styles.trustStatValue}>Full</span>
                <span className={styles.trustStatLabel}>Audit logging</span>
              </div>
            </div>
          </div>

          <div className={styles.pillarGrid}>
            {pillars.map((p, i) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  className={`${styles.pillarCard} reveal-up`}
                  style={{ '--d': `${0.1 + i * 0.08}s` } as React.CSSProperties}
                >
                  <div className={styles.pillarIcon}>
                    <Icon size={20} strokeWidth={1.8} />
                  </div>
                  <h4 className={styles.pillarTitle}>{p.title}</h4>
                  <p className={styles.pillarDesc}>{p.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
