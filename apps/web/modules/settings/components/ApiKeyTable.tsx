'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listApiKeys, deleteApiKey } from '@/modules/shared/lib/api-keys';
import {
  PageHeader, FluidTable, FluidButton, FluidBadge, EmptyState, type FluidColumn,
} from '@/modules/shared/fluid/ui';
import type { ApiKey } from '@vencore/types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface Props {
  onCreateClick: () => void;
}

export function ApiKeyTable({ onCreateClick }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => listApiKeys(await getToken()),
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => deleteApiKey(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  const keys: ApiKey[] = data?.data ?? [];

  const columns: FluidColumn<ApiKey>[] = [
    {
      key: 'name',
      header: 'Name',
      render: k => <span style={{ fontWeight: 600, color: 'var(--fl-on-surface)' }}>{k.name}</span>,
    },
    {
      key: 'prefix',
      header: 'Prefix',
      render: k => (
        <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>
          {k.prefix}…
        </span>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      width: 120,
      render: k => (
        <FluidBadge tone={k.scope === 'read_write' ? 'gold' : 'blue'}>
          {k.scope === 'read_write' ? 'read+write' : 'read'}
        </FluidBadge>
      ),
    },
    {
      key: 'last_used',
      header: 'Last used',
      render: k => (
        <span style={{ color: 'var(--fl-on-surface-variant)' }}>
          {k.last_used_at ? formatDate(k.last_used_at) : '—'}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: k => <span style={{ color: 'var(--fl-on-surface-variant)' }}>{formatDate(k.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 100,
      render: k => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={e => { e.stopPropagation(); revokeMut.mutate(k.id); }}
            disabled={revokeMut.isPending}
            style={{
              fontFamily: 'var(--fl-font-body)', fontSize: 13, fontWeight: 600, color: 'var(--fl-error)',
              background: 'none', border: 'none', cursor: revokeMut.isPending ? 'not-allowed' : 'pointer',
              opacity: revokeMut.isPending ? 0.5 : 1,
            }}
          >
            Revoke
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="API Keys"
        subtitle="Use API keys to access Vencore from external tools and scripts."
        actions={<FluidButton icon="add" onClick={onCreateClick}>Create API Key</FluidButton>}
      />

      {isLoading ? (
        <EmptyState icon="hourglass_empty" title="Loading…" />
      ) : keys.length === 0 ? (
        <EmptyState icon="vpn_key" title="No API keys yet" message="Create one to get started." />
      ) : (
        <FluidTable columns={columns} rows={keys} rowKey={k => k.id} />
      )}
    </>
  );
}
