import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ScanFace, ShieldCheck, Building2, GraduationCap, Eye, EyeOff, Mail, Lock,
  ArrowRight, AlertCircle, QrCode, Fingerprint, type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';
import { rememberRole } from '@/lib/loginPath';
import type { PortalRole } from './RoleLogin';
import AttendifyWordmark from '@/components/AttendifyWordmark';

// Alternate login layout: header tabs + branded split panel (user-selectable).
// NOTE: keep the accent colours in sync with RoleLogin's ACCENTS (e.g. student = teal).
interface Accent { c50: string; c100: string; c500: string; c600: string; c700: string; grad: string; shadow: string; ring: string; }
const ACCENTS: Record<PortalRole, Accent> = {
  system:  { c50: '#faf5ff', c100: '#f3e8ff', c500: '#a855f7', c600: '#9333ea', c700: '#7e22ce', grad: 'linear-gradient(135deg,#9333ea,#a855f7)', shadow: 'rgba(147,51,234,.5)', ring: 'rgba(147,51,234,.18)' },
  org:     { c50: '#eff6ff', c100: '#dbeafe', c500: '#3b82f6', c600: '#2563eb', c700: '#1d4ed8', grad: 'linear-gradient(135deg,#2563eb,#3b82f6)', shadow: 'rgba(37,99,235,.5)',  ring: 'rgba(37,99,235,.18)' },
  teacher: { c50: '#ecfdf5', c100: '#d1fae5', c500: '#10b981', c600: '#059669', c700: '#047857', grad: 'linear-gradient(135deg,#059669,#10b981)', shadow: 'rgba(5,150,105,.45)', ring: 'rgba(5,150,105,.18)' },
  student: { c50: '#f0fdfa', c100: '#ccfbf1', c500: '#14b8a6', c600: '#0d9488', c700: '#0f766e', grad: 'linear-gradient(135deg,#0d9488,#14b8a6)', shadow: 'rgba(13,148,136,.45)', ring: 'rgba(13,148,136,.18)' },
};

interface RoleCfg { label: string; chip: string; icon: LucideIcon; headline: string; subline: string; heading: string; sub: string; route: string; }
const ROLES: Record<PortalRole, RoleCfg> = {
  system:  { label: 'System', chip: 'System Administrator', icon: ShieldCheck, headline: 'Your secure control center.', subline: 'Manage organizations, policies, and platform-wide security from one place.', heading: 'System Administration', sub: 'Secure access to the Attendify platform control center.', route: '/login/system-admin' },
  org:     { label: 'Organization', chip: 'Organization', icon: Building2, headline: 'Attendance, handled.', subline: 'One dashboard for your campuses, classes, and people.', heading: 'Welcome back', sub: "Sign in to manage your institution's attendance.", route: '/login/org-admin' },
  teacher: { label: 'Teacher', chip: 'Teacher', icon: GraduationCap, headline: 'Roll call in seconds.', subline: 'Start a session and let face recognition mark attendance for you.', heading: 'Hello, Teacher', sub: 'Start a session and take attendance in seconds.', route: '/login/teacher' },
  student: { label: 'Student', chip: 'Student', icon: ScanFace, headline: 'Your face is your pass.', subline: 'Check in to class with face, QR, or contactless fingerprint.', heading: 'Mark your attendance', sub: 'Sign in to check in with your face, QR, or fingerprint.', route: '/login/student' },
};

const ORDER: PortalRole[] = ['system', 'org', 'teacher', 'student'];
const METHODS: [LucideIcon, string][] = [[ScanFace, 'Face recognition'], [QrCode, 'QR check-in'], [Fingerprint, 'Fingerprint']];

