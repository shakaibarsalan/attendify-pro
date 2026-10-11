import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ScanFace, ShieldCheck, Building2, GraduationCap, Eye, EyeOff, Mail, Lock,
  ArrowRight, AlertCircle, Users, BarChart3, Zap, QrCode, Fingerprint, CalendarDays, Check,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';
import { rememberRole } from '@/lib/loginPath';

// Brand wordmark colours (match the Attendify logo): navy "Atten" + teal "dify".
const LOGO_NAVY = '#23286b';
const LOGO_TEAL = '#0d9488';
const LOGO_CHARS = [...'Attendıfy']; // dotless ı so the teal check sits where the dot would be

export type PortalRole = 'system' | 'org' | 'teacher' | 'student';

interface Accent { c50: string; c500: string; c600: string; c700: string; ring: string; glow: string; }

const ACCENTS: Record<PortalRole, Accent> = {
  system: { c50: '#faf5ff', c500: '#a855f7', c600: '#9333ea', c700: '#7e22ce', ring: 'rgba(147,51,234,.3)', glow: 'rgba(147,51,234,.5)' },
  org:    { c50: '#eff6ff', c500: '#3b82f6', c600: '#2563eb', c700: '#1d4ed8', ring: 'rgba(37,99,235,.3)',  glow: 'rgba(37,99,235,.5)' },
  teacher:{ c50: '#ecfdf5', c500: '#10b981', c600: '#059669', c700: '#047857', ring: 'rgba(5,150,105,.3)',  glow: 'rgba(5,150,105,.5)' },
  student:{ c50: '#f0fdfa', c500: '#14b8a6', c600: '#0d9488', c700: '#0f766e', ring: 'rgba(13,148,136,.3)', glow: 'rgba(13,148,136,.5)' },
};

interface RoleConfig {
  label: string; badge: string; icon: LucideIcon; heading: string; sub: string; value: string;
  route: string; bullets: { icon: LucideIcon; text: string }[];
}

const ROLES: Record<PortalRole, RoleConfig> = {
  system: {
    label: 'System Admin', badge: 'System Administrator', icon: ShieldCheck,
    heading: 'System Administration', sub: 'Secure access to the Attendify platform control center.',
    value: 'Command center for the entire Attendify platform.', route: '/login/system-admin',
    bullets: [
      { icon: ShieldCheck, text: 'Liveness & anti-spoofing, always on' },
      { icon: Users, text: 'Manage every organization' },
      { icon: BarChart3, text: 'Platform-wide analytics' },
    ],
  },
  org: {
    label: 'Organization', badge: 'Organization', icon: Building2,
    heading: 'Welcome back', sub: "Sign in to manage your institution's attendance.",
    value: 'Smart, secure attendance for your whole institution.', route: '/login/org-admin',
    bullets: [
      { icon: Building2, text: 'Multi-campus management' },
      { icon: Users, text: 'Teachers, classes & students' },
      { icon: BarChart3, text: 'Real-time attendance insights' },
    ],
  },
  teacher: {
    label: 'Teacher', badge: 'Teacher', icon: GraduationCap,
    heading: 'Hello, Teacher', sub: 'Start a session and take attendance in seconds.',
    value: 'Take attendance in seconds — not minutes.', route: '/login/teacher',
    bullets: [
      { icon: Zap, text: 'Start a session in seconds' },
      { icon: ScanFace, text: 'Face-recognition roll call' },
      { icon: CalendarDays, text: 'Timetables & schedules' },
    ],
  },
  student: {
    label: 'Student', badge: 'Student', icon: ScanFace,
    heading: 'Mark your attendance', sub: 'Sign in to check in with your face, QR, or fingerprint.',
    value: 'Your face is your attendance. Check in with a tap.', route: '/login/student',
    bullets: [
      { icon: ScanFace, text: 'Check in with your face' },
      { icon: QrCode, text: 'Scan the class QR code' },
      { icon: Fingerprint, text: 'Contactless fingerprint' },
    ],
  },
};

