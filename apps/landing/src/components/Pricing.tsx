import { useState, useRef, useEffect } from 'react';
import { Check, Zap, Star, Building2, Globe, ArrowRight, Users, GraduationCap } from 'lucide-react';
import styles from './Pricing.module.css';
import { useScrollReveal } from '../hooks/useScrollReveal';

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: 29,
    yearly: 290,
    desc: 'For small institutes',
    students: 'Up to 500',
    teachers: 'Up to 20',
    features: ['Face recognition attendance', 'QR code attendance', 'Basic analytics dashboard', 'Email support'],
    highlight: false,
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 79,
    yearly: 790,
    desc: 'For growing universities',
    students: 'Up to 2,500',
    teachers: 'Up to 120',
    features: ['Everything in Starter', 'Anti-spoof liveness detection', 'Advanced fraud analytics', 'Real-time notifications', 'Priority support'],
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199,
    yearly: 1990,
    desc: 'For large universities',
    students: 'Up to 12,000',
    teachers: 'Up to 600',
    features: ['Everything in Professional', 'Multi-campus support', 'Custom integrations & API', 'Dedicated account manager', '24/7 priority support'],
    highlight: false,
  },
  {
    id: 'unlimited',
    name: 'Unlimited',
    price: 499,
    yearly: 4990,
    desc: 'University networks',
    students: 'Unlimited',
    teachers: 'Unlimited',
    features: ['Everything in Enterprise', 'White-label branding', 'On-premise deployment', 'SLA guarantee', 'Custom AI model training'],
    highlight: false,
  },
];

const tierMeta: Record<string, { Icon: React.ElementType; accent: string }> = {
  starter:      { Icon: Zap,       accent: styles.accentSlate   },
  professional: { Icon: Star,      accent: styles.accentBrand   },
  enterprise:   { Icon: Building2, accent: styles.accentEmerald },
  unlimited:    { Icon: Globe,     accent: styles.accentAmber   },
};

export default function Pricing() {
  const [yearly, setYearly] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const { ref: sectionRef, revealed } = useScrollReveal(0.08);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      id="pricing"
      ref={sectionRef as React.RefObject<HTMLElement>}
      className={`${styles.pricingSection}${revealed ? ' revealed' : ''}`}
    >
      <div className="container">
        <div className={`${styles.sectionLead} reveal-zoom`}>
          <span className={styles.sectionLabel}>Pricing</span>
          <h2 className={styles.sectionTitle}>Simple, transparent pricing.</h2>
          <p className={styles.sectionSubtitle}>
            Start with a 14-day free trial. No credit card required.
          </p>
        </div>

        <div className={`${styles.toggleWrap} reveal-up`} style={{ '--d': '0.2s' } as React.CSSProperties}>
          <span className={!yearly ? styles.toggleActive : undefined}>Monthly</span>
          <button
            className={`${styles.toggle} ${yearly ? styles.toggleOn : ''}`}
            onClick={() => setYearly(!yearly)}
            aria-label="Toggle billing cycle"
          >
            <span className={styles.toggleThumb} />
          </button>
          <span className={yearly ? styles.toggleActive : undefined}>
            Yearly
            <span className={styles.saveBadge}>Save 2 months</span>
          </span>
        </div>

        <div
          className="reveal-up"
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '10px 16px',
            margin: '0 auto 28px', maxWidth: 680, padding: '14px 20px', borderRadius: 14,
            background: 'rgba(13,148,136,0.07)', border: '1px solid rgba(13,148,136,0.22)', textAlign: 'center',
            '--d': '0.28s',
          } as React.CSSProperties}
        >
          <span style={{ fontWeight: 700, color: '#0f766e' }}>Free forever</span>
          <span style={{ color: '#475569', fontSize: '0.92rem' }}>
            Up to <strong>100 students</strong> · Face &amp; QR attendance · no credit card.
          </span>
          <a href="#get-started" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.88rem',
            color: '#0d9488', textDecoration: 'none',
          }}>
            Start free <ArrowRight size={14} strokeWidth={2.4} />
          </a>
        </div>

        <div
          ref={gridRef}
          className={`${styles.plansGrid} ${inView ? styles.plansGridVisible : ''}`}
        >
          {plans.map((plan, i) => {
            const { Icon: TierIcon, accent } = tierMeta[plan.id];
            const annualSaving = plan.price * 12 - plan.yearly;

            return (
              <div
                key={plan.id}
                className={`${styles.planCard} ${plan.highlight ? styles.planCardHighlight : ''} ${accent}`}
                style={{ '--delay': `${i * 0.12}s` } as React.CSSProperties}
              >
                <div className={styles.planTopStrip} />

                {plan.highlight && (
                  <div className={styles.popularBadge}>
                    <Star size={11} strokeWidth={0} fill="currentColor" />
                    Most Popular
                  </div>
                )}

                <div className={styles.planHeader}>
                  <div className={styles.planIconWrap}>
                    <TierIcon size={20} strokeWidth={1.8} />
                  </div>
                  <div>
                    <h3 className={styles.planName}>{plan.name}</h3>
                    <p className={styles.planDesc}>{plan.desc}</p>
                  </div>
                </div>

                <div className={styles.planPriceWrap}>
                  <div className={styles.planPrice}>
                    <span className={styles.priceCurrency}>$</span>
                    <span className={styles.priceValue}>{yearly ? plan.yearly : plan.price}</span>
                    <span className={styles.pricePeriod}>/{yearly ? 'yr' : 'mo'}</span>
                  </div>
                  {yearly && (
                    <span className={styles.savingLine}>Saves ${annualSaving} vs monthly</span>
                  )}
                </div>

                <div className={styles.planLimits}>
                  <span className={styles.limitPill}>
                    <Users size={12} strokeWidth={2} />
                    {plan.students}
                  </span>
                  <span className={styles.limitPill}>
                    <GraduationCap size={12} strokeWidth={2} />
                    {plan.teachers}
                  </span>
                </div>

                <div className={styles.planDivider} />

                <ul className={styles.featureList}>
                  {plan.features.map((f) => (
                    <li key={f} className={styles.featureItem}>
                      <span className={styles.checkWrap}>
                        <Check size={11} strokeWidth={3} />
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href="#get-started"
                  className={`${styles.ctaButton} ${plan.highlight ? styles.ctaButtonHighlight : ''}`}
                >
                  Get Started
                  <ArrowRight size={15} strokeWidth={2.2} />
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
