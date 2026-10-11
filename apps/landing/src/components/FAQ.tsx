import { useState } from 'react';
import { Plus } from 'lucide-react';
import styles from './FAQ.module.css';
import { useScrollReveal } from '../hooks/useScrollReveal';

const faqs = [
  {
    q: 'Do students need to install an app?',
    a: 'No. Students check in straight from their phone or laptop browser. Face recognition uses the device camera and QR check-in uses any camera app. There is nothing to download or install.',
  },
  {
    q: 'What hardware does an institution need?',
    a: 'Just a standard webcam for face recognition and any smartphone for QR check-ins. Fingerprint verification is optional and works with off-the-shelf USB scanners. No proprietary or expensive hardware required.',
  },
  {
    q: 'How is student biometric data stored and protected?',
    a: 'Attendify never stores raw photos or fingerprint scans. Each enrollment is converted into a one-way encrypted vector that cannot be reverse-engineered into an image. Students can permanently delete their biometric data from their account at any time.',
  },
  {
    q: 'Can it stop proxy attendance and buddy punching?',
    a: 'Yes. Liveness detection blocks photos and screen replays, GPS geofencing confirms the student is physically on campus, and multi-device alerts flag suspicious patterns, making proxy check-ins effectively impossible.',
  },
  {
    q: 'How long does setup take?',
    a: 'Most institutions are running their first AI-powered session in under 10 minutes: register the institution, import your roster, enroll students, and launch a session. No IT project required.',
  },
  {
    q: 'What happens if the AI service is temporarily unavailable?',
    a: 'Attendance never stops. If face recognition is briefly unavailable, sessions automatically fall back to secure QR check-in, so a class is never blocked from marking attendance.',
  },
  {
    q: 'Can Attendify integrate with our existing systems?',
    a: 'Enterprise and Unlimited plans include a documented API and custom integrations, so you can connect Attendify to your existing student information or LMS platform and sync rosters automatically.',
  },
];

export default function FAQ() {
  const { ref, revealed } = useScrollReveal(0.1);
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section
      id="faq"
      ref={ref as React.RefObject<HTMLElement>}
      className={`${styles.faqSection}${revealed ? ' revealed' : ''}`}
    >
      <div className="container">
        <div className={`${styles.sectionLead} reveal-zoom`}>
          <span className={styles.sectionLabel}>FAQ</span>
          <h2 className={styles.sectionTitle}>Questions, answered.</h2>
          <p className={styles.sectionSubtitle}>
            Everything decision-makers and IT teams ask before rolling out
            biometric attendance.
          </p>
        </div>

        <div className={styles.faqList}>
          {faqs.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={item.q}
                className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ''} reveal-up`}
                style={{ '--d': `${0.05 + i * 0.06}s` } as React.CSSProperties}
              >
                <button
                  className={styles.faqQuestion}
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span>{item.q}</span>
                  <span className={styles.faqIcon}>
                    <Plus size={18} strokeWidth={2.2} />
                  </span>
                </button>
                <div className={styles.faqAnswerWrap}>
                  <div className={styles.faqAnswerInner}>
                    <p className={styles.faqAnswer}>{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
