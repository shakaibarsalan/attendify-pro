import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ScanFace,
  Fingerprint,
  QrCode,
  ShieldCheck,
  LayoutDashboard,
  Lock,
} from 'lucide-react';
import styles from './Features.module.css';
import { useScrollReveal } from '../hooks/useScrollReveal';

const features = [
  {
    icon: ScanFace,
    accent: '#6366f1', // indigo
    title: 'AI Face Recognition',
    short: 'Verify student identity in under 2 seconds using webcam footage.',
    detail: 'Deep learning models trained on diverse datasets deliver near-perfect accuracy across all lighting conditions and skin tones. No special hardware required. Just a standard webcam.',
    metric: { value: '<2s', label: 'Avg. verification' },
  },
  {
    icon: Fingerprint,
    accent: '#06b6d4', // cyan
    title: 'Fingerprint Biometrics',
    short: 'USB scanner support with template-based matching.',
    detail: 'Supports industry-standard USB fingerprint scanners with encrypted template storage. Fast, reliable, and spoof-proof biometric verification for high-security environments.',
    metric: { value: '0.01%', label: 'False accept rate' },
  },
  {
    icon: QrCode,
    accent: '#10b981', // emerald
    title: 'QR Code Check-in',
    short: 'Students scan to mark attendance instantly from their phone.',
    detail: 'Teachers generate dynamic session QR codes that rotate every 30 seconds. Students simply scan with their phone camera. No app install required.',
    metric: { value: '30s', label: 'QR rotation' },
  },
  {
    icon: ShieldCheck,
    accent: '#f43f5e', // rose
    title: 'Fraud Detection',
    short: 'Liveness detection and GPS geofencing catch proxy attempts.',
    detail: 'Multi-layered fraud prevention: AI liveness detection prevents photo/video spoofing, GPS geofencing ensures on-campus presence, and multi-device alerts flag suspicious patterns.',
    metric: { value: '100%', label: 'Proxy blocked' },
  },
  {
    icon: LayoutDashboard,
    accent: '#f59e0b', // amber
    title: 'Real-time Dashboards',
    short: 'Live attendance feeds with exportable reports.',
    detail: 'Monitor attendance as it happens with live feeds, trend analysis charts, and one-click exportable reports. Built for compliance teams and administrators.',
    metric: { value: 'Live', label: 'Updates' },
  },
  {
    icon: Lock,
    accent: '#8b5cf6', // violet
    title: 'Role-based Access',
    short: 'Tailored dashboards for every user type.',
    detail: 'System admins, institution admins, teachers, and students each get a purpose-built interface with precisely scoped permissions. No over-provisioned access.',
    metric: { value: '4', label: 'Role types' },
  },
];

const AUTO_INTERVAL = 3500;

function useIsMobile(query = '(max-width: 900px)') {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return isMobile;
}