// Shared password of the seeded demo accounts. Never committed: set
// VITE_DEMO_PASSWORD at build time to show the demo quick-fill panel.
const DEMO_PASSWORD: string = import.meta.env.VITE_DEMO_PASSWORD ?? '';
interface DemoAccount { name: string; meta: string; email: string; }
const DEMO_ACCOUNTS: Partial<Record<PortalRole, DemoAccount[]>> = {
  org: [
    { name: 'UMT', meta: 'Univ. of Management & Tech.', email: 'orgadmin@umt.edu.pk' },
    { name: 'UET', meta: 'Univ. of Engineering & Tech.', email: 'orgadmin@uet.edu.pk' },
    { name: 'COMSATS', meta: 'COMSATS University', email: 'orgadmin@comsats.edu.pk' },
    { name: 'NUST', meta: 'Nat. Univ. of Sciences & Tech.', email: 'orgadmin@nust.edu.pk' },
  ],
  teacher: [
    { name: 'Prof. Sarah Khan', meta: 'UMT · AI, Databases', email: 'teacher1@umt.edu.pk' },
    { name: 'Prof. Usman Tariq', meta: 'UET · DSA, OS', email: 'teacher1@uet.edu.pk' },
    { name: 'Prof. Zainab Malik', meta: 'COMSATS · SPM, ML', email: 'teacher1@comsats.edu.pk' },
    { name: 'Prof. Ayesha Saeed', meta: 'NUST · Programming', email: 'teacher1@nust.edu.pk' },
  ],
  student: [
    { name: 'Muhammad Shakaib', meta: 'UMT · 22F-BCS-001', email: 'student1@umt.edu.pk' },
    { name: 'Hamza Iqbal', meta: 'UET · 2022-CSE-001', email: 'student1@uet.edu.pk' },
    { name: 'Talha Mehmood', meta: 'COMSATS · 2022-SE-001', email: 'student1@comsats.edu.pk' },
    { name: 'Ali Hassan', meta: 'NUST · 2022-CS-001', email: 'student1@nust.edu.pk' },
  ],
};

