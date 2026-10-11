import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { coursesApi, sessionsApi, attendanceApi } from '@/lib/api';
import { BookOpen, QrCode, Plus, ClipboardList, StopCircle, Users, ChevronRight } from 'lucide-react';
import QRDisplayModal from '@/components/session/QRDisplayModal';
import CreateSessionForm from '@/components/session/CreateSessionForm';
import { toast } from 'sonner';

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [attendees, setAttendees] = useState<any[]>([]);
  const [viewingSession, setViewingSession] = useState<string | null>(null);
  const [qrSession, setQrSession] = useState<any | null>(null);

  const loadData = () => {
    Promise.all([coursesApi.list(), sessionsApi.list()])
      .then(([c, s]) => {
        setCourses(c.data ?? []);
        setSessions(s.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const activeSessions = sessions.filter((s: any) => s.status === 'active');

  const handleEndSession = async (sessionId: string) => {
    try {
      await sessionsApi.updateStatus(sessionId, 'completed');
      toast.success('Session ended');
      loadData();
      if (viewingSession === sessionId) setViewingSession(null);
    } catch {
      toast.error('Failed to end session');
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

  const cards = [
    { label: 'My Courses', value: courses.length, icon: <BookOpen size={24} />, color: 'bg-blue-50 text-blue-600', to: '/teacher/courses' },
    { label: 'Active Sessions', value: activeSessions.length, icon: <QrCode size={24} />, color: 'bg-green-50 text-green-600', to: '/teacher/sessions' },
    { label: 'Total Sessions', value: sessions.length, icon: <ClipboardList size={24} />, color: 'bg-purple-50 text-purple-600', to: '/teacher/sessions' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teacher Dashboard</h1>
          <p className="text-gray-500 mt-1">Manage your courses and attendance sessions</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">
          <Plus size={18} />
          Start New Lecture
        </button>
      </div>

      {showCreate && (
        <CreateSessionForm
          courses={courses}
          onCancel={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadData(); }}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} onClick={() => navigate(card.to)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(card.to); } }}
            className="stat-card cursor-pointer group focus:outline-none focus:ring-2 focus:ring-primary-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${card.color} group-hover:scale-110 transition-transform`}>{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {activeSessions.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-5">
          <h2 className="text-lg font-semibold text-green-800 mb-3 flex items-center gap-2">
            <QrCode size={20} />
            Active Sessions ({activeSessions.length})
          </h2>
          <div className="space-y-3">
            {activeSessions.map((s: any) => (
              <div key={s.id}>
                <div className="bg-white rounded-lg border border-green-100 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{s.courseName || 'Course'}</p>
                      <p className="text-sm text-gray-500">{s.courseCode || ''} — Lecture #{s.lectureNumber || '?'}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Started: {new Date(s.startTime || s.createdAt).toLocaleTimeString()} |
                        {s.endTime ? ` Ends: ${new Date(s.endTime).toLocaleTimeString()} |` : ''}
                        {' '}Present: {s.totalPresent || 0}/{s.totalEnrolled || 0}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.requireQr && (
                        <button onClick={() => setQrSession(s)} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50">
                          <QrCode size={16} />
                          Show QR
                        </button>
                      )}
                      <button onClick={() => viewAttendees(s.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50">
                        <Users size={16} />
                        {viewingSession === s.id ? 'Hide' : 'View'} Attendees
                      </button>
                      <button onClick={() => handleEndSession(s.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                        <StopCircle size={16} />
                        End Session
                      </button>
                    </div>
                  </div>
                  {viewingSession === s.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-sm font-medium text-gray-700 mb-2">Attendees ({attendees.length})</p>
                      {attendees.length === 0 ? (
                        <p className="text-sm text-gray-400">No students have marked attendance yet</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {attendees.map((a: any) => (
                            <div key={a.id} className="bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-gray-900">{a.studentName || 'Student'}</p>
                                <p className="text-xs text-gray-500">{a.rollNumber || ''}</p>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{a.verificationMethod || 'present'}</span>
                                <p className="text-[11px] text-gray-500 mt-1">
                                  {a.markedAt ? new Date(a.markedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                </p>
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
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Recent Sessions</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No sessions yet. Start a lecture to begin.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {sessions.slice(0, 10).map((s: any) => (
              <div key={s.id}
                onClick={() => navigate('/teacher/sessions')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/teacher/sessions'); } }}
                role="button" tabIndex={0}
                className="group px-5 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer focus:outline-none focus:bg-gray-50">
                <div>
                  <p className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors">{s.courseName || 'Course'}</p>
                  <p className="text-sm text-gray-500">Lecture #{s.lectureNumber || '?'} — {s.startTime ? new Date(s.startTime).toLocaleDateString() : 'N/A'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">{s.totalPresent || 0}/{s.totalEnrolled || 0}</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    s.status === 'active' ? 'bg-green-50 text-green-700' :
                    s.status === 'completed' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>{s.status}</span>
                  <ChevronRight size={18} className="text-gray-300 group-hover:text-primary-500 transition-colors" />
                </div>
              </div>
            ))}
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
