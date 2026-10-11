import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Fingerprint, Camera, RotateCcw, Zap, ZapOff, Loader2, CheckCircle2, Info, Sun, Focus, Waves } from 'lucide-react';
import { fingerprintApi, type FingerCapture } from '@/lib/api';
import { toast } from 'sonner';

/**
 * Single-finger close-up capture.
 *
 * No hand-detection model: the user presses ONE fingertip flat against / very
 * close to the rear camera with the flash on (where the ridges are sharp). An
 * on-device quality coach measures brightness, focus (Laplacian variance) and
 * ridge texture (luma contrast) on the guide region every frame, lights the guide
 * green only when the shot will pass, and auto-captures on a short steady-lock —
 * so it never grabs a blurry/low-detail frame. Enrol a few samples; verify with
 * one. Sent to the API as a one-element fingers[] array.
 */

// Guide region (fractions of the container) — overlay + crop share these.
const GX = 0.14, GY = 0.12, GW = 0.72, GH = 0.76;
const CROP_PX = 512;

// Quality thresholds on the SAMPLE_W×SAMPLE_H downsample of the guide region.
// Assistive only (server runs the authoritative gate) — tune freely.
const SAMPLE_W = 80, SAMPLE_H = 96;
const Q = {
  noFingerLuma: 45,   // below → nothing / lens uncovered
  darkLuma: 70,       // below → too dark (press finger flat, flash on)
  brightLuma: 250,    // above → blown out (ease the flash / lift slightly)
  sharpMin: 55,       // Laplacian variance → must be GENUINELY in focus before capture
  detailMin: 14,      // luma std-dev → ridges visible
  rednessMin: 1.12,   // R / avg(G,B): a fingertip glows red under flash; a room
                      // scene ~1.0. THIS is what stops it capturing with no finger.
};
const LOCK_MS = 1200;  // sharpness must hold this long (lets autofocus settle) before auto-capture
const TICK_MS = 100;
const REARM_MS = 900;

type GState = 'init' | 'no_finger' | 'dark' | 'bright' | 'blurry' | 'low_detail' | 'good';
const GUIDE: Record<GState, { msg: string; color: string }> = {
  init:       { msg: 'Starting camera…',                       color: '#9ca3af' },
  no_finger:  { msg: 'Cover the rear camera with one fingertip', color: '#9ca3af' },
  dark:       { msg: 'Press your finger flat — turn on flash',  color: '#f59e0b' },
  bright:     { msg: 'Too bright — lift your finger slightly',  color: '#f59e0b' },
  blurry:     { msg: 'Hold steady — focusing…',                 color: '#f59e0b' },
  low_detail: { msg: 'Press flat and hold still',              color: '#f59e0b' },
  good:       { msg: 'Hold still — capturing…',                 color: '#22c55e' },
};

interface Props {
  open: boolean;
  mode: 'register' | 'verify';
  onClose: () => void;
  onRegistered?: (summary: { templatesCount: number; enrolledPositions: string[] }) => void;
  onVerify?: (fingers: FingerCapture[]) => Promise<void>;
}

