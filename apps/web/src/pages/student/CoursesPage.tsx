import { useEffect, useState } from 'react';
import { coursesApi, attendanceApi } from '@/lib/api';
import { BookOpen, User, ChevronRight } from 'lucide-react';
import CourseDetailModal from '@/components/student/CourseDetailModal';

interface CourseStat {
  courseId: string;
  courseName: string;
  courseCode: string;
  attendancePercentage: number;
  attendedSessions: number;
  totalSessions: number;
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [stats, setStats] = useState<CourseStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    Promise.all([coursesApi.list(), attendanceApi.myStats()])
      .then(([c, s]) => {
        setCourses(c.data);
        setStats(Array.isArray(s) ? s : []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load courses');
        setLoading(false);
      });
  }, []);

  const getStat = (courseId: string) =>
    stats.find((s) => s.courseId === courseId);

  const getBarColor = (pct: number) =>
    pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  const getTextColor = (pct: number) =>
    pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Courses</h1>
        <p className="text-gray-500 mt-1">
          {loading ? 'Loading courses...' : `${courses.length} course${courses.length !== 1 ? 's' : ''} enrolled`}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-2/3 mb-4" />
              <div className="h-2 bg-gray-100 rounded-full" />
            </div>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <BookOpen size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No courses enrolled yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => {
            const stat = getStat(course.id);
            const pct = stat?.attendancePercentage || 0;
            return (
              <div
                key={course.id}
                onClick={() => setSelected(course)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(course); } }}
                role="button"
                tabIndex={0}
                aria-label={`View details for ${course.name}`}
                className="group bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 rounded-lg bg-blue-50">
                    <BookOpen size={20} className="text-blue-600" />
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      pct >= 80
                        ? 'bg-green-50 text-green-700'
                        : pct >= 60
                          ? 'bg-yellow-50 text-yellow-700'
                          : pct > 0
                            ? 'bg-red-50 text-red-700'
                            : 'bg-gray-50 text-gray-500'
                    }`}
                  >
                    {stat ? `${pct}%` : 'No data'}
                  </span>
                </div>

                <h3 className="font-semibold text-gray-900 text-lg flex items-center gap-1">
                  {course.name}
                  <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                </h3>
                <p className="text-sm text-gray-500 mt-1">{course.code}</p>

                <div className="mt-3 space-y-2">
                  {course.teacherName && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <User size={14} />
                      <span>{course.teacherName}</span>
                    </div>
                  )}
                  {course.section && (
                    <p className="text-sm text-gray-500">
                      Section: {course.section}
                    </p>
                  )}
                  {course.semester && (
                    <p className="text-sm text-gray-500">
                      Semester: {course.semester}
                    </p>
                  )}
                </div>

                {stat && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-500">
                        Attendance
                      </span>
                      <span className="text-xs text-gray-500">
                        {stat.attendedSessions}/{stat.totalSessions} classes
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getBarColor(pct)}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <p className={`text-sm font-semibold mt-1.5 ${getTextColor(pct)}`}>
                      {pct}%
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <CourseDetailModal
          course={selected}
          stat={getStat(selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
