'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Icon } from './Icon';

type ToastType = 'success' | 'error';
type ToastItem = { id: number; type: ToastType; message: string };

type ToastContextValue = {
  showToast: (type: ToastType, message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const ACCENT: Record<ToastType, { border: string; icon: string; color: string }> = {
  success: { border: 'var(--green)', icon: 'check', color: 'var(--green)' },
  error:   { border: 'var(--red)',   icon: 'x',     color: 'var(--red)' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{
        position: 'fixed', top: 20, right: 20, zIndex: 1000,
        display: 'flex', flexDirection: 'column', gap: 8, width: 320,
      }}>
        {toasts.map(t => (
          <div
            key={t.id}
            role="status"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '12px 14px', borderRadius: 10,
              background: 'var(--surface)', boxShadow: 'var(--shadow-modal)',
              borderLeft: `3px solid ${ACCENT[t.type].border}`,
              border: '1px solid var(--border)',
              borderLeftWidth: 3,
              animation: 'toastIn .2s ease both',
            }}
          >
            <Icon name={ACCENT[t.type].icon} size={16} color={ACCENT[t.type].color} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 2, flexShrink: 0 }}
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
