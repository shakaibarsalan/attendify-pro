import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { plansApi } from '@/lib/api';
import { Check, ArrowLeft } from 'lucide-react';
import s from './SelectPlanPage.module.css';

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
    students: 'Up to 2,000',
    teachers: 'Up to 100',
    features: ['Everything in Starter', 'Anti-spoof liveness detection', 'Advanced fraud analytics', 'Real-time notifications', 'Priority support'],
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199,
    yearly: 1990,
    desc: 'For large universities',
    students: 'Up to 10,000',
    teachers: 'Up to 500',
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

export default function SelectPlanPage() {
  const [yearly, setYearly] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSelect = async (planId: string) => {
    setError('');
    setLoading(planId);
    try {
      await plansApi.select(planId, yearly ? 'yearly' : 'monthly');
      navigate('/org-admin', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to select plan. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={s.page}>
      <div className={s.container}>
        <button className={s.backBtn} onClick={() => navigate('/org-admin')}>
          <ArrowLeft size={18} />
          Back to Dashboard
        </button>

        <div className={s.header}>
          <h1 className={s.title}>Choose Your Plan</h1>
          <div className={s.trialBanner}>
            Your 14-day free trial has started. Select a plan to continue.
          </div>
        </div>

        {error && <div className={s.alertError}>{error}</div>}

        <div className={s.toggleWrap}>
          <span className={!yearly ? s.toggleActive : undefined}>Monthly</span>
          <button
            className={`${s.toggle} ${yearly ? s.toggleOn : ''}`}
            onClick={() => setYearly(!yearly)}
            aria-label="Toggle billing cycle"
          >
            <span className={s.toggleThumb} />
          </button>
          <span className={yearly ? s.toggleActive : undefined}>
            Yearly
            <span className={s.saveBadge}>Save 2 months</span>
          </span>
        </div>

        <div className={s.plansGrid}>
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`${s.planCard} ${plan.highlight ? s.planCardHighlight : ''}`}
            >
              {plan.highlight && <div className={s.popularBadge}>Most Popular</div>}
              <h3 className={s.planName}>{plan.name}</h3>
              <p className={s.planDesc}>{plan.desc}</p>
              <div className={s.planPrice}>
                <span className={s.priceCurrency}>$</span>
                <span className={s.priceValue}>{yearly ? plan.yearly : plan.price}</span>
                <span className={s.pricePeriod}>/{yearly ? 'yr' : 'mo'}</span>
              </div>
              <div className={s.planLimits}>
                <span>{plan.students} students</span>
                <span className={s.limitSep}>·</span>
                <span>{plan.teachers} teachers</span>
              </div>
              <ul className={s.featureList}>
                {plan.features.map((f) => (
                  <li key={f} className={s.featureItem}>
                    <Check size={16} strokeWidth={2.5} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                className={`${s.ctaButton} ${plan.highlight ? s.ctaButtonHighlight : ''}`}
                onClick={() => handleSelect(plan.id)}
                disabled={loading !== null}
              >
                {loading === plan.id ? 'Processing...' : 'Select Plan'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
