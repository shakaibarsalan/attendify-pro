import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { sessionsApi, attendanceApi, biometricApi, fingerprintApi } from '@/lib/api';
import FaceCaptureExperience from '@/components/face/FaceCaptureExperience';
import FingerprintCaptureModal from '@/components/fingerprint/FingerprintCaptureModal';
import { toast } from 'sonner';
import { ShieldCheck, ScanFace, Fingerprint, Loader2, XCircle, CheckCircle2 } from 'lucide-react';

/**
 * Deep-link landing for the live-QR presence gate. The teacher's projector QR is a
 * URL pointing here (/student/attend/:sessionId?qr=<token>), so it can be opened by
 * Google Lens or any camera. We exchange the freshly-scanned 3s token for a signed
 * presence pass, then let the student confirm identity with face or fingerprint.
 */
export default function AttendCheckIn() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [params] = useSearchParams();
  const qrToken = params.get('qr') || '';
  const navigate = useNavigate();

  const [state, setState] = useState<'verifying' | 'ready' | 'error' | 'done'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [pass, setPass] = useState('');
  const [faceRegistered, setFaceRegistered] = useState(false);
  const [fpEnrolled, setFpEnrolled] = useState(false);
  const [showFace, setShowFace] = useState(false);
  const [showFp, setShowFp] = useState(false);

  useEffect(() => {
    biometricApi.faceStatus().then((r: any) => setFaceRegistered(r.hasPrimary === true)).catch(() => {});
    fingerprintApi.status().then((r: any) => setFpEnrolled((r.templatesCount ?? r.templates_count ?? 0) > 0)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sessionId) { setState('error'); setErrorMsg('Invalid check-in link.'); return; }
    if (!qrToken) { setState('error'); setErrorMsg('Scan the QR code shown by your teacher to check in.'); return; }
    sessionsApi.verifyPresence(sessionId, { qrToken })
      .then((res: any) => { setPass(res.pass); setState('ready'); })
      .catch((err: any) => {
        setState('error');
        setErrorMsg(err?.response?.data?.error || 'That QR could not be verified — scan the current QR on the screen.');
      });
  }, [sessionId, qrToken]);

  const onMarked = () => {
    setShowFace(false); setShowFp(false); setState('done');
    setTimeout(() => navigate('/student/attendance'), 1600);
  };

  const markFingerprint = async (fingers: { position: string; image: string }[]) => {
    try {
      await attendanceApi.mark({ sessionId, fingerprintData: { fingers }, presencePass: pass });
      toast.success('Attendance marked!');
      onMarked();
    } catch (err: any) {
      if (err?.response?.data?.reason === 'not_enrolled') {
        toast.error('No fingerprint enrolled yet. Register first.');
        setShowFp(false);
        return;
      }
      throw err; // keep the modal open for a retake
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
        {state === 'verifying' && (
          <>
            <Loader2 size={40} className="mx-auto text-indigo-600 animate-spin" />
            <h1 className="text-lg font-bold text-gray-900 mt-4">Confirming you're in class…</h1>
            <p className="text-sm text-gray-500 mt-1">Checking the live QR code.</p>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle size={44} className="mx-auto text-red-500" />
            <h1 className="text-lg font-bold text-gray-900 mt-4">Check-in not verified</h1>
            <p className="text-sm text-gray-600 mt-1">{errorMsg}</p>
            <p className="text-xs text-gray-400 mt-3">The QR refreshes every few seconds — make sure you're scanning the current one on the projector.</p>
            <button onClick={() => navigate('/student')} className="mt-5 px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg">
              Back to dashboard
            </button>
          </>
        )}

        {state === 'ready' && (
          <>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm font-medium">
              <ShieldCheck size={16} /> Presence verified
            </div>
            <h1 className="text-lg font-bold text-gray-900 mt-4">Now confirm it's you</h1>
            <p className="text-sm text-gray-500 mt-1">Mark your attendance with your face or fingerprint.</p>
            <div className="grid grid-cols-1 gap-3 mt-5">
              <button
                onClick={() => (faceRegistered ? setShowFace(true) : toast.error('Register your face first (Profile → Biometrics).'))}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl">
                <ScanFace size={18} /> Mark with Face
              </button>
              <button
                onClick={() => (fpEnrolled ? setShowFp(true) : toast.error('Register your fingerprint first (Profile → Biometrics).'))}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold rounded-xl">
                <Fingerprint size={18} /> Mark with Fingerprint
              </button>
            </div>
          </>
        )}

        {state === 'done' && (
          <>
            <CheckCircle2 size={48} className="mx-auto text-green-600" />
            <h1 className="text-lg font-bold text-gray-900 mt-4">Attendance marked ✓</h1>
            <p className="text-sm text-gray-500 mt-1">Redirecting…</p>
          </>
        )}
      </div>

      {showFace && sessionId && (
        <FaceCaptureExperience
          sessionId={sessionId}
          presencePass={pass}
          faceRegistered={faceRegistered}
          onClose={() => setShowFace(false)}
          onSuccess={onMarked}
        />
      )}

      <FingerprintCaptureModal
        open={showFp}
        mode="verify"
        onClose={() => setShowFp(false)}
        onVerify={markFingerprint}
      />
    </div>
  );
}
