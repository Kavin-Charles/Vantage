'use client';

import React from 'react';

const COLOR: Record<string, string> = {
  healthy: 'var(--green)',
  online:  'var(--green)',
  degraded: 'var(--amber)',
  offline: 'var(--red)',
};

export function PulseDot({ status }: { status: string }) {
  const color = COLOR[status] ?? 'var(--text3)';
  const animate = status === 'healthy' || status === 'online';
  return (
    <>
      <style>{`
        @keyframes db-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.4); }
        }
      `}</style>
      <span style={{
        display: 'inline-block',
        width: 7, height: 7,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        animation: animate ? 'db-pulse 2s ease-in-out infinite' : 'none',
      }} />
    </>
  );
}
