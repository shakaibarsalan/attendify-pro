import { useEffect, useState, type FormEvent } from 'react';
import styles from './CTASection.module.css';
import { useScrollReveal } from '../hooks/useScrollReveal';

const badges = [
  { icon: 'card', text: 'No credit card required' },
  { icon: 'clock', text: 'Setup in 5 minutes' },
  { icon: 'lock', text: 'Cancel anytime' },
];

type Mode = 'demo' | 'signup';

function modeFromHash(): Mode {
  return window.location.hash.includes('signup') || window.location.hash.includes('get-started') ? 'signup' : 'demo';
}

export default function CTASection() {
  const { ref, revealed } = useScrollReveal(0.1);
  const [mode, setMode] = useState<Mode>(typeof window !== 'undefined' ? modeFromHash() : 'demo');
  const [form, setForm] = useState({
    organizationName: '',
    organizationCode: '',
    domain: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    expectedStudents: '',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  // Live "already registered" check for the Get Started (sign-up) flow.
  const [dupError, setDupError] = useState('');
  const [checking, setChecking] = useState(false);

  // Other sections (Hero, Pricing) deep-link here with #get-started / #request-demo
  // to preselect the intent.
  useEffect(() => {
    const onHash = () => setMode(modeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Ask the API whether this Institution Code / Email Domain is already taken.
  // Returns true when it's safe to proceed. Used on blur (live UX) and on submit.
  const runDuplicateCheck = async (): Promise<boolean> => {
    const code = form.organizationCode.trim();
    const domain = form.domain.trim();
    if (!code && !domain) { setDupError(''); return true; }
    setChecking(true);
    try {
      const baseUrl = window.location.origin;
      const qs = new URLSearchParams({ code, domain }).toString();
      const res = await fetch(`${baseUrl}/api/org-requests/check-availability?${qs}`);
      const data = await res.json().catch(() => ({ available: true }));
      if (!data.available) {
        setDupError(data.message || 'This Institution Code and Email Domain are already registered. Please contact support if this is your institution.');
        return false;
      }
      setDupError('');
      return true;
    } catch {
      // Network blip — don't block here; the server re-checks on submit.
      setDupError('');
      return true;
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    // Block sign-ups whose institution code / domain already exists.
    if (mode === 'signup') {
      const ok = await runDuplicateCheck();
      if (!ok) return;
    }
    setLoading(true);
    try {
      const baseUrl = window.location.origin;
      const res = await fetch(`${baseUrl}/api/org-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          requestType: mode,
          // number input yields a string; send a real number or omit when blank
          expectedStudents: form.expectedStudents ? Number(form.expectedStudents) : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // A 409 from the server's authoritative duplicate check.
        if (res.status === 409) { setDupError(data.error || 'This Institution Code and Email Domain are already registered.'); return; }
        throw new Error(data.error || 'Submission failed. Please try again.');
      }
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [field]: e.target.value });

  // Return to a fresh, empty form so the visitor can submit another demo /
  // sign-up request without reloading the page.
  const resetForm = () => {
    setForm({ organizationName: '', organizationCode: '', domain: '', contactName: '', contactEmail: '', contactPhone: '', expectedStudents: '', message: '' });
    setError('');
    setDupError('');
    setSuccess(false);
  };

  return (
    <section
      id="cta"
      ref={ref as React.RefObject<HTMLElement>}
      className={`${styles.ctaSection}${revealed ? ' revealed' : ''}`}
    >
      <div className="container">
        <div className={`${styles.ctaContent} reveal-zoom`} id="request-demo">
          <span id="get-started" style={{ position: 'absolute', marginTop: '-90px' }} aria-hidden="true" />
          <h2 className={styles.ctaHeading}>
            Ready to Modernize Your Attendance?
          </h2>
          <p className={styles.ctaBody}>
            {mode === 'signup'
              ? "Tell us about your organization and we'll set up your account. No credit card required to start."
              : "Request a demo and we'll get back to you within 24 hours. No credit card, no commitment."}
          </p>

          {success ? (
            <div className={styles.successBox}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <h3>Request Submitted!</h3>
              <p>
                {mode === 'signup'
                  ? "Thanks! We'll review your sign-up and email your account details shortly."
                  : "Thank you for your interest. We'll reach out to schedule your demo shortly."}
              </p>
              <button type="button" className={styles.successAgainBtn} onClick={resetForm}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
                </svg>
                Submit another request
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={styles.demoForm}>
              <div className={styles.modeToggle} role="tablist" aria-label="Request type">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'demo'}
                  className={`${styles.modeButton} ${mode === 'demo' ? styles.modeButtonActive : ''}`}
                  onClick={() => { setDupError(''); setMode('demo'); }}
                >
                  Request a Demo
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  className={`${styles.modeButton} ${mode === 'signup' ? styles.modeButtonActive : ''}`}
                  onClick={() => setMode('signup')}
                >
                  Get Started
                </button>
              </div>
              {error && <div className={styles.formError}>{error}</div>}
              {dupError && <div className={styles.formError}>{dupError}</div>}
              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label htmlFor="orgName">Organization Name *</label>
                  <input id="orgName" type="text" required value={form.organizationName} onChange={set('organizationName')} placeholder="University of Example" />
                </div>
                {mode === 'signup' && (
                  <>
                    <div className={styles.formField}>
                      <label htmlFor="orgCode">Institution Code *</label>
                      <input
                        id="orgCode"
                        type="text"
                        required
                        value={form.organizationCode}
                        onChange={(e) => { setDupError(''); setForm({ ...form, organizationCode: e.target.value }); }}
                        onBlur={runDuplicateCheck}
                        placeholder="e.g. MIT, LUMS"
                      />
                    </div>
                    <div className={styles.formField}>
                      <label htmlFor="orgDomain">Email Domain *</label>
                      <input
                        id="orgDomain"
                        type="text"
                        required
                        value={form.domain}
                        onChange={(e) => { setDupError(''); setForm({ ...form, domain: e.target.value }); }}
                        onBlur={runDuplicateCheck}
                        placeholder="e.g. lums.edu.pk"
                      />
                    </div>
                  </>
                )}
                {mode === 'demo' && (
                  <>
                    <div className={styles.formField}>
                      <label htmlFor="orgCode">Institution Code *</label>
                      <input
                        id="orgCode"
                        type="text"
                        required
                        value={form.organizationCode}
                        onChange={(e) => { setDupError(''); setForm({ ...form, organizationCode: e.target.value }); }}
                        onBlur={runDuplicateCheck}
                        placeholder="e.g. MIT, LUMS"
                      />
                    </div>
                    <div className={styles.formField}>
                      <label htmlFor="orgDomain">Email Domain *</label>
                      <input
                        id="orgDomain"
                        type="text"
                        required
                        value={form.domain}
                        onChange={(e) => { setDupError(''); setForm({ ...form, domain: e.target.value }); }}
                        onBlur={runDuplicateCheck}
                        placeholder="e.g. lums.edu.pk"
                      />
                    </div>
                  </>
                )}
                <div className={styles.formField}>
                  <label htmlFor="contactName">Your Name *</label>
                  <input id="contactName" type="text" required value={form.contactName} onChange={set('contactName')} placeholder="Jane Doe" />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="contactEmail">Email *</label>
                  <input id="contactEmail" type="email" required value={form.contactEmail} onChange={set('contactEmail')} placeholder="jane@university.edu" />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="contactPhone">Phone</label>
                  <input id="contactPhone" type="tel" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+1 (555) 000-0000" />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="students">Expected Students</label>
                  <input id="students" type="number" min="1" value={form.expectedStudents} onChange={set('expectedStudents')} placeholder="500" />
                </div>
                <div className={`${styles.formField} ${styles.fullWidth}`}>
                  <label htmlFor="message">Message</label>
                  <textarea id="message" rows={3} value={form.message} onChange={set('message')} placeholder="Tell us about your needs..." />
                </div>
              </div>
              {mode === 'demo' && (
                <p className={styles.slotHint}>
                  Once you submit, we'll email you a link to pick a time that suits you, and you'll get the meeting invite automatically.
                </p>
              )}
              <button type="submit" className={styles.ctaButton} disabled={loading || checking}>
                {checking ? 'Checking...' : loading ? 'Submitting...' : mode === 'signup' ? 'Create My Account' : 'Request Demo'}
                {!loading && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                )}
              </button>
            </form>
          )}

          <div className={styles.trustBadges}>
            {badges.map((b) => (
              <div key={b.text} className={styles.trustBadge}>
                {b.icon === 'card' && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="14" x="2" y="5" rx="2" />
                    <line x1="2" x2="22" y1="10" y2="10" />
                  </svg>
                )}
                {b.icon === 'clock' && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                )}
                {b.icon === 'lock' && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
                {b.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
