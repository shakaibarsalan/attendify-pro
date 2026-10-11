import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';
import { ShieldCheck, Lock, KeyRound, X } from 'lucide-react';

/**
 * Shown as a popup card OVER the dashboard (mounted in DashboardLayout) when the
 * logged-in user is still on their temporary password (`mustChangePassword`).
 * Replaces the old full-page /force-change-password redirect — the user lands on
 * their dashboard and is gently prompted here instead.
 *
 * - "Change Password" sets a new password and clears the flag (won't show again).
 * - "Keep current password for now" dismisses it server-side (won't show again).
 * - The X just hides it for this session (it returns on the next login).
 */
export default function ForceChangePasswordModal() {
  const { user, setUser } = useAuthStore();
  const [hidden, setHidden] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!user?.mustChangePassword || hidden) return null;

  const clearFlag = () => {
    const u = useAuthStore.getState().user;
    if (u) setUser({ ...u, mustChangePassword: false });
  };

  const handleSkip = async () => {
    setError('');
    setLoading(true);
    try {
      await authApi.dismissPasswordChange();
      clearFlag();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!currentPassword || !newPassword || !confirmPassword) { setError('Please fill in all fields.'); return; }
    if (newPassword !== confirmPassword) { setError('New passwords do not match.'); return; }
    // Match the server's complexity rule so the user gets clear feedback up-front.
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setError('Password must be at least 8 characters and include an uppercase letter, a number, and a special character.');
      return;
    }
    setLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      clearFlag();
    } catch (err: any) {
      const data = err.response?.data;
      setError(data?.details?.[0]?.message || data?.error || 'Failed to change password. Please try again.');
      setLoading(false);
    }
  };

  const field = 'w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" role="dialog" aria-modal="true">
        <div className="flex items-start gap-3 px-6 pt-6">
          <div className="p-2.5 rounded-xl bg-primary-50 text-primary-600 shrink-0"><ShieldCheck size={22} /></div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900">Set your password</h2>
            <p className="text-sm text-gray-500 mt-0.5">We set a temporary password for you. Change it now, or keep it and change it later from your profile.</p>
          </div>
          <button onClick={() => setHidden(true)} disabled={loading} title="Remind me later"
            className="text-gray-400 hover:text-gray-600 shrink-0 disabled:opacity-50"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}

          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="password" placeholder="Current / temporary password" value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" className={field} />
          </div>
          <div className="relative">
            <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="password" placeholder="New password" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" className={field} />
          </div>
          <p className="text-[11px] text-gray-400 -mt-1.5 pl-1">At least 8 characters, with an uppercase letter, a number, and a special character.</p>
          <div className="relative">
            <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="password" placeholder="Confirm new password" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className={field} />
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
            {loading ? 'Saving…' : 'Change Password'}
          </button>
          <button type="button" onClick={handleSkip} disabled={loading}
            className="w-full text-sm text-gray-500 hover:text-gray-700 underline disabled:opacity-50">
            Keep current password for now
          </button>
        </form>
      </div>
    </div>
  );
}
