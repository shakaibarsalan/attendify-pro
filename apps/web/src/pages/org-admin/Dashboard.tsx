import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { usersApi, coursesApi, sessionsApi, fraudApi, plansApi } from '@/lib/api';
import { Users, BookOpen, ClipboardList, AlertTriangle, UserPlus, Plus, TrendingUp, Info } from 'lucide-react';

export default function OrgAdminDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ students: 0, teachers: 0, courses: 0, sessions: 0, fraud: 0 });
  const [hasPlan, setHasPlan] = useState(true);

  useEffect(() => {
    Promise.all([
      usersApi.list({ role: 'student', limit: 1 }),
      usersApi.list({ role: 'teacher', limit: 1 }),
      coursesApi.list({ limit: 1 }),
      sessionsApi.list({ limit: 1 }),
      fraudApi.list({ status: 'pending', limit: 1 }),
    ]).then(([s, t, c, sess, f]: any[]) => {
      setStats({
        students: s.total ?? 0,
        teachers: t.total ?? 0,
        courses: c.total ?? 0,
        sessions: sess.total ?? 0,
        fraud: f.total ?? 0,
      });
    }).catch(() => {});

    plansApi.current().then(() => setHasPlan(true)).catch(() => setHasPlan(false));
  }, []);

  const cards = [
    { label: 'Students', value: stats.students, icon: <Users size={24} />, color: 'bg-blue-50 text-blue-600', onClick: () => navigate('/org-admin/students') },
    { label: 'Teachers', value: stats.teachers, icon: <Users size={24} />, color: 'bg-green-50 text-green-600', onClick: () => navigate('/org-admin/teachers') },
    { label: 'Courses', value: stats.courses, icon: <BookOpen size={24} />, color: 'bg-purple-50 text-purple-600', onClick: () => navigate('/org-admin/courses') },
    { label: 'Pending Fraud', value: stats.fraud, icon: <AlertTriangle size={24} />, color: stats.fraud > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600', onClick: () => navigate('/org-admin/fraud') },
  ];

  const quickActions = [
    { label: 'Add Teacher', icon: <UserPlus size={18} />, onClick: () => navigate('/org-admin/teachers'), color: 'bg-green-600 hover:bg-green-700' },
    { label: 'Add Student', icon: <UserPlus size={18} />, onClick: () => navigate('/org-admin/students'), color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Create Course', icon: <Plus size={18} />, onClick: () => navigate('/org-admin/courses'), color: 'bg-purple-600 hover:bg-purple-700' },
    { label: 'Manage Enrollments', icon: <BookOpen size={18} />, onClick: () => navigate('/org-admin/enrollments'), color: 'bg-orange-600 hover:bg-orange-700' },
  ];

  return (
    <div className="space-y-6">
      {!hasPlan && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-indigo-50 border border-indigo-200">
          <Info size={20} className="text-indigo-600 flex-shrink-0" />
          <p className="text-sm font-medium text-indigo-800 flex-1">
            You're on a 14-day free trial. Select a plan to continue using Attendify.
          </p>
          <button
            onClick={() => navigate('/org-admin/select-plan')}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Select Plan
          </button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back, {user?.fullName}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} onClick={card.onClick} className="stat-card cursor-pointer group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${card.color} group-hover:scale-110 transition-transform`}>{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <h2 className="flex items-center gap-2"><TrendingUp size={20} /> Quick Actions</h2>
          </div>
          <div className="p-5 grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <button key={action.label} onClick={action.onClick}
                className={`inline-flex items-center justify-center gap-2 px-4 py-3 text-white text-sm font-medium rounded-lg transition-colors ${action.color}`}>
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="flex items-center gap-2"><ClipboardList size={20} /> Overview</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Total Sessions</span>
              <span className="text-sm font-semibold text-gray-900">{stats.sessions}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Total Courses</span>
              <span className="text-sm font-semibold text-gray-900">{stats.courses}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Pending Fraud Alerts</span>
              <span className={`text-sm font-semibold ${stats.fraud > 0 ? 'text-red-600' : 'text-green-600'}`}>{stats.fraud}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Students per Teacher</span>
              <span className="text-sm font-semibold text-gray-900">{stats.teachers > 0 ? Math.round(stats.students / stats.teachers) : 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
