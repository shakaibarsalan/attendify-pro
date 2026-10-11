import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { biometricApi } from '@/lib/api';
import {
  Bell, Lock, Palette, Shield, Save, ExternalLink, Trash2, CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const SETTINGS_KEY = 'attendify_settings';

interface Settings {
  emailNotifications: boolean;
  attendanceReminders: boolean;
  fraudAlertEmails: boolean;
  compactView: boolean;
  highContrast: boolean;
}

const defaults: Settings = {
  emailNotifications: true,
  attendanceReminders: true,
  fraudAlertEmails: true,
  compactView: false,
  highContrast: false,
};

function loadSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return defaults;
  }
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${checked ? 'bg-primary-600' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function Row({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [saved, setSaved] = useState(false);
  const [deletingFace, setDeletingFace] = useState(false);

  useEffect(() => {
    if (settings.compactView) {
      document.documentElement.classList.add('compact');
    } else {
      document.documentElement.classList.remove('compact');
    }
  }, [settings.compactView]);

  const set = (key: keyof Settings, val: boolean) =>
    setSettings((prev) => ({ ...prev, [key]: val }));

  const handleSave = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setSaved(true);
    toast.success('Settings saved');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDeleteFaceData = async () => {
    if (!confirm('Delete your registered face data? You will need to re-register to use face attendance.')) return;
    setDeletingFace(true);
    try {
      await biometricApi.delete();
      toast.success('Face data deleted successfully');
    } catch {
      toast.error('No face data found or failed to delete');
    } finally {
      setDeletingFace(false);
    }
  };

  const prefixPath = user?.role === 'system_admin' ? '/system-admin'
    : user?.role === 'org_admin' ? '/org-admin'
    : user?.role === 'teacher' ? '/teacher'
    : '/student';

  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your preferences</p>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Bell size={18} /></div>
          <div>
            <h2 className="font-semibold text-gray-900">Notifications</h2>
            <p className="text-xs text-gray-500">Control what alerts you receive</p>
          </div>
        </div>
        <Row label="Email notifications" desc="Receive important updates via email">
          <Toggle checked={settings.emailNotifications} onChange={(v) => set('emailNotifications', v)} />
        </Row>
        <Row label="Attendance reminders" desc="Get reminded when a session is starting">
          <Toggle checked={settings.attendanceReminders} onChange={(v) => set('attendanceReminders', v)} />
        </Row>
        {(user.role === 'org_admin' || user.role === 'teacher') && (
          <Row label="Fraud alert emails" desc="Receive an email when a fraud alert is flagged">
            <Toggle checked={settings.fraudAlertEmails} onChange={(v) => set('fraudAlertEmails', v)} />
          </Row>
        )}
      </div>

      {/* Security */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
          <div className="p-2 rounded-lg bg-yellow-50 text-yellow-600"><Lock size={18} /></div>
          <div>
            <h2 className="font-semibold text-gray-900">Security</h2>
            <p className="text-xs text-gray-500">Password and account security</p>
          </div>
        </div>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-gray-900">Change Password</p>
            <p className="text-xs text-gray-500">Update your password from the Profile page</p>
          </div>
          <button
            onClick={() => navigate(`${prefixPath}/profile`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
          >
            Profile <ExternalLink size={13} />
          </button>
        </div>
        <div className="flex items-center justify-between py-1 border-t border-gray-100 pt-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Signed in as</p>
            <p className="text-xs text-gray-500">{user.email} — <span className="capitalize">{user.role?.replace('_', ' ')}</span></p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded-full font-medium">
            <CheckCircle size={12} /> Active
          </span>
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
          <div className="p-2 rounded-lg bg-purple-50 text-purple-600"><Palette size={18} /></div>
          <div>
            <h2 className="font-semibold text-gray-900">Appearance</h2>
            <p className="text-xs text-gray-500">Customize how the interface looks</p>
          </div>
        </div>
        <Row label="Compact view" desc="Reduce spacing to show more content on screen">
          <Toggle checked={settings.compactView} onChange={(v) => set('compactView', v)} />
        </Row>
        <Row label="High contrast text" desc="Increase text contrast for better readability">
          <Toggle checked={settings.highContrast} onChange={(v) => set('highContrast', v)} />
        </Row>
      </div>

      {/* Privacy */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
          <div className="p-2 rounded-lg bg-red-50 text-red-600"><Shield size={18} /></div>
          <div>
            <h2 className="font-semibold text-gray-900">Privacy</h2>
            <p className="text-xs text-gray-500">Manage your data</p>
          </div>
        </div>
        {user.role === 'student' && (
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-gray-900">Face biometric data</p>
              <p className="text-xs text-gray-500">Delete your registered face embeddings from the system</p>
            </div>
            <button
              onClick={handleDeleteFaceData}
              disabled={deletingFace}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} /> {deletingFace ? 'Deleting...' : 'Delete Face Data'}
            </button>
          </div>
        )}
        <div className={`flex items-center justify-between py-1 ${user.role === 'student' ? 'border-t border-gray-100 pt-3' : ''}`}>
          <div>
            <p className="text-sm font-medium text-gray-900">Account data</p>
            <p className="text-xs text-gray-500">Attendance and activity data is retained per institution policy</p>
          </div>
          <span className="text-xs text-gray-400">Managed by admin</span>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end pb-6">
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          {saved ? <CheckCircle size={16} /> : <Save size={16} />}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
