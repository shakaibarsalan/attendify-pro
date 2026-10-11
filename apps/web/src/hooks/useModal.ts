import { useState, useEffect, useCallback } from 'react';

interface UseModalOptions {
  initialValue?: boolean;
}

export function useModal(options: UseModalOptions = {}) {
  const { initialValue = false } = options;
  const [isOpen, setIsOpen] = useState(initialValue);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, close]);

  return { isOpen, open, close, toggle, setIsOpen };
}
