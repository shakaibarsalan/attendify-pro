import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { sessionsApi } from '@/lib/api';
import { X, RefreshCw, QrCode, Clock, ExternalLink, Minimize2 } from 'lucide-react';
import QRCode from 'qrcode';

interface Props {
  sessionId: string;
  courseName: string;
  lectureNumber?: number | string;
  onClose: () => void;
}

export default function QRDisplayModal({ sessionId, courseName, lectureNumber, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isRotating, setIsRotating] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5);
  const [error, setError] = useState('');
  const intervalSecondsRef = useRef(5);
  const failRef = useRef(0);
  // Popped-out floating window (Document Picture-in-Picture → always-on-top; falls
  // back to a normal popup window where PiP isn't supported).
  const [popWindow, setPopWindow] = useState<Window | null>(null);
  const popWindowRef = useRef<Window | null>(null);

  const fetchAndRender = useCallback(async () => {
    try {
      const data: any = await sessionsApi.getQrCurrent(sessionId);
      const iv = data.intervalSeconds || 5;
      intervalSecondsRef.current = iv;
      setIsRotating(!data.static && iv > 0);
      setTimeLeft(iv); // restart the countdown for the freshly-fetched token

      // Encode a deep-link URL (not just the raw token) so the QR can be scanned by
      // Google Lens / any camera app, not only the in-app scanner. Scanning opens
      // the student attendance flow carrying this short-lived 'presence key'.
      const attendUrl = `${window.location.origin}/student/attend/${sessionId}?qr=${encodeURIComponent(data.token)}`;
      const dataUrl = await QRCode.toDataURL(attendUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#111827', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
      setQrDataUrl(dataUrl);
      setError('');
      failRef.current = 0;
    } catch {
      // A single network blip must NOT blank a working QR or stop the rotation.
      // Keep the last QR on screen and only surface the hard error after several
      // consecutive misses (~ a session that genuinely ended).
      failRef.current += 1;
      if (failRef.current >= 4) setError('Failed to load QR code. Session may have ended.');
    }
  }, [sessionId]);

  // ONE always-on 1s ticker drives the plain-text countdown AND refetches a fresh
  // token when it elapses. Never gated on isRotating/error, so a transient failure
  // can't permanently stop the rotation.
  useEffect(() => {
    fetchAndRender();
    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { fetchAndRender(); return intervalSecondsRef.current; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [fetchAndRender]);

  const retry = () => { failRef.current = 0; setError(''); fetchAndRender(); };

  // Detach the QR into a floating, always-on-top window. Uses the Document
  // Picture-in-Picture API (Chrome/Edge) so it stays above slides/other apps;
  // where that's unavailable, opens a normal popup so it at least pops out.
  const openPopout = async () => {
    try {
      const anyWin = window as any;
      let win: Window | null = null;
      if (anyWin.documentPictureInPicture?.requestWindow) {
        win = await anyWin.documentPictureInPicture.requestWindow({ width: 360, height: 470 });
      } else {
        win = window.open('', 'attendify-qr', 'width=360,height=480,menubar=no,toolbar=no,location=no,status=no');
      }
      if (!win) return; // popup blocked / prompt dismissed
      win.document.title = `Attendance QR — ${courseName}`;
      win.document.body.style.margin = '0';
      win.addEventListener('pagehide', () => setPopWindow(null));
      popWindowRef.current = win;
      setPopWindow(win);
    } catch { /* user dismissed the PiP prompt */ }
  };

  const closePopout = () => {
    try { popWindowRef.current?.close(); } catch { /* already gone */ }
    popWindowRef.current = null;
    setPopWindow(null);
  };

  // If the modal itself is closed/unmounted, take the floating window with it —
  // the QR is generated here, so it must not outlive this component.
  useEffect(() => () => { try { popWindowRef.current?.close(); } catch { /* noop */ } }, []);

  // Content rendered INTO the floating window (inline styles so it renders without
  // depending on the parent document's stylesheets).
  const poppedContent = (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#ffffff', padding: 20, fontFamily: 'system-ui, -apple-system, sans-serif', boxSizing: 'border-box' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>{courseName}</div>
        {lectureNumber ? <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Lecture #{lectureNumber}</div> : null}
      </div>
      {qrDataUrl
        ? <img src={qrDataUrl} alt="Attendance QR" style={{ width: 300, height: 300, borderRadius: 12 }} />
        : <div style={{ width: 300, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>}
      {isRotating ? <div style={{ fontSize: 14, color: '#374151' }}>Refreshes in {timeLeft}s</div> : null}
      <div style={{ fontSize: 12, color: '#9ca3af' }}>Scan with the Attendify app</div>
    </div>
  );

  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <QrCode size={20} className="text-primary-600" />
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">{courseName}</h3>
              {lectureNumber && (
                <p className="text-xs text-gray-500">Lecture #{lectureNumber}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center gap-4">
          {error ? (
            <div className="text-center py-8">
              <p className="text-red-500 text-sm mb-3">{error}</p>
              <button onClick={retry} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg">
                <RefreshCw size={16} /> Retry
              </button>
            </div>
          ) : popWindow ? (
            <div className="text-center py-8 px-2">
              <div className="w-14 h-14 mx-auto rounded-full bg-primary-50 text-primary-600 flex items-center justify-center mb-3">
                <ExternalLink size={26} />
              </div>
              <p className="text-sm font-semibold text-gray-900">QR is in a floating window</p>
              <p className="text-xs text-gray-500 mt-1">It stays on top of other windows — switch to your slides or any app and students can still scan it.</p>
              <button onClick={closePopout} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
                <Minimize2 size={15} /> Bring back into window
              </button>
            </div>
          ) : qrDataUrl ? (
            <>
              <img src={qrDataUrl} alt="Attendance QR Code" className="rounded-xl" style={{ width: 260, height: 260 }} />

              {isRotating && (
                <p className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Clock size={14} /> Refreshes in {timeLeft}s
                </p>
              )}

              <p className="text-xs text-gray-400 text-center">
                Ask students to scan this QR code with their Attendify app
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={openPopout}
                  title="Open the QR in a floating window that stays on top of other apps"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-lg border border-primary-200 transition-colors"
                >
                  <ExternalLink size={13} /> Pop out (stays on top)
                </button>
                <button
                  onClick={fetchAndRender}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary-600 px-3 py-1.5 rounded-lg hover:bg-primary-50 border border-gray-200 transition-colors"
                >
                  <RefreshCw size={12} /> Refresh QR
                </button>
              </div>
            </>
          ) : (
            <div className="w-64 h-64 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>

      {popWindow && createPortal(poppedContent, popWindow.document.body)}
    </>
  );
}
