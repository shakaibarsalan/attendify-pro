import { useState } from 'react';
import { Plus } from 'lucide-react';
import styles from './FAQ.module.css';
import { useScrollReveal } from '../hooks/useScrollReveal';

const faqs = [
  {
    q: 'Do employees need to install an app?',
    a: 'No. Employees clock in straight from their phone or laptop browser. Face and contactless-fingerprint capture use the device camera, and QR check-in uses any camera app. There is nothing to download or install.',
  },
  {
    q: 'What hardware does our organization need?',
    a: 'None beyond the phones, tablets, or webcams your team already uses. Attendify captures both face and fingerprint from an ordinary camera, so you avoid buying and maintaining fingerprint scanners or wall-mounted biometric terminals, which is where most attendance-system cost goes.',
  },
  {
    q: 'How is employee biometric data stored and protected?',
    a: 'Attendify never stores raw photos or fingerprint scans. Each enrollment is converted into a one-way encrypted vector that cannot be reverse-engineered into an image. Employees can permanently delete their biometric data from their account at any time.',
  },
  {
    q: 'Can it stop buddy punching and proxy clock-ins?',
    a: 'Yes. Liveness detection blocks photos and screen replays, GPS geofencing confirms the employee is physically at the workplace, and duplicate-device and IP alerts flag one phone trying to clock in several people, making time fraud effectively impossible.',
  },
  {
    q: 'How long does setup take?',
    a: 'Most organizations are running their first biometric clock-in within minutes: register your organization, import your staff list, enroll employees, and start a session. No IT project or hardware rollout required.',
  },
  {
    q: 'Does it work for multiple offices, branches, or shifts?',
    a: 'Yes. Attendify is multi-tenant and multi-branch: you can manage several sites and teams from one dashboard, run different shift sessions, and keep each location\'s records neatly separated.',
  },
  {
    q: 'Can we export records to HR or payroll?',
    a: 'Yes. Attendance and shift data are available as real-time dashboards and one-click exportable reports, and a documented API is available so you can sync records into your existing HR, payroll, or ERP systems.',
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
