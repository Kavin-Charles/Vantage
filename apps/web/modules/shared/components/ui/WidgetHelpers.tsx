'use client';

import Link from 'next/link';

export function WidgetSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ height: 36, background: 'var(--surface2)', borderRadius: 6 }} />
      <div style={{ height: 120, background: 'var(--surface2)', borderRadius: 6, opacity: 0.6 }} />
    </div>
  );
}

export function WidgetError({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
      <span style={{ fontSize: 13, color: 'var(--text3)' }}>Failed to load</span>
      <button
        onClick={onRetry}
        style={{ fontSize: 12, color: 'var(--text2)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}
      >
        Retry
      </button>
    </div>
  );
}

export function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--text)', fontFamily: 'var(--font-display)' }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        {label}
      </span>
    </div>
  );
}

export function EmptyState({ href, label }: { href: string; label: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Link
        href={href}
        style={{ fontSize: 13, color: 'var(--text3)', textDecoration: 'none', padding: '8px 16px', border: '1px dashed var(--border)', borderRadius: 8 }}
      >
        + {label}
      </Link>
    </div>
  );
}
