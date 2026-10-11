import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';
import { roleLoginPath } from '@/lib/loginPath';
import { toast } from 'sonner';
import { Clock } from 'lucide-react';

// Inactivity policy (applies to every signed-in role):
//  - WARN_AFTER: idle this long → show the "still there?" prompt
//  - LOGOUT_AFTER: idle this long → log out and invalidate the token server-side
const WARN_AFTER_MS = 20 * 60 * 1000;   // 20 minutes
const LOGOUT_AFTER_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_KEY = 'attendify_last_activity';
const WRITE_THROTTLE_MS = 5000;

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const;

function now() {
  return Date.now();
}

function readLastActivity(): number {
  const v = Number(localStorage.getItem(ACTIVITY_KEY));
  return Number.isFinite(v) && v > 0 ? v : now();
}

export default function InactivitySession() {
  const navigate = useNavigate();
  const { logout, user } = useAuthStore();
  const [showWarning, setShowWarning] = useState(false);
  const lastWriteRef = useRef(0);
  const loggedOutRef = useRef(false);
  // Mirror showWarning into a ref so the stable interval/listeners read the latest value.
  const showWarningRef = useRef(showWarning);
  useEffect(() => { showWarningRef.current = showWarning; }, [showWarning]);

  const markActivity = useCallback((force = false) => {
    const t = now();
    if (force || t - lastWriteRef.current > WRITE_THROTTLE_MS) {
      lastWriteRef.current = t;
      localStorage.setItem(ACTIVITY_KEY, String(t));
    }
  }, []);

  const doLogout = useCallback(async () => {
    if (loggedOutRef.current) return;
    loggedOutRef.current = true;
    const dest = roleLoginPath(user?.role);
    localStorage.removeItem(ACTIVITY_KEY);
    try { await authApi.logout(); } catch { /* best effort — still clear locally */ }
    await logout();
    toast.error('You were signed out due to 30 minutes of inactivity.');
    navigate(dest, { replace: true });
  }, [logout, navigate, user]);

  const stayLoggedIn = useCallback(() => {
    markActivity(true);
    setShowWarning(false);
  }, [markActivity]);

  useEffect(() => {
    // Initialise the timer only if there's no stored activity yet (first run /
    // pre-existing session). If a value already exists we keep it, so reopening
    // an idle tab after 30+ minutes still logs out instead of resetting.
    if (!localStorage.getItem(ACTIVITY_KEY)) markActivity(true);

    const onActivity = () => {
      // While the warning is open we require an explicit choice — passive movement
      // shouldn't silently extend a session that has already been idle 20+ minutes.
      if (showWarningRef.current) return;
      markActivity();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const tick = () => {
      if (loggedOutRef.current) return;
      const elapsed = now() - readLastActivity();
      if (elapsed >= LOGOUT_AFTER_MS) {
        doLogout();
        return;
      }
      if (elapsed >= WARN_AFTER_MS) {
        if (!showWarningRef.current) setShowWarning(true);
      } else if (showWarningRef.current) {
        setShowWarning(false);
      }
    };

    const interval = window.setInterval(tick, 1000);
    // Re-check promptly when the tab regains focus (covers being away > 30 min).
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    tick();

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-4">
          <Clock size={28} className="text-amber-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Still there?</h2>
        <p className="text-gray-500 mt-1.5 mb-5 text-sm">
          You've been inactive for a while. For your security you'll be signed out soon unless you stay logged in.
        </p>
        <div className="flex gap-3">
          <button
            onClick={doLogout}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Log out now
          </button>
          <button
            onClick={stayLoggedIn}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          >
            Stay logged in
          </button>
        </div>
      </div>
    </div>
  );
}
