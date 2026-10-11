import { useEffect, useState } from 'react';
import { coursesApi, usersApi, enrollmentsApi } from '@/lib/api';
import { UserPlus, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function EnrollmentsPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [enrolled, setEnrolled] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      coursesApi.list({ limit: 100 }),
      usersApi.list({ role: 'student', limit: 500 }),
    ]).then(([c, s]: any[]) => {
      const cd = c.data ?? c;
      const sd = s.data ?? s;
      setCourses(Array.isArray(cd) ? cd : []);
      setStudents(Array.isArray(sd) ? sd : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedCourse) { setEnrolled([]); return; }
    coursesApi.enrollments(selectedCourse)
      .then((res: any) => {
        const d = res.data ?? res;
        setEnrolled(Array.isArray(d) ? d : []);
      })
      .catch(() => setEnrolled([]));
  }, [selectedCourse]);

  const enrolledIds = new Set(enrolled.map((e: any) => e.studentId));

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleEnroll = async () => {
    if (!selectedCourse || selectedStudents.size === 0) return;
    setEnrolling(true);
    try {
      await enrollmentsApi.create({
        courseId: selectedCourse,
        studentIds: Array.from(selectedStudents),
      });
      toast.success(`${selectedStudents.size} student(s) enrolled successfully`);
      setSelectedStudents(new Set());
      const res: any = await coursesApi.enrollments(selectedCourse);
      const d = res.data ?? res;
      setEnrolled(Array.isArray(d) ? d : []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to enroll students');
    } finally {
      setEnrolling(false);
    }
  };

  const handleRemove = async (enrollmentId: string) => {
    if (!window.confirm('Remove this student from the course? Their attendance history will be preserved.')) return;
    try {
      await enrollmentsApi.remove(enrollmentId);
      toast.success('Student removed from course');
      if (selectedCourse) {
        const res: any = await coursesApi.enrollments(selectedCourse);
        const d = res.data ?? res;
        setEnrolled(Array.isArray(d) ? d : []);
      }
    } catch {
      toast.error('Failed to remove enrollment');
    }
  };

  const filteredStudents = students.filter((s: any) =>
    !enrolledIds.has(s.id) &&
    (s.fullName?.toLowerCase().includes(search.toLowerCase()) ||
     s.rollNumber?.toLowerCase().includes(search.toLowerCase()) ||
     s.email?.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Enrollments</h1>
        <p className="text-gray-500 mt-1">Enroll students in courses</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Course Selection + Current Enrollments */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Select Course</h2>
            <select
              value={selectedCourse}
              onChange={(e) => { setSelectedCourse(e.target.value); setSelectedStudents(new Set()); }}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">Choose a course...</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code}) — {c.semester || 'N/A'}</option>
              ))}
            </select>
          </div>

          {selectedCourse && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Currently Enrolled ({enrolled.length})</h2>
              </div>
              {enrolled.length === 0 ? (
                <div className="p-5 text-center text-gray-500 text-sm">No students enrolled yet</div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                  {enrolled.map((e: any) => (
                    <div key={e.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{e.fullName}</p>
                        <p className="text-xs text-gray-500">{e.rollNumber || e.email}</p>
                      </div>
                      <button
                        onClick={() => handleRemove(e.id)}
                        className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Student Selection */}
        {selectedCourse && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">
                  Add Students ({selectedStudents.size} selected)
                </h2>
                {selectedStudents.size > 0 && (
                  <button
                    onClick={handleEnroll}
                    disabled={enrolling}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    <UserPlus size={16} />
                    {enrolling ? 'Enrolling...' : `Enroll ${selectedStudents.size}`}
                  </button>
                )}
              </div>
              <div className="p-4 border-b border-gray-100">
                <input
                  type="text"
                  placeholder="Search students..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {filteredStudents.length === 0 ? (
                  <div className="p-5 text-center text-gray-500 text-sm">
                    {search ? 'No students match your search' : 'All students are already enrolled'}
                  </div>
                ) : (
                  filteredStudents.map((s: any) => (
                    <div
                      key={s.id}
                      onClick={() => toggleStudent(s.id)}
                      className={`px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 ${selectedStudents.has(s.id) ? 'bg-primary-50' : ''}`}
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{s.fullName}</p>
                        <p className="text-xs text-gray-500">{s.rollNumber || ''} {s.rollNumber ? '— ' : ''}{s.email}</p>
                      </div>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${selectedStudents.has(s.id) ? 'bg-primary-600 border-primary-600' : 'border-gray-300'}`}>
                        {selectedStudents.has(s.id) && <Check size={14} className="text-white" />}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