export default function RoleLoginSplit({ role, demo = false }: { role: PortalRole; demo?: boolean }) {
  const cfg = ROLES[role];
  const a = ACCENTS[role];
  const Icon = cfg.icon;
  const navigate = useNavigate();
  const { setUser } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDemos, setShowDemos] = useState(false);
  const demos = DEMO_PASSWORD ? DEMO_ACCOUNTS[role] : undefined;
  // Switch-portal links stay in the current mode: on /login-demo/* keep using
  // the demo pages, on /login/* keep using the production pages.
  const toPath = (route: string) => (demo ? route.replace('/login/', '/login-demo/') : route);

  const doLogin = async (loginEmail: string, loginPassword: string) => {
    setError('');
    if (!loginEmail || !loginPassword) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      const res = await authApi.login(loginEmail, loginPassword);
      localStorage.setItem('accessToken', res.accessToken);
      localStorage.setItem('refreshToken', res.refreshToken);
      localStorage.setItem('attendify_last_activity', String(Date.now()));
      rememberRole(res.user.role);
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
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); doLogin(email, password); };
  const fillDemo = (acc: DemoAccount) => { setEmail(acc.email); setPassword(DEMO_PASSWORD); setError(''); };

  return (
    <motion.div key={role} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}
      className="min-h-screen w-full flex flex-wrap bg-white">

      {/* Split body (no header navbar) */}
      {/* LEFT branded panel */}
      <div className="flex-1 basis-1/2 min-w-[340px] min-h-screen relative px-14 py-14 flex flex-col justify-center overflow-hidden"
        style={{ background: `linear-gradient(150deg, ${a.c100} 0%, ${a.c50} 55%, ${a.c100} 100%)`, borderRight: '1px solid #e5e9f0' }}>
          <div className="absolute pointer-events-none" style={{ right: -55, top: -40, width: 290, height: 290, borderRadius: '50%', background: `radial-gradient(circle, ${a.c100}, transparent 70%)`, opacity: 0.55 }} />
          {/* Faded role-icon decorations — fully visible in the top-right and bottom-left corners (follow the role) */}
          <Icon className="absolute pointer-events-none" size={128} strokeWidth={1.3} style={{ right: 20, top: 18, color: a.c600, opacity: 0.14 }} />
          <Icon className="absolute pointer-events-none" size={112} strokeWidth={1.3} style={{ left: 20, bottom: 18, color: a.c600, opacity: 0.11 }} />

          {/* Attendify logo */}
          <div className="relative mb-8"><AttendifyWordmark size={30} /></div>

          <div className="relative self-start inline-flex items-center gap-[7px] px-3 py-1.5 rounded-full font-semibold text-[12.5px]" style={{ background: a.c100, color: a.c700 }}>
            <Icon size={14} strokeWidth={2.1} /><span>{cfg.chip}</span>
          </div>

          <h2 className="relative mt-[22px] font-extrabold text-[38px] leading-[1.1] tracking-tight text-slate-900 max-w-[420px]" style={{ textWrap: 'balance' } as any}>{cfg.headline}</h2>
          <p className="relative mt-4 text-[16px] leading-[1.55] text-slate-500 max-w-[380px]">{cfg.subline}</p>

          {/* scan emblem + methods */}
          <div className="relative mt-[38px] flex items-center gap-[22px] flex-wrap">
            <div className="relative w-[122px] h-[122px] flex-none rounded-[28px] flex items-center justify-center" style={{ background: `linear-gradient(150deg, ${a.c100}, ${a.c50})`, border: `1px solid ${a.c100}` }}>
              <Icon size={52} strokeWidth={1.7} style={{ color: a.c600 }} />
              <span className="absolute" style={{ top: 14, left: 14, width: 18, height: 18, borderTop: `2px solid ${a.c500}`, borderLeft: `2px solid ${a.c500}`, borderTopLeftRadius: 6 }} />
              <span className="absolute" style={{ top: 14, right: 14, width: 18, height: 18, borderTop: `2px solid ${a.c500}`, borderRight: `2px solid ${a.c500}`, borderTopRightRadius: 6 }} />
              <span className="absolute" style={{ bottom: 14, left: 14, width: 18, height: 18, borderBottom: `2px solid ${a.c500}`, borderLeft: `2px solid ${a.c500}`, borderBottomLeftRadius: 6 }} />
              <span className="absolute" style={{ bottom: 14, right: 14, width: 18, height: 18, borderBottom: `2px solid ${a.c500}`, borderRight: `2px solid ${a.c500}`, borderBottomRightRadius: 6 }} />
            </div>
            <div className="flex flex-col gap-[9px]">
              {METHODS.map(([MI, label]) => (
                <div key={label} className="flex items-center gap-[9px] px-[14px] py-[9px] rounded-xl bg-white" style={{ border: '1px solid #eef0f3', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
                  <MI size={16} strokeWidth={2} style={{ color: a.c600 }} /><span className="font-semibold text-[13px] text-slate-700">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* trust row */}
          <div className="relative mt-[46px] flex items-center gap-2.5 flex-wrap text-[12px] font-medium text-slate-400">
            <span>SOC 2 Type II</span><span className="text-slate-300">•</span><span>FERPA-aligned</span><span className="text-slate-300">•</span><span>End-to-end encrypted</span>
          </div>
        </div>

        {/* RIGHT form */}
        <div className="flex-1 basis-1/2 min-w-[340px] min-h-screen px-12 py-12 flex flex-col justify-center bg-white">
          <div className="w-full max-w-[384px] mx-auto">
            <div className="inline-flex items-center gap-[7px] px-[11px] py-[5px] rounded-full font-semibold text-[12px] mb-[18px]" style={{ background: a.c50, color: a.c700 }}>
              <Icon size={14} strokeWidth={2.2} /><span>{cfg.chip} Portal</span>
            </div>

            <h1 className="font-extrabold text-[28px] text-slate-900 tracking-tight mb-2">{cfg.heading}</h1>
            <p className="text-[15px] leading-[1.5] text-slate-500 mb-[26px]">{cfg.sub}</p>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl text-[13.5px] font-medium leading-snug mb-5">
                <AlertCircle size={18} className="shrink-0 mt-px" /><span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-[17px]">
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

              <div className="flex justify-end mb-5">
                <Link to="/forgot-password" className="text-[13px] font-semibold hover:underline" style={{ color: a.c600 }}>Forgot password?</Link>
              </div>

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 py-[13px] rounded-xl text-white font-semibold text-[15px] disabled:opacity-70 transition-all hover:-translate-y-px active:translate-y-px"
                style={{ background: a.grad, boxShadow: `0 12px 24px -10px ${a.shadow}` }}>
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
                  <input type="checkbox" checked={showDemos} onChange={(e) => setShowDemos(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300" style={{ accentColor: a.c600 }} />
                  <span className="text-[12px] font-medium text-gray-400">Show demo accounts</span>
                </label>
                {showDemos && (
                  <div className="mt-3">
                    <div className="grid grid-cols-2 gap-2">
                      {demos.map((acc) => (
                        <button key={acc.email} type="button" onClick={() => fillDemo(acc)} title={`${acc.email} · ${DEMO_PASSWORD}`}
                          className="flex flex-col items-start text-left px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 transition-colors" style={{ borderColor: '#eef0f3' }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = a.c500)} onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#eef0f3')}>
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

            <div className="mt-[26px] pt-5 border-t text-center" style={{ borderColor: '#f1f5f9' }}>
              <div className="text-[13px] font-medium text-slate-400">Not the {cfg.label}? Switch portal</div>
              <div className="flex justify-center gap-2 flex-wrap mt-3">
                {ORDER.filter((r) => r !== role).map((r) => {
                  const O = ROLES[r]; const Oi = O.icon;
                  return (
                    <button key={r} onClick={() => navigate(toPath(O.route))}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-[12.5px] font-semibold text-slate-600 hover:border-gray-300 hover:bg-gray-50 transition-all">
                      <Oi size={16} strokeWidth={2} /><span>{O.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="font-mono text-[11.5px] text-slate-300 mt-4 tracking-wide">attendify.pro{toPath(cfg.route)}</div>
            </div>
          </div>
        </div>
    </motion.div>
  );
}
