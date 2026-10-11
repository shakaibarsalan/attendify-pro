import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void | Promise<void>;
}

/**
 * Branded, accessible confirmation dialog — a drop-in replacement for the native
 * window.confirm() (which renders an ugly "attendify.pro says…" browser popup).
 * The parent holds a `ConfirmState | null` and passes it in; null hides it.
 */
export default function ConfirmDialog({ state, onClose }: { state: ConfirmState | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const danger = state.tone === 'danger';

  const run = async () => {
    setBusy(true);
    try { await state.onConfirm(); } finally { setBusy(false); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg shrink-0 ${danger ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-600'}`}>
              <AlertTriangle size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900">{state.title}</h3>
              <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{state.message}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={18} /></button>
          </div>
          <div className="flex justify-end gap-3 mt-5">
            <button onClick={onClose} disabled={busy}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button onClick={run} disabled={busy}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'}`}>
              {busy ? 'Working…' : (state.confirmLabel || 'Confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
