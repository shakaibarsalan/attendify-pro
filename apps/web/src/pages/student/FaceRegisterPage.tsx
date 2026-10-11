import { useState, useCallback, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Camera, RotateCcw, Upload, CheckCircle, XCircle, Loader2, ScanFace, RefreshCw, Fingerprint, Trash2 } from 'lucide-react';
import { biometricApi, fingerprintApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';
import FingerprintCaptureModal from '@/components/fingerprint/FingerprintCaptureModal';

type RegistrationStatus = 'idle' | 'captured' | 'submitting' | 'success' | 'error';

function photoStorageKey(userId: string) {
  return `face_photo_${userId}`;
}

export default function FaceRegisterPage() {
  const { user } = useAuthStore();
  const webcamRef = useRef<Webcam>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [status, setStatus] = useState<RegistrationStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Existing-registration check: avoid re-prompting users who are already registered.
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [embeddingsCount, setEmbeddingsCount] = useState(0);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);
  const [showCapture, setShowCapture] = useState(false);

  // Contactless fingerprint (camera-based)
  const [fpCount, setFpCount] = useState(0);
  const [fpModalOpen, setFpModalOpen] = useState(false);
  const [fpBusy, setFpBusy] = useState(false);

  const loadFpStatus = useCallback(() => {
    fingerprintApi.status()
      .then((res: any) => setFpCount(res.templatesCount ?? res.templates_count ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => { loadFpStatus(); }, [loadFpStatus]);

  const handleFpRemove = async () => {
    if (!window.confirm('Remove all enrolled fingerprint samples?')) return;
    setFpBusy(true);
    try {
      await fingerprintApi.remove();
      toast.success('Fingerprint samples removed.');
      setFpCount(0);
    } catch {
      toast.error('Could not remove fingerprint samples.');
    } finally {
      setFpBusy(false);
    }
  };

  useEffect(() => {
    biometricApi.faceStatus()
      .then((res: any) => {
        const registered = res.hasPrimary === true;
        setAlreadyRegistered(registered);
        setEmbeddingsCount(res.embeddingsCount || 0);
        if (registered && user?.id) {
          setExistingPhoto(localStorage.getItem(photoStorageKey(user.id)));
        }
        setShowCapture(!registered);
      })
      .catch(() => setShowCapture(true))
      .finally(() => setCheckingStatus(false));
  }, [user?.id]);

  const videoConstraints = {
    width: { ideal: 480 },
    height: { ideal: 640 },
    facingMode,
  };

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setCapturedImage(imageSrc);
      setStatus('captured');
      setErrorMessage('');
    }
  }, []);

  const retake = useCallback(() => {
    setCapturedImage(null);
    setStatus('idle');
    setErrorMessage('');
  }, []);

  const toggleCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
    setCapturedImage(null);
    setStatus('idle');
  }, []);

  const handleSubmit = async () => {
    if (!capturedImage) return;

    setStatus('submitting');
    setErrorMessage('');

    try {
      await biometricApi.registerFace(capturedImage);
      setStatus('success');
      setAlreadyRegistered(true);
      if (user?.id) {
        localStorage.setItem(photoStorageKey(user.id), capturedImage);
        setExistingPhoto(capturedImage);
      }
    } catch (err: any) {
      setStatus('error');
      const msg = err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Registration failed. Please try again.';
      setErrorMessage(msg);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Biometric Registration</h1>
        <p className="text-gray-500 mt-1">
          Register your face and fingerprint for biometric attendance verification
        </p>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        {checkingStatus ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin" /> Checking registration status...
          </div>
        ) : alreadyRegistered && !showCapture ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Face Already Registered</h2>
            <p className="text-gray-500">
              You're all set — face verification is enabled for your account
              {embeddingsCount > 0 ? ` (${embeddingsCount} sample${embeddingsCount > 1 ? 's' : ''} on file)` : ''}.
            </p>
            {existingPhoto ? (
              <img
                src={existingPhoto}
                alt="Your registered face"
                className="w-48 h-48 rounded-full mx-auto object-cover border-4 border-green-100"
              />
            ) : (
              <div className="w-48 h-48 rounded-full mx-auto bg-gray-100 flex items-center justify-center border-4 border-green-100">
                <ScanFace size={48} className="text-gray-300" />
              </div>
            )}
            <button
              onClick={() => { setShowCapture(true); setStatus('idle'); setCapturedImage(null); }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <RefreshCw size={16} />
              Re-register Face
            </button>
          </div>
        ) : status === 'success' ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Registration Successful
            </h2>
            <p className="text-gray-500">
              Your face has been registered successfully. You can now use
              biometric verification for attendance.
            </p>
            {capturedImage && (
              <img
                src={capturedImage}
                alt="Registered face"
                className="w-48 h-48 rounded-full mx-auto object-cover border-4 border-green-100"
              />
            )}
            <button
              onClick={() => {
                setCapturedImage(null);
                setStatus('idle');
              }}
              className="mt-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Register Another
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanFace size={20} className="text-blue-600" />
                <h2 className="font-semibold text-gray-900">Camera Preview</h2>
              </div>
              {!capturedImage && (
                <button
                  onClick={toggleCamera}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Switch camera"
                >
                  <RotateCcw size={18} />
                </button>
              )}
            </div>

            <div className="p-5">
              <div className="relative aspect-[3/4] max-h-[60vh] mx-auto bg-gray-900 rounded-lg overflow-hidden">
                {!capturedImage ? (
                  <>
                    <Webcam
                      ref={webcamRef}
                      audio={false}
                      screenshotFormat="image/jpeg"
                      videoConstraints={videoConstraints}
                      className="w-full h-full object-cover"
                      mirrored={facingMode === 'user'}
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-48 md:w-56 md:h-56 border-2 border-white/40 rounded-full" />
                    </div>
                    <div className="absolute bottom-4 left-0 right-0 text-center">
                      <p className="text-white/80 text-sm bg-black/30 inline-block px-3 py-1 rounded-full">
                        Position your face within the circle
                      </p>
                    </div>
                  </>
                ) : (
                  <img
                    src={capturedImage}
                    alt="Captured"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {status === 'error' && errorMessage && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 flex items-center gap-2">
                  <XCircle size={16} />
                  <span className="text-sm">{errorMessage}</span>
                </div>
              )}

              <div className="mt-4 flex items-center justify-center gap-3">
                {!capturedImage ? (
                  <button
                    onClick={capture}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Camera size={18} />
                    Capture Photo
                  </button>
                ) : (
                  <>
                    <button
                      onClick={retake}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <RotateCcw size={18} />
                      Retake
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={status === 'submitting'}
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {status === 'submitting' ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          Registering...
                        </>
                      ) : (
                        <>
                          <Upload size={18} />
                          Register Face
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Contactless fingerprint enrollment (camera-based) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-lg ${fpCount > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                <Fingerprint size={22} />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Fingerprint Check-in (camera)</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {fpCount > 0
                    ? `${fpCount} sample${fpCount > 1 ? 's' : ''} enrolled${fpCount < 3 ? ' — add more for best accuracy (3 recommended)' : ' — ready'}.`
                    : 'Photograph your fingertip with your phone’s rear camera (flash on) to enable fingerprint attendance.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {fpCount > 0 && (
                <button
                  onClick={handleFpRemove}
                  disabled={fpBusy}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Remove all fingerprint samples"
                >
                  <Trash2 size={17} />
                </button>
              )}
              <button
                onClick={() => setFpModalOpen(true)}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  fpCount > 0 ? 'text-gray-700 bg-gray-100 hover:bg-gray-200' : 'text-white bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <Fingerprint size={16} />
                {fpCount > 0 ? 'Add Sample' : 'Register Fingerprint'}
              </button>
            </div>
          </div>
        </div>

        <FingerprintCaptureModal
          open={fpModalOpen}
          mode="register"
          onClose={() => setFpModalOpen(false)}
          onRegistered={(s) => setFpCount(s.templatesCount)}
        />

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
          <h3 className="font-medium text-blue-900 mb-2">Guidelines</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>Ensure good lighting on your face</li>
            <li>Remove glasses, masks, or anything covering your face</li>
            <li>Look directly at the camera</li>
            <li>Keep a neutral expression</li>
            <li>Only one face should be visible in the frame</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
