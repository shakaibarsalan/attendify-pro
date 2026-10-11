import { useEffect, useState, useRef } from 'react';
import { sessionsApi, coursesApi, attendanceApi } from '@/lib/api';
import { ClipboardList, Plus, StopCircle, Users, Radio, QrCode, ScanFace, Fingerprint } from 'lucide-react';
import Pagination from '@/components/shared/Pagination';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { connectTeacherSocket, joinSessionRoom, leaveSessionRoom, onAttendanceMarked, disconnectTeacherSocket } from '@/lib/teacher-socket';
import QRDisplayModal from '@/components/session/QRDisplayModal';
import CreateSessionForm from '@/components/session/CreateSessionForm';

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [attendees, setAttendees] = useState<any[]>([]);
  const [viewingSession, setViewingSession] = useState<string | null>(null);
  const [filterCourse, setFilterCourse] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [liveSession, setLiveSession] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  const [liveTotal, setLiveTotal] = useState(0);
  const [liveFeed, setLiveFeed] = useState<Array<{ studentName: string; method: string; time: string }>>([]);

  const socketCleanup = useRef<(() => void) | null>(null);
  const [qrSession, setQrSession] = useState<any | null>(null);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const loadData = () => {
    setLoading(true);
    const params: any = { page, limit };
    if (filterCourse) params.courseId = filterCourse;
    if (filterStatus) params.status = filterStatus;
    Promise.all([
      sessionsApi.list(params),
      coursesApi.list(),
    ]).then(([s, c]: any[]) => {
      setSessions(s.data ?? []);
      setTotal(s.total ?? (s.data?.length || 0));
      setCourses(c.data ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [filterCourse, filterStatus, page]);
  useEffect(() => { setPage(1); }, [filterCourse, filterStatus]);

  const handleStatusChange = async (sessionId: string, status: string) => {
    try {
      await sessionsApi.updateStatus(sessionId, status);
      toast.success(`Session ${status === 'completed' ? 'ended' : status}`);
      if (status === 'completed' && liveSession === sessionId) {
        stopLiveMode();
      }
      loadData();
    } catch {
      toast.error('Failed to update session');
    }
  };

  const viewAttendees = async (sessionId: string) => {
    if (viewingSession === sessionId) { setViewingSession(null); return; }
    try {
      const res: any = await attendanceApi.list({ sessionId, limit: 200 });
      const d = res.data ?? res;
      setAttendees(Array.isArray(d) ? d : []);
      setViewingSession(sessionId);
    } catch {
      toast.error('Failed to load attendees');
    }
  };

  const startLiveMode = async (sessionId: string, session: any) => {
    try {
      const token = localStorage.getItem('accessToken') || '';
      connectTeacherSocket(token);
      joinSessionRoom(sessionId);

      const res: any = await attendanceApi.list({ sessionId, limit: 200 });
      const d = res.data ?? res;
      const existing = Array.isArray(d) ? d : [];
      setAttendees(existing);
      setLiveCount(existing.filter((a: any) => a.status !== 'absent').length);
      setLiveTotal(session.totalEnrolled || 0);
      setLiveSession(sessionId);
      setViewingSession(sessionId);
      setLiveFeed(existing.map((a: any) => ({
        studentName: a.studentName || 'Student',
        method: a.verificationMethod || 'qr',
        time: a.markedAt ? new Date(a.markedAt).toLocaleTimeString() : '',
      })).reverse().slice(0, 10));

      const cleanup = onAttendanceMarked((data) => {
        setLiveCount((c) => c + 1);
        setAttendees((prev) => [...prev, data]);
        setLiveFeed((prev) => [{
          studentName: data.studentName,
          method: data.method,
          time: new Date(data.markedAt).toLocaleTimeString(),
        }, ...prev].slice(0, 15));
      });
      socketCleanup.current = cleanup;
    } catch {
      toast.error('Failed to start live mode');
    }
  };

  const stopLiveMode = () => {
    if (liveSession) {
      leaveSessionRoom(liveSession);
    }
    if (socketCleanup.current) {
      socketCleanup.current();
      socketCleanup.current = null;
    }
    setLiveSession(null);
  };

  useEffect(() => {
    return () => {
      stopLiveMode();
      disconnectTeacherSocket();
    };
  }, []);

  const activeCount = sessions.filter((s) => s.status === 'active').length;

  // Group sessions under their course so the list reads like the admin
  // drill-down pages instead of one mixed flat dump.
  const grouped = (() => {
    const byCourse = new Map<string, { name: string; code: string; sessions: any[] }>();
    for (const s of sessions) {
      const key = s.courseId || 'unknown';
      if (!byCourse.has(key)) {
        byCourse.set(key, { name: s.courseName || 'Course', code: s.courseCode || '', sessions: [] });
      }
      byCourse.get(key)!.sessions.push(s);
    }
    for (const g of byCourse.values()) {
      g.sessions.sort((a, b) => new Date(b.startTime || 0).getTime() - new Date(a.startTime || 0).getTime());
    }
    return [...byCourse.values()];
  })();

  const totalPresent = sessions.reduce((sum, s) => sum + (s.totalPresent || 0), 0);
  const totalEnrolled = sessions.reduce((sum, s) => sum + (s.status !== 'cancelled' ? (s.totalEnrolled || 0) : 0), 0);
  const avgTurnout = totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Sessions</h1>
          <p className="text-gray-500 mt-1">Create and manage lecture sessions</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">
          <Plus size={18} />
          New Session
        </button>
      </div>

      {showCreate && (
        <CreateSessionForm
          courses={courses}
          onCancel={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadData(); }}
        />
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{total || sessions.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Sessions</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className={`text-2xl font-bold ${activeCount > 0 ? 'text-green-600' : 'text-gray-900'}`}>{activeCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Active now</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{grouped.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Courses with sessions</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className={`text-2xl font-bold ${avgTurnout == null ? 'text-gray-900' : avgTurnout >= 80 ? 'text-green-600' : avgTurnout >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
            {avgTurnout != null ? `${avgTurnout}%` : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Average turnout</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3">
        <select value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
          <option value="">All Courses</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {liveSession && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Radio size={20} className="animate-pulse" />
              <h3 className="font-bold text-lg">Live Session</h3>
            </div>
            <button onClick={stopLiveMode} className="px-3 py-1.5 bg-white/20 text-white text-sm rounded-lg hover:bg-white/30 transition-colors">
              Stop Live View
            </button>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-white/20 rounded-lg px-4 py-2">
              <p className="text-2xl font-bold">{liveCount}</p>
              <p className="text-xs text-white/70">of {liveTotal} students present</p>
            </div>
            <div className="flex-1 h-3 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-green-400 rounded-full transition-all duration-500" style={{ width: `${liveTotal > 0 ? (liveCount / liveTotal) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            <AnimatePresence>
              {liveFeed.map((item, idx) => (
                <motion.div
                  key={`${item.studentName}-${idx}`}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between bg-white/10 rounded-lg px-3 py-2"
                >
                  <span className="text-sm font-medium">{item.studentName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded">{item.method}</span>
                    <span className="text-xs text-white/60">{item.time}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><ClipboardList size={20} /> Sessions</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No sessions found. Create one to get started.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {grouped.map((g) => (
            <div key={`${g.code}-${g.name}`}>
              <div className="px-5 py-2.5 bg-gray-50/80 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">{g.name}{g.code ? ` (${g.code})` : ''}</p>
                <span className="text-xs text-gray-400">{g.sessions.length} session{g.sessions.length === 1 ? '' : 's'}</span>
              </div>
              <div className="divide-y divide-gray-50">
            {g.sessions.map((s: any) => (
              <div key={s.id}>
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">Lecture #{s.lectureNumber || '?'}</p>
                      <p className="text-sm text-gray-500">
                        {s.startTime ? new Date(s.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}
                        {s.endTime ? ` → ${new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                        {s.notes ? ` — ${s.notes}` : ''}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className="text-xs text-gray-400">Present: {s.totalPresent || 0} / {s.totalEnrolled || 0}</span>
                        {s.allowFace && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded"><ScanFace size={11} /> Face</span>}
                        {s.allowQr && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded"><QrCode size={11} /> QR{s.qrRotationEnabled ? ' ↻' : ''}</span>}
                        {s.allowFingerprint && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded"><Fingerprint size={11} /> Print</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.status === 'active' && (
                        <button
                          onClick={() => setQrSession(s)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50"
                          title="Show QR code for students"
                        >
                          <QrCode size={14} /> QR
                        </button>
                      )}
                      {s.status === 'active' && liveSession !== s.id && (
                        <button
                          onClick={() => startLiveMode(s.id, s)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                        >
                          <Radio size={14} /> Live
                        </button>
                      )}
                      <button onClick={() => viewAttendees(s.id)} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="View attendees">
                        <Users size={18} />
                      </button>
                      {s.status === 'active' && (
                        <button onClick={() => handleStatusChange(s.id, 'completed')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                          <StopCircle size={16} /> End
                        </button>
                      )}
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        s.status === 'active' ? 'bg-green-50 text-green-700' :
                        s.status === 'completed' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>{s.status}</span>
                    </div>
                  </div>
                  {viewingSession === s.id && liveSession !== s.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-sm font-medium text-gray-700 mb-2">Attendees ({attendees.length}/{s.totalEnrolled || '?'})</p>
                      {attendees.length === 0 ? (
                        <p className="text-sm text-gray-400">No students have marked attendance yet</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {attendees.map((a: any) => (
                            <div key={a.id} className="bg-gray-50 rounded-lg px-3 py-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{a.studentName || 'Student'}</p>
                                  <p className="text-xs text-gray-500">{a.rollNumber || ''}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-gray-400">{a.markedAt ? new Date(a.markedAt).toLocaleTimeString() : ''}</p>
                                  <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">{a.verificationMethod || 'qr'}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
              </div>
            </div>
            ))}
          </div>
        )}
        {!loading && total > limit && (
          <div className="px-5 border-t border-gray-200">
            <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
          </div>
        )}
      </div>

      {qrSession && (
        <QRDisplayModal
          sessionId={qrSession.id}
          courseName={qrSession.courseName || 'Course'}
          lectureNumber={qrSession.lectureNumber}
          onClose={() => setQrSession(null)}
        />
      )}
    </div>
  );
}
