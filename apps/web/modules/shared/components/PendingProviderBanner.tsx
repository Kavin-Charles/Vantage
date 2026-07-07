'use client';

/**
 * Global banner shown to admins while any contract group has a pending
 * provider selection (a plugin that can power a data category was installed
 * and the admin has not chosen the active provider yet).
 */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getMe } from '@vencore/api-client';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface ProviderGroup {
  group: string;
  label: string;
  status: 'active' | 'pending_selection';
  pending_candidate: { id: string; name: string } | null;
}

export function PendingProviderBanner() {
  const getToken = useApiToken();

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: async () => getMe(await getToken()),
  });
  const isAdmin = me?.data.user.role === 'admin';

  const { data } = useQuery({
    queryKey: ['hub-providers'],
    queryFn: async () => {
      const res = await apiFetch<{ data: ProviderGroup[]; error: null }>(
        '/api/settings/hub-providers',
        { token: await getToken() },
      );
      return res.data ?? [];
    },
    enabled: isAdmin,
    refetchInterval: 120_000,
  });

  const pending = (data ?? []).filter((g) => g.status === 'pending_selection');
  if (!isAdmin || pending.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '8px 20px', background: 'var(--amber-bg)', borderBottom: '1px solid var(--amber)',
        fontSize: 12.5, color: 'var(--amber)',
      }}
    >
      <span>
        {pending.map((g) =>
          `${g.pending_candidate?.name ?? 'A new provider'} can power your ${g.label} data`,
        ).join(' · ')}
        {' — choose which provider is active.'}
      </span>
      <Link
        href="/settings/data-providers"
        style={{
          flexShrink: 0, fontSize: 12, fontWeight: 600, color: 'var(--amber)',
          textDecoration: 'underline',
        }}
      >
        Choose provider →
      </Link>
    </div>
  );
}