export default function Features() {
  const IS_MOBILE = useIsMobile();
  const { ref: sectionRef, revealed } = useScrollReveal(0.08);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);
  const isFadingRef = useRef(false);
  const isHoveredRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setFeature = useCallback((idx: number) => {
    if (idx === activeIndexRef.current) return;
    isFadingRef.current = true;
    setIsFading(true);
    setTimeout(() => {
      activeIndexRef.current = idx;
      setActiveIndex(idx);
      setIsFading(false);
      isFadingRef.current = false;
    }, 150);
  }, []);

  const startAuto = useCallback(() => {
    if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    autoTimerRef.current = setInterval(() => {
      if (!isHoveredRef.current && !isFadingRef.current) {
        const next = (activeIndexRef.current + 1) % features.length;
        setFeature(next);
      }
    }, AUTO_INTERVAL);
  }, [setFeature]);

  useEffect(() => {
    if (IS_MOBILE) return;
    startAuto();
    return () => { if (autoTimerRef.current) clearInterval(autoTimerRef.current); };
  }, [startAuto, IS_MOBILE]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const segment = rect.height / features.length;
    const idx = Math.min(Math.floor(y / segment), features.length - 1);
    if (idx !== activeIndexRef.current) {
      setFeature(idx);
      startAuto();
    }
  }, [setFeature, startAuto]);

  const handleClick = (i: number) => {
    setFeature(i);
    startAuto();
  };

  const active = features[activeIndex];
  const ActiveIcon = active.icon;

  if (IS_MOBILE) {
    return (
      <section
        id="features"
        ref={sectionRef as React.RefObject<HTMLElement>}
        className={`${styles.featuresSection}${revealed ? ' revealed' : ''}`}
      >
        <div className="container">
          <div className={`${styles.sectionLead} reveal-zoom`}>
            <span className={styles.sectionLabel}>Platform features</span>
            <h2 className={styles.sectionTitle}>Everything you need. Nothing you don't.</h2>
          </div>
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className={styles.mobileCard}>
                <div className={styles.panelCard} style={{ '--accent': f.accent } as React.CSSProperties}>
                  <div className={styles.panelIconWrap}>
                    <Icon size={32} strokeWidth={1.5} />
                  </div>
                  <h3 className={styles.panelTitle}>{f.title}</h3>
                  <p className={styles.panelDetail}>{f.detail}</p>
                  <div className={styles.panelMetric}>
                    <span className={styles.panelMetricValue}>{f.metric.value}</span>
                    <span className={styles.panelMetricLabel}>{f.metric.label}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section
      id="features"
      ref={sectionRef as React.RefObject<HTMLElement>}
      className={`${styles.featuresSection}${revealed ? ' revealed' : ''}`}
    >
      <div className="container">
        <div className={`${styles.sectionLead} reveal-zoom`}>
          <span className={styles.sectionLabel}>Platform features</span>
          <h2 className={styles.sectionTitle}>Everything you need. Nothing you don't.</h2>
        </div>
      </div>

      <div className="container">
        <div className={styles.splitLayout}>
          <div
            className={styles.stage}
            ref={stageRef}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => { isHoveredRef.current = true; }}
            onMouseLeave={() => { isHoveredRef.current = false; }}
          >
            {features.map((f, i) => {
              const Icon = f.icon;
              const isActive = i === activeIndex;
              const d = Math.abs(i - activeIndex);
              const scale = isActive ? 1 : 0.985 - d * 0.004;
              const tz = isActive ? 24 : -d * 7;
              const ty = isActive ? 0 : 0;
              const z = isActive ? 50 : 50 - d * 8;
              return (
                <div
                  key={f.title}
                  className={`${styles.card} ${isActive ? styles.cardFront : ''}`}
                  onClick={() => handleClick(i)}
                  style={{
                    transform: `translateY(${ty}px) translateZ(${tz}px) scale(${scale})`,
                    zIndex: z,
                    '--accent': f.accent,
                  } as React.CSSProperties}
                >
                  <div className={styles.cardIcon}>
                    <Icon size={22} strokeWidth={1.8} />
                  </div>
                  <div className={styles.cardBody}>
                    <h4 className={styles.cardTitle}>{f.title}</h4>
                    <p className={styles.cardShort}>{f.short}</p>
                  </div>
                  <div className={styles.cardMetric}>
                    <span className={styles.cardMetricValue}>{f.metric.value}</span>
                    <span className={styles.cardMetricLabel}>{f.metric.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.detailPanel}>
            <div
              className={`${styles.panelCard} ${isFading ? styles.panelCardFade : ''}`}
              style={{ '--accent': active.accent } as React.CSSProperties}
            >
              <div className={styles.panelIconWrap}>
                <ActiveIcon size={32} strokeWidth={1.5} />
              </div>
              <h3 className={styles.panelTitle}>{active.title}</h3>
              <p className={styles.panelDetail}>{active.detail}</p>
              <div className={styles.panelMetric}>
                <span className={styles.panelMetricValue}>{active.metric.value}</span>
                <span className={styles.panelMetricLabel}>{active.metric.label}</span>
              </div>
              <div className={styles.panelVisual}>
                <div className={styles.panelBar}>
                  <div className={styles.panelBarFill} key={`a-${activeIndex}`} />
                </div>
                <div className={styles.panelBar}>
                  <div className={`${styles.panelBarFill} ${styles.panelBarFillMid}`} key={`b-${activeIndex}`} />
                </div>
                <div className={styles.panelBar}>
                  <div className={`${styles.panelBarFill} ${styles.panelBarFillShort}`} key={`c-${activeIndex}`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
