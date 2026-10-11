import { useRef, useEffect, useState, forwardRef, useImperativeHandle, useCallback } from 'react';

interface WebcamWithOverlayProps {
  onFrame?: (imageSrc: string) => void;
  mirrored?: boolean;
  deviceId?: string;
  children?: React.ReactNode;
}

export interface WebcamWithOverlayRef {
  getScreenshot: () => string | null;
}

const WebcamWithOverlay = forwardRef<WebcamWithOverlayRef, WebcamWithOverlayProps>(
  function WebcamWithOverlay({ onFrame, mirrored = true, deviceId, children }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [cameraReady, setCameraReady] = useState(false);

    const getScreenshotFn = useCallback((): string | null => {
      const video = videoRef.current;
      if (!video || !cameraReady) return null;
      const canvas = document.createElement('canvas');
      const maxDim = 320;
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const scale = maxDim / Math.max(vw, vh);
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      if (mirrored) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.6);
    }, [cameraReady, mirrored]);

    useImperativeHandle(ref, () => ({ getScreenshot: getScreenshotFn }));

    useEffect(() => {
      let cancelled = false;
      let acquiredStream: MediaStream | null = null;

      async function startCamera() {
        try {
          // Prefer a portrait frame so faces are easier to align (helps a lot on
          // phones; desktop webcams that only do landscape are cropped to the
          // portrait display box anyway).
          const videoBase: MediaTrackConstraints = {
            width: { ideal: 720 },
            height: { ideal: 960 },
            facingMode: 'user',
          };
          const constraints: MediaStreamConstraints = deviceId
            ? { video: { ...videoBase, deviceId: { exact: deviceId } }, audio: false }
            : { video: videoBase, audio: false };

          const stream = await navigator.mediaDevices.getUserMedia(constraints);

          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

          acquiredStream = stream;
          streamRef.current = stream;

          const video = videoRef.current;
          if (!video) return;
          video.srcObject = stream;
          await video.play();
          if (!cancelled) setCameraReady(true);
        } catch (err: any) {
          if (cancelled) return;
          const msg = String(err?.message || err || 'Unknown error');
          if (msg.includes('NotAllowed') || msg.includes('Permission')) {
            setCameraError('Camera permission denied. Allow camera in browser settings, then retry.');
          } else if (msg.includes('NotFound')) {
            setCameraError('No camera detected. Connect a camera and retry.');
          } else if (msg.includes('Timeout') || msg.includes('NotReadable') || msg.includes('Abort')) {
            setCameraError('Camera could not start. Try a different camera or close other apps using it.');
          } else {
            setCameraError('Camera error: ' + msg);
          }
        }
      }

      startCamera();
      return () => {
        cancelled = true;
        if (acquiredStream) acquiredStream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };
    }, [deviceId]);

    useEffect(() => {
      if (!onFrame || !cameraReady) return;
      const interval = setInterval(() => {
        const src = getScreenshotFn();
        if (src) onFrame(src);
      }, 200);
      return () => clearInterval(interval);
    }, [onFrame, cameraReady, getScreenshotFn]);

    if (cameraError) {
      return (
        <div className="relative w-full h-full overflow-hidden bg-gray-900 flex flex-col items-center justify-center text-white gap-3 p-6">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <p className="text-sm text-gray-300 text-center">{cameraError}</p>
          <button
            onClick={() => { setCameraError(null); setCameraReady(false); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry Camera
          </button>
        </div>
      );
    }

    return (
      <div className="relative w-full h-full overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
        />
        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
        {children}
      </div>
    );
  }
);

WebcamWithOverlay.displayName = 'WebcamWithOverlay';

export default WebcamWithOverlay;