const ORDER: PortalRole[] = ['system', 'org', 'teacher', 'student'];

// Demo accounts for quick testing/exploration. Every account's password is the
// same seeded value below. One account per organization so each role's demo
// shows a self-contained, internally-consistent slice of the data:
//   teacher -> belongs to a unique org, owns the courses
//   student -> enrolled in those courses under that org's teacher
// Backed by the seed migrations 002_dummy_data.sql + 014_demo_seed.sql.
// Shared password of the seeded demo accounts. Never committed: set
// VITE_DEMO_PASSWORD at build time to show the demo quick-fill panel.
const DEMO_PASSWORD: string = import.meta.env.VITE_DEMO_PASSWORD ?? '';

interface DemoAccount { name: string; meta: string; email: string; }

const DEMO_ACCOUNTS: Partial<Record<PortalRole, DemoAccount[]>> = {
  org: [
    { name: 'UMT',     meta: 'Univ. of Management & Tech.', email: 'orgadmin@umt.edu.pk' },
    { name: 'UET',     meta: 'Univ. of Engineering & Tech.', email: 'orgadmin@uet.edu.pk' },
    { name: 'COMSATS', meta: 'COMSATS University',           email: 'orgadmin@comsats.edu.pk' },
    { name: 'NUST',    meta: 'Nat. Univ. of Sciences & Tech.', email: 'orgadmin@nust.edu.pk' },
  ],
  teacher: [
    { name: 'Prof. Sarah Khan',   meta: 'UMT · AI, Databases',  email: 'teacher1@umt.edu.pk' },
    { name: 'Prof. Usman Tariq',  meta: 'UET · DSA, OS',        email: 'teacher1@uet.edu.pk' },
    { name: 'Prof. Zainab Malik', meta: 'COMSATS · SPM, ML',    email: 'teacher1@comsats.edu.pk' },
    { name: 'Prof. Ayesha Saeed', meta: 'NUST · Programming',   email: 'teacher1@nust.edu.pk' },
  ],
  student: [
    { name: 'Muhammad Shakaib', meta: 'UMT · 22F-BCS-001',     email: 'student1@umt.edu.pk' },
    { name: 'Hamza Iqbal',      meta: 'UET · 2022-CSE-001',    email: 'student1@uet.edu.pk' },
    { name: 'Talha Mehmood',    meta: 'COMSATS · 2022-SE-001', email: 'student1@comsats.edu.pk' },
    { name: 'Ali Hassan',       meta: 'NUST · 2022-CS-001',    email: 'student1@nust.edu.pk' },
  ],
};

