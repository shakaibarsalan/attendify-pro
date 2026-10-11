import { useEffect, useState } from 'react';
import { institutionsApi, coursesApi, sessionsApi } from '@/lib/api';
import { Building2, BookOpen, ClipboardList, ChevronRight, ArrowLeft, CheckCircle2, XCircle, Clock as ClockIcon } from 'lucide-react';
import Pagination from '@/components/shared/Pagination';

type Scope = 'system' | 'org';

interface Props {
  scope: Scope;
}

export default function AttendanceActivityPage({ scope }: Props) {
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);

  const [selectedInstitution, setSelectedInstitution] = useState<any | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);

  const [loading, setLoading] = useState(true);

  // Step 1 (system_admin only): institutions
  useEffect(() => {
    if (scope !== 'system') return;
    setLoading(true);
    institutionsApi.list()
      .then((res: any) => setInstitutions(res.data ?? res ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scope]);

  // Step: courses (org_admin loads immediately; system_admin loads after picking an institution)
  useEffect(() => {
    if (scope === 'system' && !selectedInstitution) return;
    setLoading(true);
    const params = scope === 'system' ? { institutionId: selectedInstitution.id } : undefined;
    coursesApi.list(params)
      .then((res: any) => setCourses(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scope, selectedInstitution]);

  // Step: lectures (sessions) for the selected course — paginated
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const SESSIONS_LIMIT = 20;

  useEffect(() => { setSessionsPage(1); }, [selectedCourse]);

  useEffect(() => {
    if (!selectedCourse) return;
    setLoading(true);
    sessionsApi.list({ courseId: selectedCourse.id, page: sessionsPage, limit: SESSIONS_LIMIT })
      .then((res: any) => {
        setSessions(res.data ?? []);
        setSessionsTotal(res.total ?? (res.data?.length || 0));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedCourse, sessionsPage]);

  // Step: roster for the selected lecture
  useEffect(() => {
    if (!selectedSession) return;
    setLoading(true);
    sessionsApi.roster(selectedSession.id)
      .then((res: any) => setRoster(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedSession]);

  const showInstitutions = scope === 'system' && !selectedInstitution;
  const showCourses = !showInstitutions && !selectedCourse;
  const showSessions = !!selectedCourse && !selectedSession;
  const showRoster = !!selectedSession;

  const reset = () => {
    setSelectedInstitution(null);
    setSelectedCourse(null);
    setSelectedSession(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance Activity</h1>
        <p className="text-gray-500 mt-1">
          {scope === 'system' ? 'Institutions' : 'Courses'} → Lectures → Marked / unmarked students
        </p>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
        <button onClick={reset} className={`hover:text-primary-600 ${!selectedInstitution && !selectedCourse ? 'font-semibold text-gray-900' : ''}`}>
          {scope === 'system' ? 'Institutions' : 'Courses'}
        </button>
        {scope === 'system' && selectedInstitution && (
          <>
            <ChevronRight size={14} />
            <button onClick={() => { setSelectedCourse(null); setSelectedSession(null); }} className={`hover:text-primary-600 ${!selectedCourse ? 'font-semibold text-gray-900' : ''}`}>
              {selectedInstitution.name}
            </button>
          </>
        )}
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
              Lecture #{selectedSession.lectureNumber || '?'} — {selectedSession.startTime ? new Date(selectedSession.startTime).toLocaleDateString() : 'N/A'}
            </span>
          </>
        )}
      </div>

      {/* Institutions */}
      {showInstitutions && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Building2 size={20} /> Institutions</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading institutions...</div>
          ) : institutions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No institutions found</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {institutions.map((inst: any) => (
                <button
                  key={inst.id}
                  onClick={() => setSelectedInstitution(inst)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left"
                >
                  <div>
                    <p className="font-medium text-gray-900">{inst.name}</p>
                    <p className="text-xs text-gray-500">{inst.code}</p>
                  </div>
                  <ChevronRight size={18} className="text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Courses */}
      {showCourses && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><BookOpen size={20} /> Courses</h2>
            {scope === 'system' && (
              <button onClick={() => setSelectedInstitution(null)} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600">
                <ArrowLeft size={14} /> Back to institutions
              </button>
            )}
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading courses...</div>
          ) : courses.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No courses found</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {courses.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCourse(c)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left"
                >
                  <div>
                    <p className="font-medium text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.code} {c.section ? `· Section ${c.section}` : ''}</p>
                  </div>
                  <ChevronRight size={18} className="text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sessions / lectures */}
      {showSessions && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><ClipboardList size={20} /> Lectures — {selectedCourse.name}</h2>
            <button onClick={() => setSelectedCourse(null)} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600">
              <ArrowLeft size={14} /> Back to courses
            </button>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading lectures...</div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No lectures recorded for this course yet</div>
          ) : (
            <>
            <div className="divide-y divide-gray-50">
              {sessions.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSession(s)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left"
                >
                  <div>
                    <p className="font-medium text-gray-900">Lecture #{s.lectureNumber || '?'}</p>
                    <p className="text-xs text-gray-500">
                      {s.startTime ? new Date(s.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}
                      {' '}· {s.totalPresent || 0}/{s.totalEnrolled || 0} present
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      s.status === 'active' ? 'bg-green-50 text-green-700' :
                      s.status === 'completed' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>{s.status}</span>
                    <ChevronRight size={18} className="text-gray-400" />
                  </div>
                </button>
              ))}
            </div>
            {sessionsTotal > SESSIONS_LIMIT && (
              <div className="px-5 border-t border-gray-200">
                <Pagination page={sessionsPage} total={sessionsTotal} limit={SESSIONS_LIMIT} onPageChange={setSessionsPage} />
              </div>
            )}
            </>
          )}
        </div>
      )}

      {/* Roster */}
      {showRoster && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <ClipboardList size={20} /> Lecture #{selectedSession.lectureNumber || '?'} — Student Attendance
            </h2>
            <button onClick={() => setSelectedSession(null)} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600">
              <ArrowLeft size={14} /> Back to lectures
            </button>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading roster...</div>
          ) : roster.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No students enrolled in this course</div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-gray-100 flex gap-4 text-sm text-gray-500">
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-green-600" /> Marked: {roster.filter((r: any) => r.status).length}</span>
                <span className="inline-flex items-center gap-1.5"><XCircle size={14} className="text-red-500" /> Unmarked: {roster.filter((r: any) => !r.status).length}</span>
                <span>Total enrolled: {roster.length}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {roster.map((r: any) => (
                  <div key={r.studentId} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{r.fullName}</p>
                      <p className="text-xs text-gray-500">{r.rollNumber || r.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {r.markedAt && (
                        <span className="text-xs text-gray-400 inline-flex items-center gap-1">
                          <ClockIcon size={12} /> {new Date(r.markedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {r.verificationMethod && (
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{r.verificationMethod}</span>
                      )}
                      {r.status ? (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          r.status === 'verified' ? 'bg-green-50 text-green-700' :
                          r.status === 'absent' ? 'bg-red-50 text-red-700' :
                          r.status === 'late' ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-50 text-gray-700'
                        }`}>
                          <CheckCircle2 size={12} /> {r.status}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          <XCircle size={12} /> Unmarked
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