export default function FingerprintCaptureModal({ open, mode, onClose, onRegistered, onVerify }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const goodSinceRef = useRef<number>(0);
  const armAtRef = useRef<number>(0);
  const captureRef = useRef<() => void>(() => {});

  const [camError, setCamError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [samples, setSamples] = useState(0);
  const [g, setG] = useState<GState>('init');
  const [quality, setQuality] = useState({ light: false, focus: false, detail: false });
  const [lockPct, setLockPct] = useState(0);

  // ── camera lifecycle ───────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current; if (!video) return;
        video.srcObject = stream; await video.play();
        const track = stream.getVideoTracks()[0]; trackRef.current = track;
        const caps: any = track.getCapabilities?.() || {};
        const torchOk = !!caps.torch; setTorchSupported(torchOk);
        const adv: any[] = [];
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) adv.push({ focusMode: 'continuous' });
        if (torchOk) adv.push({ torch: true });
        if (adv.length) { try { await track.applyConstraints({ advanced: adv } as any); if (torchOk) setTorchOn(true); } catch { /* ignore */ } }
      } catch { if (!cancelled) setCamError('Could not start the camera. Allow camera access and try again.'); }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
      setTorchOn(false); setCaptured(null); setHint(null); setG('init'); setLockPct(0);
      goodSinceRef.current = 0;
    };
  }, [open]);

  const toggleTorch = async () => {
    try { await trackRef.current?.applyConstraints({ advanced: [{ torch: !torchOn }] } as any); setTorchOn((t) => !t); }
    catch { toast.error('Could not control the flash on this device.'); }
  };

  // source rect (video px) of the guide region under object-cover
  const guideRect = () => {
    const video = videoRef.current, container = containerRef.current;
    if (!video || !container || !video.videoWidth) return null;
    const vw = video.videoWidth, vh = video.videoHeight;
    const disp = container.getBoundingClientRect();
    const scale = Math.max(disp.width / vw, disp.height / vh);
    const visW = disp.width / scale, visH = disp.height / scale;
    const offX = (vw - visW) / 2, offY = (vh - visH) / 2;
    return { sx: offX + (GX * disp.width) / scale, sy: offY + (GY * disp.height) / scale, sw: (GW * disp.width) / scale, sh: (GH * disp.height) / scale };
  };

  const captureFingerprint = (): string | null => {
    const video = videoRef.current, r = guideRect();
    if (!video || !r) return null;
    const canvas = document.createElement('canvas'); canvas.width = CROP_PX; canvas.height = CROP_PX;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, CROP_PX, CROP_PX);
    return canvas.toDataURL('image/jpeg', 0.95);
  };

  const doCapture = useCallback(() => {
    const img = captureFingerprint();
    if (!img) { toast.error('Camera is not ready yet.'); return; }
    goodSinceRef.current = 0; setHint(null); setLockPct(0); setCaptured(img);
  }, []);
  captureRef.current = doCapture;

  // ── quality coach loop ─────────────────────────────────────────
  useEffect(() => {
    if (!open || captured || camError) return;
    let raf = 0, stopped = false, lastT = 0;
    armAtRef.current = performance.now() + REARM_MS;

    const analyze = () => {
      const video = videoRef.current, r = guideRect();
      if (!video || !r || video.readyState < 2) return;
      let cv = sampleCanvasRef.current; if (!cv) { cv = document.createElement('canvas'); sampleCanvasRef.current = cv; }
      cv.width = SAMPLE_W; cv.height = SAMPLE_H;
      const ctx = cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null; if (!ctx) return;
      ctx.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, SAMPLE_W, SAMPLE_H);
      const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
      const n = SAMPLE_W * SAMPLE_H; const lum = new Float32Array(n);
      let sL = 0, sL2 = 0, sR = 0, sG = 0, sB = 0;
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const r = data[i], gg = data[i + 1], b = data[i + 2];
        sR += r; sG += gg; sB += b;
        const l = 0.299 * r + 0.587 * gg + 0.114 * b; lum[p] = l; sL += l; sL2 += l * l;
      }
      const meanLuma = sL / n;
      const redness = (sR / n) / (((sG / n) + (sB / n)) / 2 + 1);
      const contrast = Math.sqrt(Math.max(0, sL2 / n - meanLuma * meanLuma));
      let ls = 0, ls2 = 0, lc = 0;
      for (let y = 1; y < SAMPLE_H - 1; y++) for (let x = 1; x < SAMPLE_W - 1; x++) {
        const i = y * SAMPLE_W + x; const L = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - SAMPLE_W] - lum[i + SAMPLE_W];
        ls += L; ls2 += L * L; lc++;
      }
      const sharp = Math.max(0, ls2 / lc - (ls / lc) * (ls / lc));
      const fingerPresent = redness >= Q.rednessMin && meanLuma >= Q.noFingerLuma;

      let state: GState;
      if (!fingerPresent) state = 'no_finger';        // no red fingertip → never auto-captures
      else if (meanLuma < Q.darkLuma) state = 'dark';
      else if (meanLuma > Q.brightLuma) state = 'bright';
      else if (sharp < Q.sharpMin) state = 'blurry';
      else if (contrast < Q.detailMin) state = 'low_detail';
      else state = 'good';

      setG(state);
      setQuality({
        light: fingerPresent && meanLuma >= Q.darkLuma && meanLuma <= Q.brightLuma,
        focus: fingerPresent && sharp >= Q.sharpMin,
        detail: fingerPresent && contrast >= Q.detailMin,
      });

      if (state === 'good') {
        if (!goodSinceRef.current) goodSinceRef.current = performance.now();
        const pct = Math.min(1, (performance.now() - goodSinceRef.current) / LOCK_MS);
        setLockPct(pct);
        if (performance.now() - goodSinceRef.current >= LOCK_MS && performance.now() >= armAtRef.current && !submitting) {
          goodSinceRef.current = 0; setLockPct(0); captureRef.current();
        }
      } else { goodSinceRef.current = 0; setLockPct(0); }
    };

    const loop = (t: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(loop);
      if (t - lastT < TICK_MS) return;
      lastT = t;
      try { analyze(); } catch { /* skip bad frame */ }
    };
    raf = requestAnimationFrame(loop);
    return () => { stopped = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, captured, camError]);

  // ── submit ─────────────────────────────────────────────────────
  const extractHint = (err: any): string => {
    const data = err?.response?.data;
    if (data?.hints?.length) return data.hints.map((h: any) => h.message).join(' · ');
    return data?.error || 'Could not process the fingerprint.';
  };
  const handleSubmit = async () => {
    if (!captured) return;
    setSubmitting(true); setHint(null);
    const fingers: FingerCapture[] = [{ position: 'index', image: captured }];
    try {
      if (mode === 'register') {
        const res: any = await fingerprintApi.register(fingers);
        const stored = res.stored?.length ?? 0;
        if (stored === 0) throw { response: { data: { hints: res.failed?.[0]?.hints } } };
        const count = res.templates_count ?? samples + 1;
        setSamples(count);
        onRegistered?.({ templatesCount: count, enrolledPositions: res.enrolled_positions ?? [] });
        toast.success(`Fingerprint sample ${count} saved`);
        setCaptured(null);
      } else { await onVerify?.(fingers); onClose(); }
    } catch (err: any) { setHint(extractHint(err)); setCaptured(null); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;
  const gc = GUIDE[g];
  const chips: { label: string; ok: boolean; icon: typeof Sun }[] = [
    { label: 'Lighting', ok: quality.light, icon: Sun },
    { label: 'Focus', ok: quality.focus, icon: Focus },
    { label: 'Ridge detail', ok: quality.detail, icon: Waves },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Fingerprint size={20} className="text-emerald-600" />
            {mode === 'register' ? 'Register Fingerprint' : 'Fingerprint Check-in'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {camError ? (
            <div className="aspect-[3/4] bg-gray-900 rounded-xl flex flex-col items-center justify-center text-white gap-3 p-6">
              <p className="text-sm text-gray-300 text-center">{camError}</p>
              <button onClick={() => { setCamError(null); onClose(); }} className="px-4 py-2 bg-emerald-600 rounded-lg text-sm font-medium">Close</button>
            </div>
          ) : (
            <div ref={containerRef} className="relative aspect-[3/4] bg-gray-900 rounded-xl overflow-hidden">
              {/* Video stays MOUNTED the whole time — the captured preview is overlaid,
                  not swapped in. Unmounting the <video> detaches the camera stream, so
                  the next sample's capture read videoWidth=0 => "camera not ready". */}
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {!captured && (
                <>
                  {/* Guide region */}
                  <div className="absolute rounded-[2rem] pointer-events-none transition-[border-color,box-shadow] duration-150"
                    style={{ left: `${GX * 100}%`, top: `${GY * 100}%`, width: `${GW * 100}%`, height: `${GH * 100}%`,
                      border: `3px solid ${gc.color}`, boxShadow: g === 'good' ? `0 0 0 9999px rgba(0,0,0,.28), 0 0 ${12 + lockPct * 20}px ${gc.color}aa` : '0 0 0 9999px rgba(0,0,0,.28)' }} />
                  {/* Status pill */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/65 backdrop-blur-sm">
                    <span className="w-2 h-2 rounded-full" style={{ background: gc.color }} />
                    <span className="text-xs font-medium text-white whitespace-nowrap">{gc.msg}</span>
                  </div>
                  {lockPct > 0 && <div className="absolute bottom-0 left-0 h-1 bg-emerald-400 z-10 transition-[width] duration-100" style={{ width: `${lockPct * 100}%` }} />}
                  {torchSupported && (
                    <button onClick={toggleTorch} title="Toggle flash"
                      className={`absolute top-3 right-3 z-10 p-2 rounded-full ${torchOn ? 'bg-yellow-400 text-gray-900' : 'bg-black/50 text-white'}`}>
                      {torchOn ? <Zap size={18} /> : <ZapOff size={18} />}
                    </button>
                  )}
                </>
              )}
              {captured && (
                <img src={captured} alt="Captured fingerprint" className="absolute inset-0 w-full h-full object-contain bg-black" />
              )}
            </div>
          )}

          {!captured && !camError && (
            <div className="grid grid-cols-3 gap-2">
              {chips.map(({ label, ok, icon: Ci }) => (
                <div key={label} className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                  <Ci size={14} /> {label}
                </div>
              ))}
            </div>
          )}

          {hint && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2.5 text-sm flex items-start gap-2">
              <Info size={15} className="mt-0.5 shrink-0" /><span>{hint}</span>
            </div>
          )}
          {mode === 'register' && samples > 0 && !captured && (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 size={15} />
              {samples} sample{samples > 1 ? 's' : ''} saved{samples < 3 ? ` — add ${3 - samples} more for best accuracy` : ' — ready'}
            </div>
          )}

          <p className="text-xs text-gray-500">
            Press <strong>one fingertip</strong> flat against (or 1–2 cm from) your phone's <strong>rear camera</strong> with the
            <strong> flash on</strong>, so the ridge lines fill the box and look sharp. It captures itself once the box turns green.
            {mode === 'register' ? ' Add ~3 samples of the same finger.' : ''}
          </p>

          <div className="flex justify-end gap-2">
            {captured ? (
              <>
                <button onClick={() => { setCaptured(null); setHint(null); }} disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                  <RotateCcw size={15} /> Retake
                </button>
                <button onClick={handleSubmit} disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                  {submitting ? <Loader2 size={15} className="animate-spin" /> : <Fingerprint size={15} />}
                  {mode === 'register' ? 'Save Sample' : 'Verify & Mark'}
                </button>
              </>
            ) : (
              <>
                {mode === 'register' && samples > 0 && (
                  <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Done</button>
                )}
                <button onClick={doCapture} disabled={!!camError}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                  <Camera size={15} /> Capture now
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
