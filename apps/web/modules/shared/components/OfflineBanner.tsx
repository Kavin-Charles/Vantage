'use client';
import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [reconnected, setReconnected] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onOffline = () => {
      clearTimeout(timer);
      setOffline(true);
      setReconnected(false);
    };
    const onOnline = () => {
      setOffline(false);
      setReconnected(true);
      timer = setTimeout(() => setReconnected(false), 3000);
    };
    setOffline(!navigator.onLine);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (!offline && !reconnected) return null;

  return (
    <div
      role="status"
      data-testid="offline-banner"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 18px',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        background: offline ? 'var(--red-bg, #fee2e2)' : 'var(--green-bg, #d8f3dc)',
        color: offline ? 'var(--red, #991b1b)' : 'var(--green, #2d6a4f)',
        border: `1px solid ${offline ? 'var(--red, #991b1b)' : 'var(--green, #2d6a4f)'}`,
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: offline ? 'var(--red, #991b1b)' : 'var(--green, #2d6a4f)',
      }} />
      {offline
        ? 'No internet connection. Changes may not be saved.'
        : 'Back online.'}
    </div>
  );
}
