import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { coursesApi, sessionsApi, attendanceApi, biometricApi, fingerprintApi } from '@/lib/api';
import { BookOpen, Clock, TrendingUp, Camera, CheckCircle2, XCircle, ScanFace, ShieldAlert, Scan, Lock, Fingerprint, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import FaceCaptureExperience from '@/components/face/FaceCaptureExperience';
import FingerprintCaptureModal from '@/components/fingerprint/FingerprintCaptureModal';
import CourseDetailModal from '@/components/student/CourseDetailModal';

export default function StudentDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [faceRegistered, setFaceRegistered] = useState<boolean | null>(null);

  const [faceCaptureSession, setFaceCaptureSession] = useState<string | null>(null);
  const faceCaptureSessionRef = useRef<string | null>(null);
  const [faceCaptureSecret, setFaceCaptureSecret] = useState('');
  const [faceCaptureCourse, setFaceCaptureCourse] = useState('');

  const [fingerprintSession, setFingerprintSession] = useState<string | null>(null);
  const [fpEnrolled, setFpEnrolled] = useState<boolean | null>(null);
  const [scanningQr, setScanningQr] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  const html5QrRef = useRef<any>(null);
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const qrReaderId = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    Promise.all([
      coursesApi.list(),
      attendanceApi.myStats(),
      sessionsApi.list({ status: 'active' }),
    ])
      .then(([c, s, sess]) => {
        setCourses(c.data ?? []);
        setStats(Array.isArray(s) ? s : []);
        setActiveSessions(sess.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    biometricApi.faceStatus()
      .then((res: any) => {
        setFaceRegistered(res.hasPrimary === true);
      })
      .catch(() => {
        setFaceRegistered(false);
      });
  }, []);

  const overallPercentage = stats.length > 0
    ? Math.round(stats.reduce((sum: number, s: any) => sum + (parseFloat(s.attendancePercentage) || 0), 0) / stats.length)
    : 0;


  const startFaceMark = (sessionId: string, courseName: string) => {
    if (!faceRegistered) {
      toast.error('Please register your face first before using face attendance.', {
        action: {
          label: 'Register Now',
          onClick: () => navigate('/student/face-register'),
        },
        duration: 6000,
      });
      return;
    }
    faceCaptureSessionRef.current = sessionId;
    setFaceCaptureSession(sessionId);
    setFaceCaptureSecret('');
    setFaceCaptureCourse(courseName);
  };

  // Don't let students start a fingerprint check-in before they've enrolled.
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

  // Called by the fingerprint modal with the four captured fingertips; throwing
  // keeps the modal open so the student can retake on a quality/match failure.
  const handleFingerprintVerify = async (fingers: { position: string; image: string }[]) => {
    if (!fingerprintSession) return;
    try {
      await attendanceApi.mark({ sessionId: fingerprintSession, fingerprintData: { fingers } });
      toast.success('Attendance marked with fingerprint!');
      setActiveSessions((prev) => prev.filter((s: any) => s.id !== fingerprintSession));
      setFingerprintSession(null);
    } catch (err: any) {
      if (err?.response?.data?.reason === 'not_enrolled') {
        setFingerprintSession(null);
        toast.error('No fingerprint enrolled yet.', {
          action: { label: 'Register Now', onClick: () => navigate('/student/face-register') },
          duration: 6000,
        });
        return;
      }
      throw err; // modal shows the quality/match hint and stays open
    }
  };

  const startQrScanner = async (session: any) => {
    setScanningQr(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const html5QrCode = new Html5Qrcode(qrReaderId.current);
      html5QrRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          await html5QrCode.stop();
          setScanningQr(false);
          // The QR encodes a deep-link URL → go to the check-in page (verifies the
          // live token, then runs the biometric). Falls back to a bare token.
          try {
            const u = new URL(decodedText);
            navigate(u.pathname + u.search);
          } catch {
            navigate(`/student/attend/${session.id}?qr=${encodeURIComponent(decodedText)}`);
          }
        },
        () => {},
      );
    } catch (err: any) {
      setScanningQr(false);
      toast.error('Could not start camera. Please ask your teacher to show the QR code and scan it.');
    }
  };

  const stopQrScanner = async () => {
    try {
      if (html5QrRef.current?.isScanning) {
        await html5QrRef.current.stop();
      }
    } catch {}
    setScanningQr(false);
  };

  const cards = [
    { label: 'Enrolled Courses', value: courses.length, icon: <BookOpen size={24} />, color: 'bg-blue-50 text-blue-600', to: '/student/courses' },
    { label: 'Overall Attendance', value: `${overallPercentage}%`, icon: <TrendingUp size={24} />, color: overallPercentage >= 80 ? 'bg-green-50 text-green-600' : overallPercentage >= 60 ? 'bg-yellow-50 text-yellow-600' : 'bg-red-50 text-red-600', to: '/student/analytics' },
    { label: 'Active Sessions', value: activeSessions.length, icon: <Clock size={24} />, color: 'bg-purple-50 text-purple-600', to: '/student/attendance' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Student Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back, {user?.fullName}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

      {faceRegistered === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-4">
          <div className="p-2 rounded-lg bg-amber-100 text-amber-600 shrink-0">
            <ShieldAlert size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-amber-900">Face Not Registered</h3>
            <p className="text-sm text-amber-700 mt-1">
              You have not registered your face for biometric attendance. Face verification is required for secure attendance marking.
            </p>
            <button
              onClick={() => navigate('/student/face-register')}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
            >
              <ScanFace size={16} />
              Register Your Face
            </button>
          </div>
        </div>
      )}

      {faceRegistered === true && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 size={20} className="text-green-600 shrink-0" />
          <p className="text-sm text-green-700">
            <span className="font-medium text-green-900">Face registered.</span> You can use face verification for attendance.
          </p>
        </div>
      )}

      {activeSessions.length > 0 && (
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl border border-primary-200 p-5">
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
                <div key={s.id} className={`bg-white rounded-lg border border-primary-100 p-4 transition-opacity ${notStarted ? 'opacity-50' : ''}`}>
                  <div className="flex flex-col gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{s.courseName || `Course`}</p>
                      <p className="text-sm text-gray-500">{s.courseCode || ''}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Lecture #{s.lectureNumber || '?'}
                        {notStarted && startsAt ? ` — Starts at ${startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                        {!notStarted && s.endTime ? ` — Ends: ${new Date(s.endTime).toLocaleTimeString()}` : ''}
                      </p>
                      {notStarted && (
                        <p className="text-xs text-amber-600 font-medium mt-1 flex items-center gap-1">
                          <Lock size={12} /> Attendance opens when the lecture starts
                        </p>
                      )}
                    </div>
                    {s.requireQr ? (
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
                          Scan the QR on the projector (this scanner, your phone camera, or Google Lens), then
                          confirm with face or fingerprint.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {allowFace && (
                          <button
                            onClick={() => startFaceMark(s.id, s.courseName || 'Course')}
                            disabled={notStarted}
                            title={notStarted ? 'Available once the lecture starts' : undefined}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <Camera size={16} /> Face
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
                </div>
              );
            })}
          </div>
        </div>
      )}

      {scanningQr && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={stopQrScanner}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Scan QR Code</h3>
              <button onClick={stopQrScanner} className="text-gray-400 hover:text-gray-600"><XCircle size={20} /></button>
            </div>
            <div id={qrReaderId.current} ref={qrContainerRef} className="w-full" style={{ minHeight: '250px' }} />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Course Attendance</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : stats.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No attendance data yet</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {stats.map((s: any) => {
              const pct = Math.round(parseFloat(s.attendancePercentage) || 0);
              const openCourse = () => {
                const full = courses.find((c: any) => c.id === s.courseId);
                setSelectedCourse(full || { id: s.courseId, name: s.courseName, code: s.courseCode });
              };
              return (
                <div
                  key={s.courseId}
                  onClick={openCourse}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCourse(); } }}
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${s.courseName}`}
                  className="px-5 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer focus:outline-none focus:bg-gray-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{s.courseName}</p>
                      <p className="text-sm text-gray-500">{s.courseCode}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">{s.attendedSessions}/{s.totalSessions} classes</p>
                      <p className={`text-lg font-bold ${pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {pct}%
                      </p>
                    </div>
                    <div className="w-24 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <ChevronRight size={18} className="text-gray-300" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {faceCaptureSession && (
        <FaceCaptureExperience
          sessionId={faceCaptureSession}
          qrSecret={faceCaptureSecret}
          courseName={faceCaptureCourse}
          faceRegistered={faceRegistered === true}
          onClose={() => setFaceCaptureSession(null)}
          onSuccess={() => {
            const sid = faceCaptureSessionRef.current;
            setFaceCaptureSession(null);
            if (sid) {
              setActiveSessions((prev) => prev.filter((s: any) => s.id !== sid));
            }
          }}
        />
      )}

      <FingerprintCaptureModal
        open={!!fingerprintSession}
        mode="verify"
        onClose={() => setFingerprintSession(null)}
        onVerify={handleFingerprintVerify}
      />

      {selectedCourse && (
        <CourseDetailModal
          course={selectedCourse}
          stat={stats.find((s: any) => s.courseId === selectedCourse.id)}
          onClose={() => setSelectedCourse(null)}
        />
      )}
    </div>
  );
}
