'use client';

import Link from 'next/link';
import { Icon } from '@/modules/shared/components/ui/Icon';

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

export function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
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

export function EmptyState({ href, label, icon }: { href: string; label: string; icon?: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {icon && <Icon name={icon} size={24} color="var(--text3)" />}
      <Link
        href={href}
        style={{ fontSize: 13, color: 'var(--text3)', textDecoration: 'none', padding: '8px 16px', border: '1px dashed var(--border)', borderRadius: 8 }}
      >
        + {label}
      </Link>
    </div>
  );
}

export function WidgetHeader({ label, href }: { label: string; href: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <Link href={href} style={{ fontSize: 11, color: 'var(--text3)', textDecoration: 'none' }}>
        View all →
      </Link>
    </div>
  );
}

export function MiniBar({ value, max, color = 'var(--green)' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 2, flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  );
}

export function relativeTime(value: Date | string): string {
  const diff = Date.now() - new Date(value).getTime();
  const day = 86_400_000;
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function StatusDot({ status }: { status: 'online' | 'healthy' | 'degraded' | 'offline' | 'stopped' | string }) {
  const color = (status === 'online' || status === 'healthy')
    ? 'var(--green)'
    : (status === 'degraded')
      ? 'var(--amber)'
      : 'var(--red)';
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />;
}
