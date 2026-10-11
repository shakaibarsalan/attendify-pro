import { useState, useRef, useCallback, useEffect, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Video, Smartphone, Monitor, RotateCcw } from 'lucide-react';
import WebcamWithOverlay, { type WebcamWithOverlayRef } from './WebcamWithOverlay';
import FaceBoundingBox from './FaceBoundingBox';
import QualityHints from './QualityHints';
import LivenessChallengeCard from './LivenessChallengeCard';
import GestureGuideOverlay from './GestureGuideOverlay';
import MultiStepVerifyProgress from './MultiStepVerifyProgress';
import ConfettiSuccess from './ConfettiSuccess';
import FailureScreen from './FailureScreen';
import api from '@/lib/api';

type Stage = 'select' | 'detect' | 'liveness' | 'verify' | 'success' | 'failure';

interface FaceCaptureExperienceProps {
  sessionId: string;
  qrSecret?: string;
  presencePass?: string;
  courseName?: string;
  faceRegistered: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const VERIFY_STEPS = [
  { icon: '\uD83D\uDD0D', label: 'Detecting face\u2026' },
  { icon: '\uD83D\uDEE1\uFE0F', label: 'Liveness check\u2026' },
  { icon: '\uD83E\uDDEC', label: 'Anti-spoof analysis\u2026' },
  { icon: '\uD83D\uDD0E', label: 'Matching identity\u2026' },
  { icon: '\u2713', label: 'Confirming attendance\u2026' },
];

function getDeviceIcon(label: string) {
  const l = label.toLowerCase();
  if (l.includes('front') || l.includes('facetime') || l.includes('selfie')) return <Smartphone size={18} />;
  if (l.includes('back') || l.includes('rear') || l.includes('environment')) return <Video size={18} />;
  if (l.includes('obs') || l.includes('virtual') || l.includes('stream')) return <Monitor size={18} />;
  return <Video size={18} />;
}

export default function FaceCaptureExperience({
  sessionId,
  qrSecret,
  presencePass,
  courseName,
  faceRegistered,
  onClose,
  onSuccess,
}: FaceCaptureExperienceProps) {
  const [stage, setStage] = useState<Stage>(faceRegistered ? 'select' : 'failure');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [previewDeviceId, setPreviewDeviceId] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceCentered, setFaceCentered] = useState(false);
  const [goodQuality, setGoodQuality] = useState(false);
  const [qualityHoldMs, setQualityHoldMs] = useState(0);
  // Escape hatch: face-centering guidance is best-effort (it depends on the AI
  // service round-trip). It must NEVER trap the user — if guidance is slow or
  // failing, we surface a manual "Continue" so they can always proceed.
  const [allowManualContinue, setAllowManualContinue] = useState(false);
  const detectFailRef = useRef(0);
  const [hints, setHints] = useState<Array<{ id: string; text: string; type: 'warning' | 'success' | 'info' }>>([]);
  const [livenessChallenges, setLivenessChallenges] = useState<string[]>([]);
  const livenessSessionIdRef = useRef('');
  const livenessTokenRef = useRef('');
  const livenessChallengesRef = useRef<string[]>([]);
  const [activeChallengeIdx, setActiveChallengeIdx] = useState(0);
  const [completedChallenges, setCompletedChallenges] = useState<Set<number>>(new Set());
  const livenessFramesRef = useRef<string[]>([]);
  // Early-advance bookkeeping: where the current gesture's frames start in the
  // buffer, and the highest challenge index already advanced (idempotency guard).
  const challengeStartFrameRef = useRef(0);
  const advancedIdxRef = useRef(-1);
  const [verifyStep, setVerifyStep] = useState(0);
  const [completedVerifySteps, setCompletedVerifySteps] = useState<Set<number>>(new Set());
  const [failReason, setFailReason] = useState('');
  const [isSpoofDetected, setIsSpoofDetected] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const webcamRef = useRef<WebcamWithOverlayRef>(null);
  const qualityHoldStart = useRef(0);

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    if (stage !== 'select') return;
    async function loadDevices() {
      try {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          stream.getTracks().forEach(t => t.stop());
        } catch {}
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
        setDevices(videoDevices);
        if (videoDevices.length === 0) {
          setDevices([{ deviceId: 'default', kind: 'videoinput', label: 'Default Camera', groupId: '' } as MediaDeviceInfo]);
        }
      } catch {
        setDevices([{ deviceId: 'default', kind: 'videoinput', label: 'Default Camera', groupId: '' } as MediaDeviceInfo]);
      }
    }
    loadDevices();
  }, [stage]);

  useEffect(() => {
    if (stage !== 'select' || !previewDeviceId) return;
    let cancelled = false;
    let stream: MediaStream | null = null;

    async function startPreview() {
      try {
        const constraints = previewDeviceId === 'default'
          ? { video: true, audio: false }
          : { video: { deviceId: { exact: previewDeviceId! }, width: { ideal: 320 }, height: { ideal: 240 } }, audio: false };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        setPreviewStream(stream);
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
          await previewVideoRef.current.play();
        }
      } catch {
        setPreviewStream(null);
      }
    }
    startPreview();

    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach(t => t.stop());
      setPreviewStream(null);
    };
  }, [stage, previewDeviceId]);

  const selectAndProceed = (deviceId: string) => {
    if (previewStream) {
      previewStream.getTracks().forEach(t => t.stop());
      setPreviewStream(null);
    }
    setSelectedDeviceId(deviceId);
    setStage('detect');
  };

  useEffect(() => {
    if (stage !== 'detect') return;
    if (!goodQuality || !faceCentered) {
      qualityHoldStart.current = 0;
      setQualityHoldMs(0);
      return;
    }

    if (qualityHoldStart.current === 0) qualityHoldStart.current = Date.now();

    const timer = setInterval(() => {
      const elapsed = Date.now() - qualityHoldStart.current;
      setQualityHoldMs(elapsed);
      // Readiness debounce before starting the challenge. Trimmed 1500 -> 1000ms
      // (Phase 1 UX): still a full second of stable, centered, good-quality face
      // before capture begins, so gesture frames aren't missed.
      if (elapsed >= 1000) {
        clearInterval(timer);
        qualityHoldStart.current = 0;
        fetchLivenessChallenges();
      }
    }, 100);

    return () => clearInterval(timer);
  }, [stage, goodQuality, faceCentered]);

  const fetchLivenessChallenges = async () => {
    try {
      const res: any = await api.post('/biometric/liveness/challenge', {});
      const challenges = res.challenges || ['mouth_open', 'turn_left'];
      setLivenessChallenges(challenges);
      livenessChallengesRef.current = challenges;
      livenessSessionIdRef.current = res.sessionId || res.session_id || '';
      livenessTokenRef.current = res.token || '';
      setActiveChallengeIdx(0);
      setCompletedChallenges(new Set());
      livenessFramesRef.current = [];
      challengeStartFrameRef.current = 0;
      advancedIdxRef.current = -1;
      setStage('liveness');
    } catch (e: any) {
      setFailReason('Could not start liveness challenge. ' + (e?.message || ''));
      setStage('failure');
    }
  };

  useEffect(() => {
    if (stage !== 'liveness') return;
    // Capture across the full challenge window (~2 challenges x 6s). The cap is sized
    // so the second challenge's frames are not truncated, which previously cut off
    // late gestures and caused liveness false-rejects.
    const captureInterval = setInterval(() => {
      const src = webcamRef.current?.getScreenshot();
      if (src && livenessFramesRef.current.length < 28) {
        livenessFramesRef.current.push(src);
      }
    }, 450);
    return () => clearInterval(captureInterval);
  }, [stage]);

  const onChallengeDone = useCallback(() => {
    // Idempotent per challenge: the early-advance poller and the 6s hard-cap timer
    // can both call this — only the first for a given index takes effect.
    if (advancedIdxRef.current >= activeChallengeIdx) return;
    advancedIdxRef.current = activeChallengeIdx;

    setCompletedChallenges((prev) => {
      const next = new Set(prev);
      next.add(activeChallengeIdx);
      return next;
    });

    // Phase 1 UX: brief hand-off between steps (was 500ms). Capture runs
    // continuously across the whole liveness stage, so this only paces the
    // on-screen instruction — it does not drop frames.
    if (activeChallengeIdx + 1 < livenessChallenges.length) {
      setTimeout(() => setActiveChallengeIdx((i) => i + 1), 300);
    } else {
      setTimeout(() => startFullVerification(), 200);
    }
  }, [activeChallengeIdx, livenessChallenges.length]);

  // Hard-cap fallback for a single gesture. Trimmed 6000 -> 4500ms: with the
  // early-advance poller below this rarely fires, and the authoritative server
  // verify scans the WHOLE frame buffer (not per-gesture windows), so a late
  // gesture is still counted — keeping accuracy while lowering the tail latency.
  useEffect(() => {
    if (stage !== 'liveness') return;
    const timer = setTimeout(onChallengeDone, 4500);
    return () => clearTimeout(timer);
  }, [stage, activeChallengeIdx, onChallengeDone]);

  // Early-advance: poll the non-destructive server gesture check and move on the
  // INSTANT the current gesture is detected, instead of waiting the full 6s. It
  // reuses the exact server detection used for final verification, so it cannot
  // change accuracy; on any error/slow network it does nothing and the 6s cap
  // above still fires — so the flow is never slower or weaker than before.
  useEffect(() => {
    if (stage !== 'liveness') return;
    const gesture = livenessChallenges[activeChallengeIdx];
    if (!gesture) return;
    // Frames captured from here on belong to this gesture (neutral baseline first).
    challengeStartFrameRef.current = livenessFramesRef.current.length;

    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (cancelled || inFlight) return;
      const gestureFrames = livenessFramesRef.current.slice(challengeStartFrameRef.current);
      if (gestureFrames.length < 3) return; // need a baseline + a little motion
      // Light payload: the neutral baseline frame + the most recent frames.
      const sample = gestureFrames.length <= 5 ? gestureFrames : [gestureFrames[0], ...gestureFrames.slice(-4)];
      inFlight = true;
      try {
        const res: any = await api.post('/biometric/liveness/check', { challenges: [gesture], frames: sample });
        if (!cancelled && Array.isArray(res?.results) && res.results.some((r: any) => r?.detected)) {
          cancelled = true;
          onChallengeDone();
        }
      } catch {
        /* ignore — the 6s hard-cap fallback still applies */
      } finally {
        inFlight = false;
      }
    };

    const interval = setInterval(poll, 600); // faster re-checks -> advance sooner once the gesture is done
    return () => { cancelled = true; clearInterval(interval); };
  }, [stage, activeChallengeIdx, livenessChallenges, onChallengeDone]);

  const startFullVerification = async () => {
    const frames = livenessFramesRef.current;
    const liveSid = livenessSessionIdRef.current;
    const liveToken = livenessTokenRef.current;
    const challenges = livenessChallengesRef.current;
    if (frames.length < 3) {
      setFailReason('Not enough frames captured. Please try again.');
      setStage('failure');
      return;
    }
    if (!liveSid || !liveToken) {
      setFailReason('Liveness session expired. Please try again.');
      setStage('failure');
      return;
    }

    setStage('verify');
    setVerifyStep(0);
    setCompletedVerifySteps(new Set());

    try {
      const stepDelay = prefersReducedMotion ? 150 : 300; // Phase 1 UX: verify-animation pacing (was 500); post-capture, no accuracy impact
      await new Promise((r) => setTimeout(r, stepDelay));
      setVerifyStep(1);
      setCompletedVerifySteps((prev) => new Set([...prev, 0]));

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
        });
      }).catch(() => null);

      const fp = await getDeviceFingerprint();

      await new Promise((r) => setTimeout(r, stepDelay));
      setVerifyStep(2);
      setCompletedVerifySteps((prev) => new Set([...prev, 1]));

      await api.post('/attendance/mark', {
        sessionId,
        qrSecret,
        presencePass,
        frames,
        livenessSessionId: liveSid,
        livenessToken: liveToken,
        expectedChallenges: challenges,
        lat: position?.coords.latitude,
        lng: position?.coords.longitude,
      }, {
        headers: {
          'Idempotency-Key': idempotencyKey,
          'X-Device-Fingerprint': fp,
        },
      });

      setCompletedVerifySteps(new Set(VERIFY_STEPS.map((_, i) => i)));
      setStage('success');
      setTimeout(onSuccess, 1400); // Phase 1 UX: success celebration trimmed 3200 -> 1400ms (cosmetic, after the result)
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || 'Verification failed';
      const reason = err?.response?.data?.reason || '';
      setFailReason(errorMsg);
      setIsSpoofDetected(
        reason.includes('spoof') || reason.includes('static_replay') || reason.includes('liveness') || errorMsg.toLowerCase().includes('spoof'),
      );
      setStage('failure');
    }
  };

  const getDeviceFingerprint = async (): Promise<string> => {
    try {
      const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      return result.visitorId;
    } catch {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('fp', 2, 2);
      }
      const data = canvas.toDataURL();
      let hash = 0;
      for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
      }
      return `fp_${Math.abs(hash).toString(36)}_${screen.width}x${screen.height}`;
    }
  };

  const detectFaceFromFrame = useCallback(async (): Promise<{ detected: boolean; centered: boolean; goodQuality: boolean; hints: typeof hints } | null> => {
    if (stage !== 'detect') return null;
    const src = webcamRef.current?.getScreenshot();
    if (!src) return null;

    try {
      const res: any = await api.post('/biometric/face/detect', { faceImage: src }, { timeout: 4000 });
      detectFailRef.current = 0;
      return {
        detected: res.detected === true,
        centered: res.centered === true,
        goodQuality: res.qualityOk === true,
        hints: res.hints || [],
      };
    } catch {
      // Guidance call failed/timed out — after a few misses, let the user proceed
      // manually so flaky guidance can never block attendance.
      detectFailRef.current += 1;
      if (detectFailRef.current >= 3) setAllowManualContinue(true);
      return null;
    }
  }, [stage]);

  const simulateFaceDetection = useCallback(() => {
    if (stage !== 'detect') return;

    detectFaceFromFrame().then((result) => {
      if (!result || stage !== 'detect') return;

      setFaceDetected(result.detected);
      setFaceCentered(result.centered);
      setGoodQuality(result.goodQuality);
      setHints(result.hints);
    });
  }, [stage, detectFaceFromFrame]);

  useEffect(() => {
    if (stage !== 'detect') {
      setAllowManualContinue(false);
      detectFailRef.current = 0;
      return;
    }
    // Poll guidance at a calmer cadence (was 300ms = ~3 AI calls/sec, which
    // overloaded the single-VM AI and caused timeouts). 700ms is plenty for
    // guidance and roughly halves the load.
    const interval = setInterval(simulateFaceDetection, 700);
    // Never trap the user: if guidance hasn't auto-advanced quickly, surface a
    // manual "Continue" so a slow/flaky AI can't block attendance during a live
    // demo. Kept short (2.5s) because guidance is best-effort, not a gate.
    const escapeTimer = setTimeout(() => setAllowManualContinue(true), 2500);
    return () => { clearInterval(interval); clearTimeout(escapeTimer); };
  }, [stage, simulateFaceDetection]);

  const handleRetry = () => {
    setIdempotencyKey(crypto.randomUUID());
    setFailReason('');
    setIsSpoofDetected(false);
    setStage('select');
  };

  const progressPct = Math.min((qualityHoldMs / 1500) * 100, 100);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stage}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        onClick={(e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); }}
        role="dialog"
        aria-modal="true"
        aria-label="Face verification"
      >
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 p-2 bg-black/20 text-white rounded-full hover:bg-black/40 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <div className="p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 text-center">
              {stage === 'select' && 'Select Camera'}
              {stage === 'detect' && 'Position Your Face'}
              {stage === 'liveness' && 'Follow Instructions'}
              {stage === 'verify' && 'Verifying\u2026'}
              {stage === 'success' && ''}
              {stage === 'failure' && ''}
            </h2>

            {stage === 'select' && (
              <div className="space-y-4">
                <div className="relative aspect-[3/4] max-h-[50vh] mx-auto bg-gray-900 rounded-lg overflow-hidden">
                  {previewDeviceId ? (
                    <video
                      ref={previewVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
                      <Video size={40} className="text-gray-400" />
                      <p className="text-sm text-gray-400">Select a camera below to preview</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600">
                    {devices.length} camera{devices.length !== 1 ? 's' : ''} found
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {devices.map((device, idx) => {
                      const label = device.label || `Camera ${idx + 1}`;
                      const isSelected = previewDeviceId === device.deviceId;
                      return (
                        <button
                          key={device.deviceId}
                          onClick={() => setPreviewDeviceId(device.deviceId)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all text-left ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                            {getDeviceIcon(label)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                              {label}
                            </p>
                            <p className="text-xs text-gray-400 truncate">{device.deviceId.slice(0, 20)}...</p>
                          </div>
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={() => previewDeviceId ? selectAndProceed(previewDeviceId) : null}
                  disabled={!previewDeviceId}
                  className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {previewDeviceId ? 'Use This Camera' : 'Select a Camera First'}
                </button>
              </div>
            )}

            {(stage === 'detect' || stage === 'liveness') && (
              <div className="relative aspect-[3/4] max-h-[60vh] mx-auto bg-gray-900 rounded-lg overflow-hidden mb-4">
                <WebcamWithOverlay ref={webcamRef} mirrored deviceId={selectedDeviceId || undefined}>
                  <FaceBoundingBox detected={faceDetected} centered={faceCentered} goodQuality={goodQuality} />

                  {stage === 'liveness' && (
                    <GestureGuideOverlay challenge={livenessChallenges[activeChallengeIdx]} />
                  )}

                  {stage === 'detect' && goodQuality && faceCentered && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-48">
                      <div className="h-2 bg-white/30 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all duration-100"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => { if (previewStream) previewStream.getTracks().forEach(t => t.stop()); setStage('select'); }}
                    className="absolute top-2 left-2 z-10 p-1.5 bg-black/40 text-white rounded-full hover:bg-black/60 transition-colors"
                    title="Switch Camera"
                  >
                    <RotateCcw size={14} />
                  </button>
                </WebcamWithOverlay>
              </div>
            )}

            {stage === 'detect' && <QualityHints hints={hints} />}

            {stage === 'detect' && allowManualContinue && (
              <div className="mt-3 text-center">
                <p className="text-xs text-gray-500 mb-2">
                  {faceDetected
                    ? 'Auto-detect is taking a moment — if your face is in the frame, just continue.'
                    : 'Make sure your face is clearly visible and well-lit, then continue.'}
                </p>
                <button
                  onClick={() => fetchLivenessChallenges()}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Continue
                </button>
              </div>
            )}

            {stage === 'liveness' && (
              <div className="space-y-3">
                {livenessChallenges.map((ch, idx) => (
                  <LivenessChallengeCard
                    key={ch}
                    challenge={ch}
                    icon=""
                    instruction={ch}
                    countdownSeconds={6}
                    active={idx === activeChallengeIdx}
                    completed={completedChallenges.has(idx)}
                  />
                ))}
              </div>
            )}

            {stage === 'verify' && (
              <MultiStepVerifyProgress
                steps={VERIFY_STEPS}
                currentStep={verifyStep}
                completedSteps={completedVerifySteps}
              />
            )}

            {stage === 'success' && (
              <ConfettiSuccess
                message="Attendance Marked!"
                subtitle={courseName ? `${courseName} at ${new Date().toLocaleTimeString()}` : undefined}
                onDismiss={onClose}
              />
            )}

            {stage === 'failure' && !faceRegistered && (
              <FailureScreen
                reason="Face not registered. Please register your face first."
                isSpoofDetected={false}
                onRetry={() => onClose()}
                onClose={onClose}
              />
            )}

            {stage === 'failure' && faceRegistered && (
              <FailureScreen
                reason={failReason}
                isSpoofDetected={isSpoofDetected}
                onRetry={handleRetry}
                onClose={onClose}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
