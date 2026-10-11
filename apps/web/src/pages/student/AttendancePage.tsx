import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { attendanceApi, coursesApi, sessionsApi, biometricApi, fingerprintApi } from '@/lib/api';
import { ClipboardList, Filter, Clock, Scan, ScanFace, XCircle, Lock, Fingerprint, BookOpen, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import FaceCaptureExperience from '@/components/face/FaceCaptureExperience';
import FingerprintCaptureModal from '@/components/fingerprint/FingerprintCaptureModal';

export default function AttendancePage() {
  const navigate = useNavigate();

  // History
  const [records, setRecords] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCourse, setFilterCourse] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Active sessions / marking
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [faceRegistered, setFaceRegistered] = useState<boolean | null>(null);
  const [scanningSession, setScanningSession] = useState<any | null>(null);
  const [faceCaptureSession, setFaceCaptureSession] = useState<string | null>(null);
  const [faceCaptureSecret, setFaceCaptureSecret] = useState('');
  const [faceCaptureCourse, setFaceCaptureCourse] = useState('');
  const [fingerprintSession, setFingerprintSession] = useState<string | null>(null);
  const [fpEnrolled, setFpEnrolled] = useState<boolean | null>(null);
  const html5QrRef = useRef<any>(null);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    coursesApi.list().then((res: any) => setCourses(res.data ?? [])).catch(() => {});
    sessionsApi.list({ status: 'active' }).then((res: any) => setActiveSessions(res.data ?? [])).catch(() => {});
    biometricApi.faceStatus().then((res: any) => setFaceRegistered(res.hasPrimary === true)).catch(() => {});
  }, []);

  const loadRecords = () => {
    setLoading(true);
    const params: any = { page: 1, limit: 1000 };
    if (filterCourse) params.courseId = filterCourse;
    return attendanceApi.list(params)
      .then((res: any) => { const d = res.data ?? res; setRecords(Array.isArray(d) ? d : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadRecords(); }, [filterCourse]); // eslint-disable-line react-hooks/exhaustive-deps


  const startFaceMark = (sessionId: string, secret: string, courseName: string) => {
    if (!faceRegistered) {
      toast.error('Please register your face first.', {
        action: { label: 'Register Now', onClick: () => navigate('/student/face-register') },
        duration: 6000,
      });
      return;
    }
    setFaceCaptureSession(sessionId);
    setFaceCaptureSecret(secret);
    setFaceCaptureCourse(courseName);
  };

  useEffect(() => {
    fingerprintApi.status()
      .then((r: any) => setFpEnrolled((r.templatesCount ?? r.templates_count ?? 0) > 0))
      .catch(() => setFpEnrolled(false));
  }, []);

  const openFingerprint = (sessionId: string) => {
    if (fpEnrolled === false) {
      toast.error('Register your fingerprints first to check in with Finger.', {
        action: { label: 'Register Now', onClick: () => navigate('/student/face-register') },
        duration: 6000,
      });
      return;
    }
    setFingerprintSession(sessionId);
  };

  const handleFingerprintVerify = async (fingers: { position: string; image: string }[]) => {
    if (!fingerprintSession) return;
    try {
      await attendanceApi.mark({ sessionId: fingerprintSession, fingerprintData: { fingers } });
      toast.success('Attendance marked with fingerprint!');
      setActiveSessions((prev) => prev.filter((s: any) => s.id !== fingerprintSession));
      setFingerprintSession(null);
      await loadRecords();
    } catch (err: any) {
      if (err?.response?.data?.reason === 'not_enrolled') {
        setFingerprintSession(null);
        toast.error('No fingerprint enrolled yet.', {
          action: { label: 'Register Now', onClick: () => navigate('/student/face-register') },
          duration: 6000,
        });
        return;
      }
      throw err; // modal shows the hint and stays open for a retake
    }
  };

  const startQrScanner = async (session: any) => {
    setScanningSession(session);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const html5QrCode = new Html5Qrcode('attendance-qr-reader');
      html5QrRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          await html5QrCode.stop();
          setScanningSession(null);
          // The QR encodes a deep-link URL → go to the check-in page, which verifies
          // the live token and then runs the biometric. Falls back to a bare token.
          try {
            const u = new URL(decodedText);
            navigate(u.pathname + u.search);
          } catch {
            navigate(`/student/attend/${session.id}?qr=${encodeURIComponent(decodedText)}`);
          }
        },
        () => {},
      );
    } catch {
      setScanningSession(null);
      toast.error('Could not start camera. Please ask your teacher to show the QR code.');
    }
  };

  const stopQrScanner = async () => {
    if (html5QrRef.current) {
      await html5QrRef.current.stop().catch(() => {});
      html5QrRef.current = null;
    }
    setScanningSession(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified': return 'bg-green-50 text-green-700';
      case 'pending': return 'bg-yellow-50 text-yellow-700';
      case 'absent': return 'bg-red-50 text-red-700';
      default: return 'bg-gray-50 text-gray-700';
    }
  };

  // Group attendance records by course so the history reads cleanly per course.
  const grouped = useMemo(() => {
    const map = new Map<string, { courseName: string; courseCode: string; records: any[] }>();
    for (const r of records) {
      const key = String(r.courseId || r.courseCode || r.courseName || 'unknown');
      if (!map.has(key)) map.set(key, { courseName: r.courseName || '—', courseCode: r.courseCode || '', records: [] });
      map.get(key)!.records.push(r);
    }
    const arr = Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
    arr.forEach((g) => g.records.sort((a, b) => new Date(b.markedAt || 0).getTime() - new Date(a.markedAt || 0).getTime()));
    return arr.sort((a, b) => a.courseName.localeCompare(b.courseName));
  }, [records]);

  const isOpen = (key: string) => expanded[key] ?? true; // expanded by default
  const toggle = (key: string) => setExpanded((e) => ({ ...e, [key]: !(e[key] ?? true) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        <p className="text-gray-500 mt-1">Mark attendance and view your history</p>
      </div>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-primary-800 mb-3 flex items-center gap-2">
            <Clock size={20} />
            Active Sessions — Mark Your Attendance
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeSessions.map((s: any) => {
              const startsAt = s.startTime ? new Date(s.startTime) : null;
              const notStarted = !!startsAt && Date.now() < startsAt.getTime();
              const allowFace = s.allowFace !== false;
              const allowFingerprint = s.allowFingerprint === true;
              return (
                <div key={s.id} className={`bg-white rounded-lg border border-primary-100 p-4 flex flex-col gap-3 transition-opacity ${notStarted ? 'opacity-50' : ''}`}>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{s.courseName || 'Course'}</p>
                    <p className="text-xs text-gray-500">{s.courseCode} · Lecture #{s.lectureNumber}</p>
                    {notStarted && startsAt ? (
                      <p className="text-xs text-amber-600 font-medium mt-1 flex items-center gap-1">
                        <Lock size={12} /> Starts at {startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    ) : null}
                  </div>
                  {s.requireQr ? (
                    /* Live-QR presence gate: scan the projector QR (phone camera or
                       Google Lens) → opens the check-in page → face/fingerprint. */
                    <div>
                      <button
                        onClick={() => startQrScanner(s)}
                        disabled={notStarted}
                        title={notStarted ? 'Available once the lecture starts' : undefined}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Scan size={16} /> Scan QR to check in
                      </button>
                      <p className="text-xs text-gray-500 mt-1.5">
                        Scan the QR on the projector with this scanner, your phone camera, or Google Lens — then
                        confirm with face or fingerprint.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {allowFace && (
                        <button
                          onClick={() => startFaceMark(s.id, s.qrCodeSecret, s.courseName || 'Course')}
                          disabled={notStarted}
                          title={notStarted ? 'Available once the lecture starts' : undefined}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <ScanFace size={16} /> Face
                        </button>
                      )}
                      {allowFingerprint && (
                        <button
                          onClick={() => openFingerprint(s.id)}
                          disabled={notStarted}
                          title={notStarted ? 'Available once the lecture starts' : undefined}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Fingerprint size={16} /> Finger
                        </button>
                      )}
                      {!allowFace && !allowFingerprint && (
                        <span className="text-xs text-gray-400 self-center">No check-in method enabled</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Course filter — clickable quick-switch cards + dropdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        {courses.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilterCourse('')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                filterCourse === ''
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-primary-300 hover:bg-primary-50'
              }`}
            >
              All Courses
            </button>
            {courses.map((c: any) => {
              const active = filterCourse === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFilterCourse(c.id)}
                  title={c.name}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    active
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-primary-300 hover:bg-primary-50'
                  }`}
                >
                  <BookOpen size={14} className={active ? 'text-white' : 'text-primary-500'} />
                  {c.code || c.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Filter size={18} className="text-gray-400" />
          <select
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            <option value="">All Courses</option>
            {courses.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
            ))}
          </select>
        </div>
      </div>

      {/* History — grouped by course */}
      <div className="flex items-center gap-2">
        <ClipboardList size={20} className="text-gray-700" />
        <h2 className="font-semibold text-gray-900">Your Attendance</h2>
        <span className="text-sm text-gray-400">· organized by course</span>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">Loading attendance records...</div>
      ) : grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">No attendance records found</div>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => {
            const open = isOpen(g.key);
            const attended = g.records.filter((r) => r.status === 'verified').length;
            return (
              <div key={g.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button onClick={() => toggle(g.key)} className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center flex-none"><BookOpen size={18} /></div>
                    <div className="text-left min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{g.courseName}</p>
                      <p className="text-xs text-gray-500">{g.courseCode}{g.courseCode ? ' · ' : ''}{g.records.length} record{g.records.length === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-none">
                    <span className="text-xs font-semibold bg-green-50 text-green-700 px-2.5 py-1 rounded-full">{attended} attended</span>
                    <ChevronDown size={18} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {open && (
                  <div className="border-t border-gray-100 overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-2.5">Lecture</th>
                          <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-2.5">Date &amp; Time</th>
                          <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-2.5">Method</th>
                          <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-2.5">Status</th>
                          <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-5 py-2.5">Confidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {g.records.map((r) => (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-5 py-3 text-gray-700 font-medium">Lecture #{r.lectureNumber || '?'}</td>
                            <td className="px-5 py-3 text-gray-600 text-sm">{r.markedAt ? new Date(r.markedAt).toLocaleString() : '—'}</td>
                            <td className="px-5 py-3"><span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">{r.verificationMethod || 'N/A'}</span></td>
                            <td className="px-5 py-3"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(r.status)}`}>{r.status}</span></td>
                            <td className="px-5 py-3 text-sm text-gray-600">{r.confidenceScore ? `${Math.round(r.confidenceScore * 100)}%` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* QR Scanner Modal */}
      {scanningSession && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={stopQrScanner}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Scan QR Code</h3>
              <button onClick={stopQrScanner} className="text-gray-400 hover:text-gray-600"><XCircle size={20} /></button>
            </div>
            <div id="attendance-qr-reader" ref={qrContainerRef} className="w-full" style={{ minHeight: '250px' }} />
          </div>
        </div>
      )}

      {/* Face Capture Modal */}
      {faceCaptureSession && (
        <FaceCaptureExperience
          sessionId={faceCaptureSession}
          qrSecret={faceCaptureSecret}
          courseName={faceCaptureCourse}
          faceRegistered={faceRegistered === true}
          onClose={() => setFaceCaptureSession(null)}
          onSuccess={() => {
            setFaceCaptureSession(null);
            setActiveSessions((prev) => prev.filter((s: any) => s.id !== faceCaptureSession));
            loadRecords();
          }}
        />
      )}

      <FingerprintCaptureModal
        open={!!fingerprintSession}
        mode="verify"
        onClose={() => setFingerprintSession(null)}
        onVerify={handleFingerprintVerify}
      />
    </div>
  );
}
