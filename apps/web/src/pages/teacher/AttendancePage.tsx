import { useEffect, useMemo, useState } from 'react';
import { attendanceApi, coursesApi, sessionsApi } from '@/lib/api';
import {
  BookOpen, ClipboardList, ChevronRight, ArrowLeft, Download, Pencil, X,
  TrendingUp, CheckCircle2, XCircle, Clock as ClockIcon, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Teachers can only correct an attendance record to one of these two — present
// (verified) or not (rejected). absent/late/excused still display for records the
// system sets automatically, but offering them here only caused confusion.
const STATUS_OPTIONS = ['verified', 'rejected'] as const;
type AttendanceStatus = typeof STATUS_OPTIONS[number];

const statusColors: Record<string, string> = {
  verified: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-600',
  pending: 'bg-yellow-50 text-yellow-700',
  absent: 'bg-gray-100 text-gray-600',
  late: 'bg-orange-50 text-orange-700',
  excused: 'bg-blue-50 text-blue-700',
};

export default function AttendancePage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [allSessions, setAllSessions] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);

  // Correction modal
  const [correcting, setCorrecting] = useState<any | null>(null);
  const [newStatus, setNewStatus] = useState<AttendanceStatus>('verified');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Student trend modal
  const [trendStudent, setTrendStudent] = useState<{ id: string; name: string; rollNumber?: string } | null>(null);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([coursesApi.list(), sessionsApi.list({ limit: 200 })])
      .then(([c, s]: any[]) => {
        setCourses(c.data ?? []);
        setAllSessions(s.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const courseSessions = useMemo(
    () => allSessions
      .filter((s: any) => selectedCourse && s.courseId === selectedCourse.id)
      .sort((a: any, b: any) => (b.lectureNumber || 0) - (a.lectureNumber || 0)),
    [allSessions, selectedCourse],
  );

  // Per-course stats from the sessions list (lectures held + average turnout)
  const courseStats = useMemo(() => {
    const map: Record<string, { lectures: number; present: number; enrolled: number; last?: string }> = {};
    for (const s of allSessions) {
      const st = (map[s.courseId] ||= { lectures: 0, present: 0, enrolled: 0 });
      if (s.status !== 'cancelled') {
        st.lectures++;
        st.present += s.totalPresent || 0;
        st.enrolled += s.totalEnrolled || 0;
        if (!st.last || (s.startTime && s.startTime > st.last)) st.last = s.startTime;
      }
    }
    return map;
  }, [allSessions]);

  const loadRoster = (session: any) => {
    setSelectedSession(session);
    setLoading(true);
    sessionsApi.roster(session.id)
      .then((res: any) => setRoster(res.data ?? []))
      .catch(() => toast.error('Failed to load the lecture roster'))
      .finally(() => setLoading(false));
  };

  const marked = roster.filter((r: any) => r.status);
  const unmarked = roster.filter((r: any) => !r.status);

  // ── Correction ────────────────────────────────────────────────
  const openCorrection = (row: any) => {
    setCorrecting({ id: row.attendanceId, studentName: row.fullName, rollNumber: row.rollNumber, status: row.status });
    // Default the picker to a valid editable option (records that are currently
    // absent/late/excused default to 'verified' since the teacher is correcting them).
    setNewStatus(row.status === 'rejected' ? 'rejected' : 'verified');
    setNotes('');
  };

  const handleCorrect = async () => {
    if (!correcting) return;
    setSaving(true);
    try {
      await attendanceApi.correct(correcting.id, { status: newStatus, notes: notes.trim() || undefined });
      toast.success('Attendance record updated');
      setRoster((prev) => prev.map((r) => (r.attendanceId === correcting.id ? { ...r, status: newStatus } : r)));
      setCorrecting(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update attendance');
    } finally {
      setSaving(false);
    }
  };

  // ── Trend ─────────────────────────────────────────────────────
  const openStudentTrend = async (row: any) => {
    const student = { id: row.studentId, name: row.fullName, rollNumber: row.rollNumber };
    setTrendStudent(student);
    setTrendLoading(true);
    try {
      const res: any = await attendanceApi.studentSessions(student.id, selectedCourse ? { courseId: selectedCourse.id } : undefined);
      const rows: any[] = res.data ?? [];
      let running = 0;
      setTrendData(rows.map((r, i) => {
        if (r.status === 'verified' || r.status === 'late') running++;
        return {
          label: `#${r.lectureNumber ?? i + 1}`,
          cumPct: Math.round((running / (i + 1)) * 100),
          status: r.status,
          date: r.startTime ? new Date(r.startTime).toLocaleDateString() : '',
          course: r.courseCode,
        };
      }));
    } catch {
      toast.error('Failed to load student trend');
    } finally {
      setTrendLoading(false);
    }
  };

  // ── CSV export of the open roster ─────────────────────────────
  const exportRosterCsv = () => {
    if (!selectedSession || roster.length === 0) return;
    const headers = ['Student', 'Roll Number', 'Status', 'Verification', 'Confidence %', 'Marked At'];
    const rows = roster.map((r: any) => [
      r.fullName, r.rollNumber || '', r.status || 'unmarked', r.verificationMethod || '',
      r.confidenceScore != null ? Number(r.confidenceScore).toFixed(1) : '',
      r.markedAt ? new Date(r.markedAt).toLocaleString() : '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCourse?.code || 'course'}_lecture${selectedSession.lectureNumber || ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pct = (present: number, total: number) => (total > 0 ? Math.round((present / total) * 100) : 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        <p className="text-gray-500 mt-1">Course → Lecture → marked and unmarked students</p>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
        <button
          onClick={() => { setSelectedCourse(null); setSelectedSession(null); }}
          className={`hover:text-primary-600 ${!selectedCourse ? 'font-semibold text-gray-900' : ''}`}
        >
          My Courses
        </button>
        {selectedCourse && (
          <>
            <ChevronRight size={14} />
            <button onClick={() => setSelectedSession(null)} className={`hover:text-primary-600 ${!selectedSession ? 'font-semibold text-gray-900' : ''}`}>
              {selectedCourse.name} ({selectedCourse.code})
            </button>
          </>
        )}
        {selectedSession && (
          <>
            <ChevronRight size={14} />
            <span className="font-semibold text-gray-900">
              Lecture #{selectedSession.lectureNumber || '?'} — {selectedSession.startTime ? new Date(selectedSession.startTime).toLocaleDateString() : ''}
            </span>
          </>
        )}
      </div>

      {/* Step 1: Courses */}
      {!selectedCourse && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><BookOpen size={20} /> My Courses</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading courses...</div>
          ) : courses.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No courses assigned to you</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {courses.map((c: any) => {
                const st = courseStats[c.id];
                const turnout = st && st.enrolled > 0 ? pct(st.present, st.enrolled) : null;
                return (
                  <button key={c.id} onClick={() => setSelectedCourse(c)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left">
                    <div>
                      <p className="font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-500">
                        {c.code}{c.section ? ` · Section ${c.section}` : ''} · {st?.lectures || 0} lecture{(st?.lectures || 0) === 1 ? '' : 's'}
                        {st?.last ? ` · last: ${new Date(st.last).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {turnout != null && (
                        <span className={`text-sm font-semibold ${turnout >= 80 ? 'text-green-600' : turnout >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {turnout}% avg
                        </span>
                      )}
                      <ChevronRight size={18} className="text-gray-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Lectures */}
      {selectedCourse && !selectedSession && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><ClipboardList size={20} /> Lectures — {selectedCourse.name}</h2>
            <button onClick={() => setSelectedCourse(null)} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600">
              <ArrowLeft size={14} /> Back to courses
            </button>
          </div>
          {courseSessions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No lectures recorded for this course yet</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {courseSessions.map((s: any) => {
                const turnout = pct(s.totalPresent || 0, s.totalEnrolled || 0);
                return (
                  <button key={s.id} onClick={() => loadRoster(s)}
                    className="w-full px-5 py-4 hover:bg-gray-50 text-left">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">Lecture #{s.lectureNumber || '?'}</p>
                        <p className="text-xs text-gray-500">
                          {s.startTime ? new Date(s.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}
                          {s.notes ? ` — ${s.notes}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">{s.totalPresent || 0}/{s.totalEnrolled || 0} present</span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          s.status === 'active' ? 'bg-green-50 text-green-700' :
                          s.status === 'completed' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                        }`}>{s.status}</span>
                        <ChevronRight size={18} className="text-gray-400" />
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${turnout >= 80 ? 'bg-green-500' : turnout >= 60 ? 'bg-yellow-500' : 'bg-red-400'}`}
                        style={{ width: `${turnout}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Roster */}
      {selectedSession && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Users size={20} /> Lecture #{selectedSession.lectureNumber || '?'} — Students
            </h2>
            <div className="flex items-center gap-2">
              {roster.length > 0 && (
                <button onClick={exportRosterCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50">
                  <Download size={14} /> Export CSV
                </button>
              )}
              <button onClick={() => setSelectedSession(null)} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600">
                <ArrowLeft size={14} /> Back to lectures
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading roster...</div>
          ) : roster.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No students enrolled in this course</div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-4 text-sm text-gray-500">
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-green-600" /> Marked: {marked.length}</span>
                <span className="inline-flex items-center gap-1.5"><XCircle size={14} className="text-red-500" /> Unmarked: {unmarked.length}</span>
                <span>Total enrolled: {roster.length}</span>
                <span className="ml-auto text-xs self-center text-gray-400">Click a name for the attendance trend · pencil to correct</span>
              </div>
              <div className="divide-y divide-gray-50">
                {roster.map((r: any) => (
                  <div key={r.studentId} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <button onClick={() => openStudentTrend(r)}
                        className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline text-left truncate"
                        title="View attendance trend">
                        {r.fullName}
                      </button>
                      <p className="text-xs text-gray-500">{r.rollNumber || r.email}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {r.markedAt && (
                        <span className="text-xs text-gray-400 inline-flex items-center gap-1">
                          <ClockIcon size={12} /> {new Date(r.markedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {r.verificationMethod && (
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{r.verificationMethod}</span>
                      )}
                      {r.confidenceScore != null && (
                        <span className={`text-xs font-medium ${Number(r.confidenceScore) >= 0.9 ? 'text-green-600' : Number(r.confidenceScore) >= 0.7 ? 'text-yellow-600' : 'text-gray-500'}`}>
                          {(Number(r.confidenceScore) * 100).toFixed(0)}%
                        </span>
                      )}
                      {r.status ? (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[r.status] || statusColors.pending}`}>
                          {r.status}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          <XCircle size={12} /> Unmarked
                        </span>
                      )}
                      {r.attendanceId && (
                        <button onClick={() => openCorrection(r)}
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Correct attendance">
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Trend modal */}
      {trendStudent && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setTrendStudent(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <TrendingUp size={20} className="text-primary-600" />
                  {trendStudent.name}
                </h3>
                {trendStudent.rollNumber && <p className="text-sm text-gray-500 mt-0.5">{trendStudent.rollNumber}</p>}
              </div>
              <button onClick={() => setTrendStudent(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {trendLoading ? (
              <div className="h-48 flex items-center justify-center text-gray-400">Loading...</div>
            ) : trendData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400">No attendance records found</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {(() => {
                    const present = trendData.filter((d) => d.status === 'verified' || d.status === 'late').length;
                    const total = trendData.length;
                    const p = total > 0 ? Math.round((present / total) * 100) : 0;
                    return (
                      <>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xl font-bold text-gray-900">{total}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Total Classes</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                          <p className="text-xl font-bold text-green-700">{present}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Attended</p>
                        </div>
                        <div className={`rounded-lg p-3 text-center ${p >= 80 ? 'bg-green-50' : p >= 60 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                          <p className={`text-xl font-bold ${p >= 80 ? 'text-green-700' : p >= 60 ? 'text-yellow-700' : 'text-red-700'}`}>{p}%</p>
                          <p className="text-xs text-gray-500 mt-0.5">Attendance</p>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => [`${v}%`, 'Cumulative attendance']} />
                    <Line type="monotone" dataKey="cumPct" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-4 max-h-40 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left text-gray-500">Lecture</th>
                        <th className="px-3 py-2 text-left text-gray-500">Course</th>
                        <th className="px-3 py-2 text-left text-gray-500">Date</th>
                        <th className="px-3 py-2 text-left text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {trendData.map((d, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 text-gray-700">{d.label}</td>
                          <td className="px-3 py-1.5 text-gray-500">{d.course || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-500">{d.date}</td>
                          <td className="px-3 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded-full font-medium ${statusColors[d.status] || 'bg-gray-100 text-gray-600'}`}>
                              {d.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Correction modal */}
      {correcting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setCorrecting(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">Correct Attendance</h3>
              <button onClick={() => setCorrecting(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-900">{correcting.studentName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{correcting.rollNumber || ''}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-500">Current:</span>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${statusColors[correcting.status] || statusColors.pending}`}>
                    {correcting.status}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New Status</label>
                <div className="grid grid-cols-3 gap-2">
                  {STATUS_OPTIONS.map((s) => (
                    <button key={s} onClick={() => setNewStatus(s)}
                      className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                        newStatus === s
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reason for correction..." rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setCorrecting(null)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleCorrect} disabled={saving || newStatus === correcting.status}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
