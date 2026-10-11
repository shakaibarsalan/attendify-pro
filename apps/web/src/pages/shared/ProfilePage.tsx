import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';
import { User, Lock, Save, Pencil, X, Mail, Phone, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    personalEmail: user?.personalEmail || '',
    department: (user as any)?.department || '',
  });
  const [saving, setSaving] = useState(false);

  const [changingPw, setChangingPw] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  const startEdit = () => {
    setForm({
      fullName: user?.fullName || '',
      personalEmail: user?.personalEmail || '',
      department: (user as any)?.department || '',
    });
    setEditMode(true);
  };

  const emailLooksValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) { toast.error('Name cannot be empty'); return; }
    if (form.personalEmail.trim() && !emailLooksValid(form.personalEmail)) {
      toast.error('Enter a valid personal email address');
      return;
    }
    setSaving(true);
    try {
      const updated: any = await authApi.updateProfile({
        fullName: form.fullName.trim(),
        personalEmail: form.personalEmail.trim() || undefined,
        department: form.department || undefined,
      });
      setUser({
        ...user!,
        fullName: updated.fullName || updated.full_name || form.fullName,
        personalEmail: updated.personalEmail ?? updated.personal_email ?? form.personalEmail,
        department: updated.department ?? form.department,
      } as any);
      toast.success('Profile updated');
      setEditMode(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) { toast.error('New passwords do not match'); return; }
    if (pwForm.newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setChangingPw(true);
    try {
      await authApi.changePassword(pwForm.currentPassword, pwForm.newPassword);
      toast.success('Password changed successfully');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to change password');
    } finally {
      setChangingPw(false);
    }
  };

  if (!user) return null;

  const lockChip = (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
      <Lock size={10} /> Locked
    </span>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-gray-500 mt-1">Manage your account settings</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><User size={20} /> Account Information</h2>
          {!editMode ? (
            <button onClick={startEdit} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <Pencil size={14} /> Edit
            </button>
          ) : (
            <button onClick={() => setEditMode(false)} className="p-1.5 text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          )}
        </div>

        {editMode ? (
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Personal Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={form.personalEmail}
                  onChange={(e) => setForm({ ...form, personalEmail: e.target.value })}
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Where you receive notifications and password‑reset links.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Department</label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="e.g. Computer Science"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Locked, admin-managed fields */}
            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 space-y-3">
              <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5"><ShieldCheck size={14} /> Managed by your administrator</p>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-1.5">Organization Email {lockChip}</label>
                <input type="text" value={user.email || ''} disabled
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-500 cursor-not-allowed" />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-1.5">Phone {lockChip}</label>
                <input type="text" value={(user as any).phone || '—'} disabled
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-500 cursor-not-allowed" />
              </div>
              <p className="text-xs text-gray-400">Your organization email is your login ID. Contact your administrator to change these.</p>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditMode(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                <Save size={15} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Full Name</label>
              <p className="text-gray-900 font-medium">{user.fullName || '—'}</p>
            </div>
            {user.registrationNumber && (
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-500 mb-1">
                  <Lock size={12} /> Registration Number
                </label>
                <p className="text-gray-900 font-medium">{user.registrationNumber}</p>
              </div>
            )}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-500 mb-1">
                <Lock size={12} /> Organization Email
              </label>
              <p className="text-gray-900 font-medium break-all">{user.email || '—'}</p>
              <p className="text-xs text-gray-400">Used to sign in</p>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-500 mb-1">
                <Mail size={12} /> Personal Email
              </label>
              <p className="text-gray-900 font-medium break-all">{user.personalEmail || '—'}</p>
              <p className="text-xs text-gray-400">Receives notifications</p>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-500 mb-1">
                <Phone size={12} /> Phone <Lock size={11} className="text-gray-400" />
              </label>
              <p className="text-gray-900 font-medium">{(user as any).phone || '—'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Role</label>
              <p className="text-gray-900 font-medium capitalize">{(user.role || '').replace('_', ' ')}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Department</label>
              <p className="text-gray-900 font-medium">{(user as any).department || '—'}</p>
            </div>
            {(user as any).rollNumber && (
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Roll Number</label>
                <p className="text-gray-900 font-medium">{(user as any).rollNumber}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Lock size={20} /> Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
            <input type="password" required value={pwForm.currentPassword}
              onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
            <input type="password" required value={pwForm.newPassword}
              onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Minimum 8 characters" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
            <input type="password" required value={pwForm.confirmPassword}
              onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={changingPw}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              <Save size={16} />
              {changingPw ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