export default function RoleLogin({ role, demo = false }: { role: PortalRole; demo?: boolean }) {
  const cfg = ROLES[role];
  const a = ACCENTS[role];
  const navigate = useNavigate();
  const { setUser } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const doLogin = async (loginEmail: string, loginPassword: string) => {
    setError('');
    if (!loginEmail || !loginPassword) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      const res = await authApi.login(loginEmail, loginPassword);
      localStorage.setItem('accessToken', res.accessToken);
      localStorage.setItem('refreshToken', res.refreshToken);
      localStorage.setItem('attendify_last_activity', String(Date.now()));
      rememberRole(res.user.role); // so logout returns to this portal
      setUser(res.user);
      // Temp-password users go to their dashboard; the ForceChangePasswordModal prompts them there.
      switch (res.user.role) {
        case 'system_admin': navigate('/system-admin'); break;
        case 'org_admin': navigate('/org-admin'); break;
        case 'teacher': navigate('/teacher'); break;
        case 'student': navigate('/student'); break;
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doLogin(email, password);
  };

  // Quick-fill a demo account into the form (does NOT log in — the user reviews
  // the credentials and presses Sign in themselves).
  const fillDemo = (acc: DemoAccount) => {
    setEmail(acc.email);
    setPassword(DEMO_PASSWORD);
    setError('');
  };

  const demos = DEMO_PASSWORD ? DEMO_ACCOUNTS[role] : undefined;
  const [showDemos, setShowDemos] = useState(false);
  // Switch-portal links stay in the current mode: on /login-demo/* keep using
  // the demo pages, on /login/* keep using the production pages.
  const toPath = (route: string) => (demo ? route.replace('/login/', '/login-demo/') : route);

  const Icon = cfg.icon;
  const panelGrad = `linear-gradient(150deg, ${a.c700} 0%, ${a.c600} 50%, ${a.c500} 100%)`;
  const btnGrad = `linear-gradient(135deg, ${a.c600}, ${a.c500})`;

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-5 overflow-y-auto overflow-x-hidden" style={{ background: panelGrad }}>
      {/* Restored: big faded role icon in the top-right corner (+ one for balance) */}
      <div className="absolute -right-12 -top-12 pointer-events-none text-white" style={{ opacity: 0.09 }}><Icon size={300} strokeWidth={1.15} /></div>
      <div className="absolute -left-16 -bottom-16 pointer-events-none text-white" style={{ opacity: 0.06 }}><ScanFace size={260} strokeWidth={1.15} /></div>
      {/* drifting soft orbs */}
      <motion.div className="absolute rounded-full pointer-events-none" style={{ width: 340, height: 340, top: '-8%', left: '-7%', background: 'rgba(255,255,255,.10)', filter: 'blur(64px)' }}
        animate={{ y: [0, 24, 0], x: [0, 16, 0] }} transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute rounded-full pointer-events-none" style={{ width: 380, height: 380, bottom: '-10%', right: '-8%', background: 'rgba(255,255,255,.08)', filter: 'blur(72px)' }}
        animate={{ y: [0, -22, 0], x: [0, -14, 0] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(110% 70% at 50% -5%, rgba(255,255,255,.14), transparent 55%)' }} />

      {/* Single centered card */}
      <motion.div
        key={role}
        initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative w-full max-w-[440px] my-auto bg-white rounded-[28px] border border-white/50 px-8 py-9"
        style={{ boxShadow: '0 34px 90px -28px rgba(0,0,0,.5)' }}
      >
        <div className="w-full max-w-[380px] mx-auto">
          {/* Animated wordmark logo — each letter staggers in; teal check over the i */}
          <div className="flex flex-col items-center text-center mb-6">
            <motion.div
              className="mb-3.5 flex items-baseline justify-center select-none"
              aria-label="Attendify"
              style={{ fontFamily: "'Poppins','Inter',sans-serif", fontWeight: 800, fontSize: 34, letterSpacing: '-0.6px', lineHeight: 1, filter: 'drop-shadow(0 6px 16px rgba(13,148,136,.18))' }}
              animate={{ y: [0, -4, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            >
              {LOGO_CHARS.map((ch, i) => (
                <span key={i} className="relative inline-block" aria-hidden="true">
                  <motion.span
                    className="inline-block"
                    initial={{ opacity: 0, y: 18, scale: 0.5, rotate: -10 }}
                    animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                    transition={{ duration: 0.5, delay: 0.12 + i * 0.075, ease: [0.2, 1.5, 0.4, 1] }}
                    style={{ color: i < 6 ? LOGO_NAVY : LOGO_TEAL }}
                  >
                    {ch}
                  </motion.span>
                  {i === 6 && (
                    <motion.span
                      className="absolute pointer-events-none" style={{ left: '50%', top: '-0.30em', transform: 'translateX(-50%)', color: LOGO_TEAL }}
                      initial={{ opacity: 0, scale: 0, rotate: -35 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      transition={{ delay: 0.12 + 6 * 0.075 + 0.18, duration: 0.45, ease: 'backOut' }}
                    >
                      <Check size={13} strokeWidth={4} />
                    </motion.span>
                  )}
                </span>
              ))}
            </motion.div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold" style={{ background: a.c50, color: a.c600 }}>
              <Icon size={14} strokeWidth={2.2} /><span>{cfg.badge}</span>
            </div>
          </div>

          <h1 className="text-[24px] font-extrabold text-gray-900 tracking-tight text-center mb-1.5">{cfg.heading}</h1>
          <p className="text-[14.5px] text-gray-500 leading-relaxed text-center mb-6">{cfg.sub}</p>

          {error && (
              <div role="alert" className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl text-[13.5px] font-medium leading-snug mb-5">
                <AlertCircle size={18} className="shrink-0 mt-px" /><span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label htmlFor="att-email" className="block text-[13px] font-semibold text-gray-700 mb-1.5">Email</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input id="att-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" autoComplete="email"
                    className="w-full pl-[42px] pr-3.5 py-3 border-[1.5px] border-gray-200 rounded-xl text-[14.5px] font-medium text-gray-900 outline-none focus:ring-2 transition-shadow"
                    style={{ ['--tw-ring-color' as any]: a.ring }} onFocus={(e) => (e.currentTarget.style.borderColor = a.c500)} onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')} />
                </div>
              </div>

              <div className="mb-3.5">
                <label htmlFor="att-pass" className="block text-[13px] font-semibold text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input id="att-pass" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"
                    className="w-full pl-[42px] pr-12 py-3 border-[1.5px] border-gray-200 rounded-xl text-[14.5px] font-medium text-gray-900 outline-none focus:ring-2 transition-shadow"
                    style={{ ['--tw-ring-color' as any]: a.ring }} onFocus={(e) => (e.currentTarget.style.borderColor = a.c500)} onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')} />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end mb-4">
                <Link to="/forgot-password" className="text-[13px] font-semibold hover:underline" style={{ color: a.c600 }}>Forgot password?</Link>
              </div>

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-white font-semibold text-[15px] disabled:opacity-70 transition-all hover:-translate-y-px active:translate-y-px"
                style={{ background: btnGrad, boxShadow: `0 12px 26px -10px ${a.glow}` }}>
                {loading ? (
                  <><span className="w-[17px] h-[17px] rounded-full border-2 border-white/40 border-t-white animate-spin" /><span>Signing in…</span></>
                ) : (
                  <><span>Sign in</span><ArrowRight size={17} strokeWidth={2.2} /></>
                )}
              </button>
            </form>

            {demo && demos && demos.length > 0 && (
              <div className="mt-6">
                <label className="flex items-center justify-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showDemos}
                    onChange={(e) => setShowDemos(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-gray-300"
                    style={{ accentColor: a.c600 }}
                  />
                  <span className="text-[12px] font-medium text-gray-400">Show demo accounts</span>
                </label>

                {showDemos && (
                  <div className="mt-3">
                    <div className="grid grid-cols-2 gap-2">
                      {demos.map((acc) => (
                        <button
                          key={acc.email}
                          type="button"
                          onClick={() => fillDemo(acc)}
                          title={`${acc.email} · ${DEMO_PASSWORD}`}
                          className="flex flex-col items-start text-left px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 transition-colors"
                          style={{ borderColor: '#eef0f3' }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = a.c500)}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#eef0f3')}
                        >
                          <span className="text-[13px] font-semibold text-gray-800 leading-tight truncate w-full">{acc.name}</span>
                          <span className="text-[11.5px] text-gray-400 leading-tight truncate w-full">{acc.meta}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[11.5px] text-gray-400 text-center mt-2.5">Tap an account to fill the form · password <span className="font-mono text-gray-500">{DEMO_PASSWORD}</span></p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 pt-5 border-t border-gray-100 text-center">
              <div className="text-[13px] font-medium text-gray-400">Not the {cfg.label}? Switch portal</div>
              <div className="flex justify-center gap-2 flex-wrap mt-3">
                {ORDER.filter((r) => r !== role).map((r) => {
                  const O = ROLES[r];
                  const Oi = O.icon;
                  return (
                    <button key={r} onClick={() => navigate(toPath(O.route))}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-[12.5px] font-semibold text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all">
                      <Oi size={16} strokeWidth={2} /><span>{O.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="font-mono text-[11.5px] text-gray-300 mt-4 tracking-wide">attendify.pro{toPath(cfg.route)}</div>
            </div>
          </div>
      </motion.div>
    </div>
  );
}
