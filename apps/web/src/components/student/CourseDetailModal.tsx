import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { attendanceApi } from '@/lib/api';
import { X, BookOpen, User, Hash, CalendarDays, Layers, CheckCircle2, XCircle, Clock, BarChart3 } from 'lucide-react';

interface CourseLike {
  id: string;
  name?: string;
  code?: string;
  teacherName?: string;
  section?: string;
  semester?: string;
  credits?: number;
  description?: string;
}

interface StatLike {
  attendancePercentage?: number | string;
  attendedSessions?: number;
  totalSessions?: number;
}

interface Props {
  course: CourseLike;
  stat?: StatLike | null;
  onClose: () => void;
}

/**
 * Drill-down for a single enrolled course: header + the student's own attendance
 * summary and per-lecture history. Opened from the student dashboard and the
 * My Courses page so a course is clickable and actually shows its details.
 */
export default function CourseDetailModal({ course, stat, onClose }: Props) {
  const navigate = useNavigate();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    attendanceApi.list({ courseId: course.id, limit: 100 })
      .then((r: any) => {
        if (!alive) return;
        const d = r.data ?? r;
        const list = Array.isArray(d) ? d : [];
        // Most recent first.
        list.sort((a: any, b: any) => new Date(b.markedAt || 0).getTime() - new Date(a.markedAt || 0).getTime());
        setRecords(list);
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [course.id]);

  const pct = Math.round(parseFloat(String(stat?.attendancePercentage ?? 0)) || 0);
  const total = stat?.totalSessions ?? records.length;
  const attended = stat?.attendedSessions ?? records.filter((r) => r.status === 'verified').length;
  const absent = Math.max(0, total - attended);
  const hasStat = stat != null || records.length > 0;

  const pctText = pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600';
  const pctBar = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  const meta: Array<{ icon: ReactNode; label: string; value: string }> = [];
  if (course.teacherName) meta.push({ icon: <User size={14} />, label: 'Instructor', value: course.teacherName });
  if (course.section) meta.push({ icon: <Layers size={14} />, label: 'Section', value: String(course.section) });
  if (course.semester) meta.push({ icon: <CalendarDays size={14} />, label: 'Semester', value: String(course.semester) });
  if (course.credits != null) meta.push({ icon: <Hash size={14} />, label: 'Credits', value: String(course.credits) });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`${course.name || 'Course'} details`}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-gray-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 shrink-0">
              <BookOpen size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">{course.name || 'Course'}</h2>
              <p className="text-sm text-gray-500">{course.code || ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto space-y-5">
          {meta.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {meta.map((m) => (
                <div key={m.label} className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-gray-400 text-xs">{m.icon}<span>{m.label}</span></div>
                  <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{m.value}</p>
                </div>
              ))}
            </div>
          )}

          {course.description && (
            <p className="text-sm text-gray-600 leading-relaxed">{course.description}</p>
          )}

          {/* Attendance summary */}
          <div className="rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><BarChart3 size={18} /> Your Attendance</h3>
              {hasStat ? <span className={`text-2xl font-bold ${pctText}`}>{pct}%</span> : <span className="text-sm text-gray-400">No data yet</span>}
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${pctBar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">{total}</p>
                <p className="text-xs text-gray-500 mt-0.5">Total classes</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-green-600">{attended}</p>
                <p className="text-xs text-gray-500 mt-0.5">Present</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-red-600">{absent}</p>
                <p className="text-xs text-gray-500 mt-0.5">Absent</p>
              </div>
            </div>
          </div>

          {/* Per-lecture history */}
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3"><Clock size={18} /> Attendance History</h3>
            {loading ? (
              <div className="py-6 text-center text-sm text-gray-400">Loading…</div>
            ) : records.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400 bg-gray-50 rounded-lg">No attendance records yet for this course.</div>
            ) : (
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden">
                {records.map((r: any) => {
                  const present = r.status === 'verified';
                  return (
                    <div key={r.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
                      <div className="flex items-center gap-3 min-w-0">
                        {present
                          ? <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                          : <XCircle size={18} className="text-red-400 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800">Lecture #{r.lectureNumber ?? '?'}</p>
                          <p className="text-xs text-gray-400">{r.markedAt ? new Date(r.markedAt).toLocaleString() : '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-gray-400 capitalize hidden sm:inline">{(r.verificationMethod || '').replace('_', ' ')}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          present ? 'bg-green-50 text-green-700' : r.status === 'absent' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'
                        }`}>{r.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Close</button>
          <button
            onClick={() => { onClose(); navigate('/student/analytics'); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg"
          >
            <BarChart3 size={16} /> Full analytics
          </button>
        </div>
      </div>
    </div>
  );
}
