import { Check, ArrowRight, Sparkles, Users, Building2, Rocket, CalendarClock, Mail } from 'lucide-react';
import styles from './Pricing.module.css';
import { useScrollReveal } from '../hooks/useScrollReveal';

// Workplace pricing: a free tier for tiny teams, a flat monthly plan for small
// offices (cheaper on the 6-month commitment), and a custom plan for everyone
// larger / multi-branch. No hardware cost in any tier, biometrics run on phones.
interface Plan {
  accent: string;
  Icon: typeof Users;
  name: string;
  desc: string;
  range: string;
  currency?: string;
  price: string;
  period?: string;
  saving?: string;
  sixMonth?: string;
  secondary?: string;
  features: string[];
  cta: { label: string; href: string; Icon: typeof Users };
  highlight?: boolean;
  popular?: boolean;
}

const plans: Plan[] = [
  {
    accent: styles.accentSlate,
    Icon: Users,
    name: 'Starter',
    desc: 'For small teams just getting started',
    range: '0 to 5 employees',
    price: 'Free',
    features: [
      'Up to 5 employees, forever free',
      'Face + contactless fingerprint on any phone',
      'Liveness and anti-spoofing to stop buddy punching',
      'Attendance dashboard and exportable reports',
    ],
    cta: { label: 'Get Started Free', href: '#get-started', Icon: ArrowRight },
  },
  {
    accent: styles.accentBrand,
    Icon: Rocket,
    name: 'Growth',
    desc: 'For growing offices and teams',
    range: '6 to 15 employees',
    currency: 'Rs',
    price: '2,999',
    period: '/mo',
    sixMonth: 'on the 6-month plan',
    secondary: 'Rs 4,999/mo billed monthly',
    features: [
      'Everything in Starter',
      'For 6 to 15 employees',
      'Real-time dashboards + HR & payroll exports',
      'Multi-team management from one place',
      'Role-based access for admins, managers, employees',
    ],
    cta: { label: 'Book a Demo', href: '#get-started', Icon: CalendarClock },
    highlight: true,
    popular: true,
  },
  {
    accent: styles.accentAmber,
    Icon: Building2,
    name: 'Custom',
    desc: 'For larger or multi-branch organizations',
    range: '16+ employees',
    price: "Let's talk",
    features: [
      'Everything in Growth',
      'Unlimited employees, branches, and shifts',
      'Multi-branch and shift-coverage management',
      'API and integrations for HR / payroll / ERP',
      'Priority support and guided onboarding',
    ],
    cta: { label: 'Contact for Pricing', href: '#contact', Icon: Mail },
  },
];

export default function Pricing() {
  const { ref, revealed } = useScrollReveal(0.08);

  return (
    <section
      id="pricing"
      ref={ref as React.RefObject<HTMLElement>}
      className={`${styles.pricingSection}${revealed ? ' revealed' : ''}`}
    >
      <div className="container">
        <div className={`${styles.sectionLead} reveal-zoom`}>
          <span className={styles.sectionLabel}>Pricing</span>
          <h2 className={styles.sectionTitle}>Simple pricing that grows with your team.</h2>
          <p className={styles.sectionSubtitle}>
            Start free, upgrade as you hire. No scanners or terminals to buy, biometrics
            run on the phones your team already has.
          </p>
        </div>

        <div className={`${styles.plansGrid}${revealed ? ' ' + styles.plansGridVisible : ''}`}>
          {plans.map((plan, i) => (
            <div
              key={plan.name}
              className={`${styles.planCard} ${plan.accent}${plan.highlight ? ' ' + styles.planCardHighlight : ''}`}
              style={{ '--delay': `${i * 0.12}s` } as React.CSSProperties}
            >
              <div className={styles.planTopStrip} />

              {plan.popular && (
                <span className={styles.popularBadge}>
                  <Sparkles size={12} strokeWidth={2.5} /> Most popular
                </span>
              )}

              <div className={styles.planHeader}>
                <div className={styles.planIconWrap}>
                  <plan.Icon size={22} strokeWidth={2} />
                </div>
                <div>
                  <div className={styles.planName}>{plan.name}</div>
                  <div className={styles.planDesc}>{plan.desc}</div>
                </div>
              </div>

              <div className={styles.planPriceWrap}>
                <div className={styles.planPrice}>
                  {plan.currency && <span className={styles.priceCurrency}>{plan.currency}</span>}
                  <span className={styles.priceValue}>{plan.price}</span>
                  {plan.period && <span className={styles.pricePeriod}>{plan.period}</span>}
                </div>
                {plan.sixMonth && <span className={styles.sixMonthBadge}>{plan.sixMonth}</span>}
                {plan.secondary && <div className={styles.secondaryPrice}>{plan.secondary}</div>}
                {plan.saving && <span className={styles.savingLine}>{plan.saving}</span>}
              </div>

              <div className={styles.planLimits}>
                <span className={styles.limitPill}>
                  <Users size={12} strokeWidth={2.4} /> {plan.range}
                </span>
              </div>

              <div className={styles.planDivider} />

              <ul className={styles.featureList}>
                {plan.features.map((f) => (
                  <li key={f} className={styles.featureItem}>
                    <span className={styles.checkWrap}>
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <a
                href={plan.cta.href}
                className={`${styles.ctaButton}${plan.highlight ? ' ' + styles.ctaButtonHighlight : ''}`}
              >
                <plan.cta.Icon size={16} strokeWidth={2.2} /> {plan.cta.label}
              </a>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', marginTop: 28, color: '#64748b', fontSize: '0.88rem' }}>
          Prices in PKR. No hardware cost on any plan. Cancel anytime.
        </p>
      </div>
    </section>
  );
}
