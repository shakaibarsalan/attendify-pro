import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';
import api from '@/lib/api';
import { roleLoginPath } from '@/lib/loginPath';
import InactivitySession from '@/components/InactivitySession';
import AttendifyWordmark from '@/components/AttendifyWordmark';
import ForceChangePasswordModal from '@/components/shared/ForceChangePasswordModal';
import { useEffect, useState, useRef } from 'react';
import {
  LayoutDashboard, Users, Building2, BookOpen, ClipboardList,
  Shield, AlertTriangle, FileText, LogOut, User, ScanFace, Bell, BarChart3, UserPlus, Inbox, Key, CreditCard,
  MessageSquare, LifeBuoy, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import type { UserRole } from '@/types';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
}

const navByRole: Record<UserRole, NavItem[]> = {
  system_admin: [
    { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/system-admin' },
    { label: 'Institutions', icon: <Building2 size={20} />, path: '/system-admin/institutions' },
    { label: 'Org Admins', icon: <Shield size={20} />, path: '/system-admin/org-admins' },
    { label: 'Plans & Billing', icon: <CreditCard size={20} />, path: '/system-admin/plans' },
    { label: 'Attendance Activity', icon: <ClipboardList size={20} />, path: '/system-admin/activity' },
    { label: 'Org Requests', icon: <Inbox size={20} />, path: '/system-admin/org-requests' },
    { label: 'Audit Logs', icon: <FileText size={20} />, path: '/system-admin/audit' },
  ],
  org_admin: [
    { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/org-admin' },
    { label: 'Users', icon: <Users size={20} />, path: '/org-admin/users' },
    { label: 'Teachers', icon: <Shield size={20} />, path: '/org-admin/teachers' },
    { label: 'Students', icon: <Users size={20} />, path: '/org-admin/students' },
    { label: 'Courses', icon: <BookOpen size={20} />, path: '/org-admin/courses' },
    { label: 'Enrollments', icon: <UserPlus size={20} />, path: '/org-admin/enrollments' },
    { label: 'Enrollment Requests', icon: <Inbox size={20} />, path: '/org-admin/enrollment-requests' },
    { label: 'Support Queries', icon: <MessageSquare size={20} />, path: '/org-admin/queries' },
    { label: 'Fraud Alerts', icon: <AlertTriangle size={20} />, path: '/org-admin/fraud' },
    { label: 'Attendance Activity', icon: <ClipboardList size={20} />, path: '/org-admin/activity' },
    { label: 'Reports', icon: <ClipboardList size={20} />, path: '/org-admin/reports' },
    { label: 'Departments', icon: <Building2 size={20} />, path: '/org-admin/departments' },
    { label: 'API Keys', icon: <Key size={20} />, path: '/org-admin/api-keys' },
  ],
  teacher: [
    { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/teacher' },
    { label: 'My Courses', icon: <BookOpen size={20} />, path: '/teacher/courses' },
    { label: 'Sessions', icon: <ClipboardList size={20} />, path: '/teacher/sessions' },
    { label: 'Enrollment Requests', icon: <UserPlus size={20} />, path: '/teacher/enrollment-requests' },
    { label: 'Attendance', icon: <FileText size={20} />, path: '/teacher/attendance' },
    { label: 'Help & Support', icon: <LifeBuoy size={20} />, path: '/teacher/support' },
  ],
  student: [
    { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/student' },
    { label: 'My Courses', icon: <BookOpen size={20} />, path: '/student/courses' },
    { label: 'Attendance', icon: <ClipboardList size={20} />, path: '/student/attendance' },
    { label: 'Analytics', icon: <BarChart3 size={20} />, path: '/student/analytics' },
    { label: 'Biometrics', icon: <ScanFace size={20} />, path: '/student/face-register' },
    { label: 'Help & Support', icon: <LifeBuoy size={20} />, path: '/student/support' },
  ],
};

const roleLabels: Record<UserRole, string> = {
  system_admin: 'System Administrator',
  org_admin: 'Organization Admin',
  teacher: 'Teacher',
  student: 'Student',
};

export function DashboardLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDrop, setShowNotifDrop] = useState(false);
  const [recentNotifs, setRecentNotifs] = useState<any[]>([]);
  const [pendingOrgRequests, setPendingOrgRequests] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  // Sidebar collapse, remembered across navigations and reloads.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('attendify:sidebarOpen') !== 'false';
  });

  useEffect(() => {
    localStorage.setItem('attendify:sidebarOpen', String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    api.get('/notifications')
      .then((res: any) => {
        const notifs = res.data ?? [];
        setUnreadCount(notifs.filter((n: any) => !n.isRead).length);
        setRecentNotifs(notifs.slice(0, 5));
      })
      .catch(() => {});

    if (user?.role === 'system_admin') {
      api.get('/org-requests')
        .then((res: any) => {
          const list = res.data ?? res;
          if (Array.isArray(list)) {
            setPendingOrgRequests(list.filter((r: any) => r.status === 'pending').length);
          }
        })
        .catch(() => {});
    }

    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifDrop(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!user) return null;

  const navItems = navByRole[user.role];
  const basePath = user.role === 'system_admin' ? '/system-admin' : user.role === 'org_admin' ? '/org-admin' : user.role === 'teacher' ? '/teacher' : '/student';

  const handleLogout = async () => {
    const dest = roleLoginPath(user?.role); // back to this user's portal
    try { await authApi.logout(); } catch {}
    logout();
    navigate(dest);
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <InactivitySession />
      <ForceChangePasswordModal />
      <aside className={`w-64 bg-white border-r border-gray-100 flex flex-col fixed h-full z-30 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-5 py-[18px] border-b border-gray-100">
          <AttendifyWordmark size={21} float={false} />
          <span className="inline-block mt-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
            {roleLabels[user.role]}
          </span>
        </div>

        <div className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Menu</div>
        <nav className="flex-1 px-3 pb-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const badgeCount = item.path === '/system-admin/org-requests' ? pendingOrgRequests : 0;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === basePath}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
                {badgeCount > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700">
                    {badgeCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-gray-200 p-3 space-y-1">
          <NavLink to={`${basePath}/profile`} className="sidebar-link">
            <User size={20} />
            <span>Profile</span>
          </NavLink>
          <button onClick={handleLogout} className="sidebar-link w-full text-red-600 hover:bg-red-50 hover:text-red-700">
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className={`flex-1 transition-[margin] duration-200 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            </button>
            <div>
              <p className="text-sm text-gray-500">Welcome back,</p>
              <p className="font-semibold text-gray-900">{user.fullName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setShowNotifDrop(!showNotifDrop)}
                className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label={`Notifications: ${unreadCount} unread`}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {showNotifDrop && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={async () => {
                          await api.post('/notifications/read-all');
                          setUnreadCount(0);
                          setRecentNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
                        }}
                        className="text-xs text-primary-600 hover:text-primary-700"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {recentNotifs.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-gray-400">No notifications</div>
                    ) : (
                      recentNotifs.map((n: any) => (
                        <div key={n.id} className={`px-4 py-3 border-b border-gray-50 ${!n.isRead ? 'bg-blue-50/50' : ''}`}>
                          <p className="text-sm font-medium text-gray-900">{n.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                          <p className="text-xs text-gray-400 mt-1">{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="px-4 py-2 border-t border-gray-100">
                    <button
                      onClick={() => { setShowNotifDrop(false); navigate(`${basePath}/notifications`); }}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      View all notifications
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-sm font-bold text-primary-700">{user.fullName?.charAt(0)?.toUpperCase()}</span>
            </div>
          </div>
        </header>

        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
