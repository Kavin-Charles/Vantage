'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export function AlertBar() {
  const { data } = useQuery({
    queryKey: ['alerts', 'active'],
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/api/alerts?resolved=false&severity=critical,warning&limit=3`,
        { credentials: 'include' },
      );
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const alerts: Array<{ id: string; severity: string; message: string }> = data?.data ?? [];
  if (!alerts.length) return null;

  return (
    <div style={{
      background: 'var(--amber-bg)',
      borderBottom: '1px solid var(--border)',
      padding: '8px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 13,
    }}>
      <span style={{ color: 'var(--amber)', fontWeight: 600 }}>
        ⚠ {alerts.length} alert{alerts.length > 1 ? 's' : ''}
      </span>
      <span style={{ color: 'var(--text2)' }}>
        {alerts[0]?.message}
        {alerts.length > 1 && ` +${alerts.length - 1} more`}
      </span>
      <Link href="/alerts" style={{ marginLeft: 'auto', fontWeight: 500, color: 'var(--amber)', textDecoration: 'underline' }}>
        View alerts →
      </Link>
    </div>
  );
}
