import { useEffect, useState } from 'react';
import { usersApi, coursesApi, sessionsApi, fraudApi } from '@/lib/api';
import { BarChart3, Users, GraduationCap, BookOpen, ClipboardList, AlertTriangle, TrendingUp } from 'lucide-react';

export default function ReportsPage() {
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    totalCourses: 0,
    totalSessions: 0,
    totalFraudAlerts: 0,
    pendingFraudAlerts: 0,
  });
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      usersApi.list({ role: 'student', limit: 1 }),
      usersApi.list({ role: 'teacher', limit: 1 }),
      coursesApi.list(),
      sessionsApi.list(),
      fraudApi.list(),
      fraudApi.list({ status: 'pending' }),
    ]).then(([students, teachers, courses, sessions, fraud, pendingFraud]: any[]) => {
      const coursesData = courses.data || [];
      const sessionsData = sessions.data || [];

      setStats({
        totalStudents: students.total || 0,
        totalTeachers: teachers.total || 0,
        totalCourses: courses.total || coursesData.length || 0,
        totalSessions: sessions.total || sessionsData.length || 0,
        totalFraudAlerts: (fraud as any).total || 0,
        pendingFraudAlerts: (pendingFraud as any).total || 0,
      });

      const enrollmentPromises = coursesData.slice(0, 20).map(async (c: any) => {
        try {
          const { data } = await coursesApi.enrollments(c.id);
          const count = Array.isArray(data) ? data.length : (data.total || data.length || 0);
          return { courseId: c.id, name: c.name, code: c.code, enrolled: count };
        } catch {
          return { courseId: c.id, name: c.name, code: c.code, enrolled: 0 };
        }
      });

      Promise.all(enrollmentPromises).then((results) => {
        setEnrollments(results);
        setLoading(false);
      });
    }).catch(() => setLoading(false));
  }, []);

  const statCards = [
    { label: 'Total Students', value: stats.totalStudents, icon: <GraduationCap size={24} />, color: 'bg-blue-50 text-blue-600' },
    { label: 'Total Teachers', value: stats.totalTeachers, icon: <Users size={24} />, color: 'bg-green-50 text-green-600' },
    { label: 'Total Courses', value: stats.totalCourses, icon: <BookOpen size={24} />, color: 'bg-purple-50 text-purple-600' },
    { label: 'Total Sessions', value: stats.totalSessions, icon: <ClipboardList size={24} />, color: 'bg-orange-50 text-orange-600' },
    { label: 'Fraud Alerts', value: stats.totalFraudAlerts, icon: <AlertTriangle size={24} />, color: 'bg-red-50 text-red-600' },
    { label: 'Pending Alerts', value: stats.pendingFraudAlerts, icon: <TrendingUp size={24} />, color: 'bg-yellow-50 text-yellow-600' },
  ];

  const maxEnrolled = Math.max(...enrollments.map((e) => e.enrolled), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500 mt-1">Institution-wide analytics and statistics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${card.color}`}>{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 size={20} />
            Enrollment Summary by Course
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading reports...</div>
        ) : enrollments.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No enrollment data available</div>
        ) : (
          <div className="p-5 space-y-4">
            {enrollments.map((e) => (
              <div key={e.courseId} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-900">{e.name}</span>
                  <span className="text-gray-500">{e.enrolled} enrolled</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="bg-primary-500 h-2.5 rounded-full transition-all"
                    style={{ width: `${(e.enrolled / maxEnrolled) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
