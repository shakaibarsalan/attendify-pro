import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Drop-in replacement for useState that persists the value to sessionStorage
 * (per browser tab), so a half-filled form survives the user navigating away
 * and coming back (e.g. leaving to create a missing department, then returning).
 *
 * - Restores the saved draft on mount, merged over `initial` so newly added
 *   fields still get sensible defaults.
 * - Ignores drafts older than `ttlMs` (default 30 min).
 * - Call the returned `clearDraft()` after a successful submit to drop it.
 *
 * Returns the same tuple shape as useState, plus `clearDraft`.
 */
export function usePersistentForm<T extends object>(
  key: string,
  initial: T,
  ttlMs = 30 * 60 * 1000,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const storageKey = `attendify_draft_${key}`;

  const [state, setState] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.v && Date.now() - parsed.t < ttlMs) {
          return { ...initial, ...parsed.v };
        }
      }
    } catch { /* ignore corrupt/blocked storage */ }
    return initial;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ t: Date.now(), v: state }));
    } catch { /* ignore quota/blocked storage */ }
  }, [state, storageKey]);

  const clearDraft = () => {
    try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
  };

  return [state, setState, clearDraft];
}
