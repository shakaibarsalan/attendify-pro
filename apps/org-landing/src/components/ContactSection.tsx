import { useState } from 'react';
import { Mail, Phone, MapPin, Send } from 'lucide-react';
import styles from './ContactSection.module.css';
import { useScrollReveal } from '../hooks/useScrollReveal';

const contactInfo = [
  {
    icon: Mail,
    label: 'Email us',
    value: 'info@attendify.pro',
  },
  {
    icon: Phone,
    label: 'Call us',
    value: '+92 303 2862895',
  },
  {
    icon: MapPin,
    label: 'Visit us',
    value: 'University of Management & Technology, Lahore',
  },
];

export default function ContactSection() {
  const { ref, revealed } = useScrollReveal(0.1);
  const [form, setForm] = useState({
    name: '',
    email: '',
    institution: '',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    setSubmitted(true);
  }

  return (
    <section
      id="contact"
      ref={ref as React.RefObject<HTMLElement>}
      className={`${styles.contactSection}${revealed ? ' revealed' : ''}`}
    >
      <div className="container">
        <div className={`${styles.sectionLead} reveal-zoom`}>
          <span className={styles.sectionLabel}>Get in touch</span>
          <h2 className={styles.sectionTitle}>Let's talk about your needs</h2>
        </div>

        <div className={styles.contactGrid}>
          <div className={`${styles.contactInfo} reveal-left`} style={{ '--d': '0.15s' } as React.CSSProperties}>
            <p className={styles.contactIntro}>
              Interested in Attendify for your organization? Reach out and our team
              will respond within 24 hours.
            </p>

            <div className={styles.infoItems}>
              {contactInfo.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className={styles.infoItem}>
                    <div className={styles.infoIcon}>
                      <Icon size={18} strokeWidth={1.8} />
                    </div>
                    <div>
                      <span className={styles.infoLabel}>{item.label}</span>
                      <span className={styles.infoValue}>{item.value}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.infoDecorLine} />
          </div>

          <div className={`${styles.formColumn} reveal-right`} style={{ '--d': '0.25s' } as React.CSSProperties}>
            {submitted ? (
              <div className={styles.successState}>
                <div className={styles.successCircle}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <h3 className={styles.successTitle}>Message Sent!</h3>
                <p className={styles.successText}>
                  We'll get back to you within 24 hours.
                </p>
                <button
                  className={styles.submitBtn}
                  onClick={() => {
                    setSubmitted(false);
                    setForm({ name: '', email: '', institution: '', message: '' });
                  }}
                >
                  Send Another
                </button>
              </div>
            ) : (
              <form className={styles.contactForm} onSubmit={handleSubmit}>
                <div className={styles.formRow}>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Full Name</label>
                    <input
                      type="text"
                      name="name"
                      className={styles.formInput}
                      placeholder="Your name"
                      value={form.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Email</label>
                    <input
                      type="email"
                      name="email"
                      className={styles.formInput}
                      placeholder="you@company.com"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Organization</label>
                  <input
                    type="text"
                    name="institution"
                    className={styles.formInput}
                    placeholder="Your company name"
                    value={form.institution}
                    onChange={handleChange}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Message</label>
                  <textarea
                    name="message"
                    className={styles.formTextarea}
                    placeholder="Tell us about your attendance needs..."
                    value={form.message}
                    onChange={handleChange}
                    required
                    rows={5}
                  />
                </div>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={loading}
                >
                  {loading ? (
                    'Sending...'
                  ) : (
                    <>
                      <Send size={16} strokeWidth={2} />
                      Send Message
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
