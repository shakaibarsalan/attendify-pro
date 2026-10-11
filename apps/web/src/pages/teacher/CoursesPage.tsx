import { useEffect, useState } from 'react';
import { coursesApi } from '@/lib/api';
import { BookOpen, Users, ChevronRight, X } from 'lucide-react';

export default function CoursesPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);

  useEffect(() => {
    coursesApi.list()
      .then(({ data }) => { setCourses(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const fetchEnrollments = (course: any) => {
    setSelectedCourse(course);
    setLoadingEnrollments(true);
    coursesApi.enrollments(course.id)
      .then(({ data }) => { setEnrollments(Array.isArray(data) ? data : data.data ?? []); setLoadingEnrollments(false); })
      .catch(() => setLoadingEnrollments(false));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Courses</h1>
        <p className="text-gray-500 mt-1">View assigned courses and enrolled students</p>
      </div>

      {selectedCourse ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedCourse(null)} className="text-gray-400 hover:text-gray-600">
                <ChevronRight size={20} className="rotate-180" />
              </button>
              <div>
                <h2 className="font-semibold text-gray-900">{selectedCourse.name}</h2>
                <p className="text-sm text-gray-500">{selectedCourse.code} - {selectedCourse.semester || ''} {selectedCourse.academicYear || ''}</p>
              </div>
            </div>
            <button onClick={() => setSelectedCourse(null)} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
          {loadingEnrollments ? (
            <div className="p-8 text-center text-gray-500">Loading enrollments...</div>
          ) : enrollments.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No students enrolled</div>
          ) : (
            <div className="divide-y divide-gray-100">
              <div className="px-5 py-3 bg-gray-50 grid grid-cols-12 text-xs font-medium text-gray-500 uppercase">
                <div className="col-span-1">#</div>
                <div className="col-span-4">Name</div>
                <div className="col-span-3">Roll Number</div>
                <div className="col-span-2">Department</div>
                <div className="col-span-2">Status</div>
              </div>
              {enrollments.map((en: any, idx: number) => (
                <div key={en.id || idx} className="px-5 py-3 grid grid-cols-12 items-center text-sm hover:bg-gray-50">
                  <div className="col-span-1 text-gray-400">{idx + 1}</div>
                  <div className="col-span-4 font-medium text-gray-900">{en.studentName || en.name || en.fullName || '-'}</div>
                  <div className="col-span-3 text-gray-600">{en.rollNumber || '-'}</div>
                  <div className="col-span-2 text-gray-600">{en.department || '-'}</div>
                  <div className="col-span-2">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${en.isActive !== false ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {en.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full p-8 text-center text-gray-500">Loading courses...</div>
          ) : courses.length === 0 ? (
            <div className="col-span-full p-8 text-center text-gray-500">No courses assigned yet</div>
          ) : (
            courses.map((course: any) => (
              <button
                key={course.id}
                onClick={() => fetchEnrollments(course)}
                className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:border-primary-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                    <BookOpen size={20} />
                  </div>
                  <ChevronRight size={18} className="text-gray-300 mt-1" />
                </div>
                <h3 className="font-semibold text-gray-900">{course.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{course.code}</p>
                <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                  <span>{course.semester || '-'}</span>
                  <span>{course.academicYear || '-'}</span>
                  {course.section && <span>Sec {course.section}</span>}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-1.5 text-xs text-gray-500">
                  <Users size={14} />
                  <span>{course.maxStudents || 0} max students</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
