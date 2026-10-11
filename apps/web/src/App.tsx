import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import RoleLoginSwitch from '@/pages/auth/RoleLoginSwitch';
import { roleLoginPath } from '@/lib/loginPath';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import SystemAdminDashboard from '@/pages/system-admin/Dashboard';
import InstitutionsPage from '@/pages/system-admin/InstitutionsPage';
import AuditLogsPage from '@/pages/system-admin/AuditLogsPage';
import OrgRequestsPage from '@/pages/system-admin/OrgRequestsPage';
import OrgAdminsPage from '@/pages/system-admin/OrgAdminsPage';
import PlansPage from '@/pages/system-admin/PlansPage';
import OrgAdminDashboard from '@/pages/org-admin/Dashboard';
import SelectPlanPage from '@/pages/org-admin/SelectPlanPage';
import UsersPage from '@/pages/org-admin/UsersPage';
import TeachersPage from '@/pages/org-admin/TeachersPage';
import StudentsPage from '@/pages/org-admin/StudentsPage';
import OrgCoursesPage from '@/pages/org-admin/CoursesPage';
import OrgFraudPage from '@/pages/org-admin/FraudAlertsPage';
import EnrollmentsPage from '@/pages/org-admin/EnrollmentsPage';
import ReportsPage from '@/pages/org-admin/ReportsPage';
import DepartmentsPage from '@/pages/org-admin/DepartmentsPage';
import ApiKeysPage from '@/pages/org-admin/ApiKeysPage';
import TeacherDashboard from '@/pages/teacher/Dashboard';
import TeacherEnrollmentRequestsPage from '@/pages/teacher/EnrollmentRequestsPage';
import OrgEnrollmentRequestsPage from '@/pages/org-admin/EnrollmentRequestsPage';
import CoursesPage from '@/pages/teacher/CoursesPage';
import SessionsPage from '@/pages/teacher/SessionsPage';
import TeacherAttendancePage from '@/pages/teacher/AttendancePage';
import StudentDashboard from '@/pages/student/Dashboard';
import StudentCoursesPage from '@/pages/student/CoursesPage';
import AttendancePage from '@/pages/student/AttendancePage';
import AttendCheckIn from '@/pages/student/AttendCheckIn';
import FaceRegisterPage from '@/pages/student/FaceRegisterPage';
import AnalyticsPage from '@/pages/student/AnalyticsPage';
import ProfilePage from '@/pages/shared/ProfilePage';
import SettingsPage from '@/pages/shared/SettingsPage';
import NotificationsPage from '@/pages/shared/NotificationsPage';
import AttendanceActivityPage from '@/pages/shared/AttendanceActivityPage';
import NotFoundPage from '@/pages/shared/NotFoundPage';
import SupportPage from '@/pages/shared/SupportPage';
import QueriesPage from '@/pages/org-admin/QueriesPage';
import DocsPage from '@/pages/DocsPage';
import PrivacyPage from '@/pages/PrivacyPage';
import TermsPage from '@/pages/TermsPage';
import { Loader2 } from 'lucide-react';

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></div>;
  }
  if (!isAuthenticated) return <Navigate to={roleLoginPath(user?.role)} replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  // A temporary-password user is NOT bounced away anymore — they reach their
  // dashboard and are prompted by the ForceChangePasswordModal (in DashboardLayout).
  return <>{children}</>;
}

function RoleRedirect() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  // mustChangePassword users go straight to their dashboard; the modal prompts them there.
  switch (user.role) {
    case 'system_admin': return <Navigate to="/system-admin" replace />;
    case 'org_admin': return <Navigate to="/org-admin" replace />;
    case 'teacher': return <Navigate to="/teacher" replace />;
    case 'student': return <Navigate to="/student" replace />;
    default: return <Navigate to="/login" replace />;
  }
}

export default function App() {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></div>;
  }
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <RoleRedirect /> : <RoleLoginSwitch role="org" />} />
      <Route path="/login/system-admin" element={isAuthenticated ? <RoleRedirect /> : <RoleLoginSwitch role="system" />} />
      <Route path="/login/org-admin" element={isAuthenticated ? <RoleRedirect /> : <RoleLoginSwitch role="org" />} />
      <Route path="/login/teacher" element={isAuthenticated ? <RoleRedirect /> : <RoleLoginSwitch role="teacher" />} />
      <Route path="/login/student" element={isAuthenticated ? <RoleRedirect /> : <RoleLoginSwitch role="student" />} />

      {/* Internal-only demo login routes: same pages but WITH the one-click demo
          credentials. Not linked from anywhere public — type the URL directly. */}
      <Route path="/login-demo" element={isAuthenticated ? <RoleRedirect /> : <RoleLoginSwitch role="org" demo />} />
      <Route path="/login-demo/system-admin" element={isAuthenticated ? <RoleRedirect /> : <RoleLoginSwitch role="system" demo />} />
      <Route path="/login-demo/org-admin" element={isAuthenticated ? <RoleRedirect /> : <RoleLoginSwitch role="org" demo />} />
      <Route path="/login-demo/teacher" element={isAuthenticated ? <RoleRedirect /> : <RoleLoginSwitch role="teacher" demo />} />
      <Route path="/login-demo/student" element={isAuthenticated ? <RoleRedirect /> : <RoleLoginSwitch role="student" demo />} />

      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* Public, no-login pages (linked from the landing footer). */}
      <Route path="/docs" element={<DocsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/org-admin/select-plan" element={<ProtectedRoute roles={['org_admin']}><SelectPlanPage /></ProtectedRoute>} />
      {/* Live-QR presence check-in (deep-link target of the projector QR). Full-screen, no sidebar. */}
      <Route path="/student/attend/:sessionId" element={<ProtectedRoute roles={['student']}><AttendCheckIn /></ProtectedRoute>} />
      <Route path="/unauthorized" element={<NotFoundPage code="403" title="Access Denied" message="You don't have permission to access this page." />} />

      <Route path="/system-admin" element={<ProtectedRoute roles={['system_admin']}><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<SystemAdminDashboard />} />
        <Route path="institutions" element={<InstitutionsPage />} />
        <Route path="org-admins" element={<OrgAdminsPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="activity" element={<AttendanceActivityPage scope="system" />} />
        <Route path="audit" element={<AuditLogsPage />} />
        <Route path="org-requests" element={<OrgRequestsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="/org-admin" element={<ProtectedRoute roles={['org_admin']}><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<OrgAdminDashboard />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="courses" element={<OrgCoursesPage />} />
        <Route path="enrollments" element={<EnrollmentsPage />} />
        <Route path="enrollment-requests" element={<OrgEnrollmentRequestsPage />} />
        <Route path="queries" element={<QueriesPage />} />
        <Route path="fraud" element={<OrgFraudPage />} />
        <Route path="activity" element={<AttendanceActivityPage scope="org" />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="/teacher" element={<ProtectedRoute roles={['teacher']}><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<TeacherDashboard />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="enrollment-requests" element={<TeacherEnrollmentRequestsPage />} />
        <Route path="attendance" element={<TeacherAttendancePage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="/student" element={<ProtectedRoute roles={['student']}><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<StudentDashboard />} />
        <Route path="courses" element={<StudentCoursesPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="face-register" element={<FaceRegisterPage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
