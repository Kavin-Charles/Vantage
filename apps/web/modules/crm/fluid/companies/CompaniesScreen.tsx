'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  PageHeader, FluidInput, FluidChip, FluidTable, FluidBadge, MetricPill, EmptyState,
  type FluidColumn,
} from '@/modules/shared/fluid/ui';
import { listCompanies } from '@/modules/crm/companies/lib/companies';
import type { Company } from '@vencore/types';

interface Row extends Company {
  /** Returned per-row by the API; not part of the persisted Company shape. */
  size_band?: 'startup' | 'smb' | 'mid' | 'enterprise';
}

const VIEWS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'enterprise', label: 'Enterprise' },
  { id: 'startup', label: 'Startup' },
  { id: 'partner', label: 'Partner' },
];

const SIZE_LABEL: Record<NonNullable<Row['size_band']>, string> = {
  startup: 'Startup',
  smb: 'SMB',
  mid: 'Mid-Market',
  enterprise: 'Enterprise',
};

function statusTone(status: Company['status']): 'blue' | 'gold' | 'red' {
  switch (status) {
    case 'active':
      return 'blue';
    case 'prospect':
      return 'gold';
    case 'churned':
      return 'red';
  }
}

export function CompaniesScreen() {
  const router = useRouter();
  const getToken = useApiToken();

  const [view, setView] = useState('all');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((v: string) => {
    setQ(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(v), 300);
  }, []);

  const params: Record<string, string> = {};
  if (debouncedQ) params.search = debouncedQ;
  if (view !== 'all') params.view = view;

  const { data, isLoading } = useQuery({
    queryKey: ['companies', params],
    queryFn: async () => listCompanies(await getToken(), params),
  });

  const rows: Row[] = (data?.data ?? []) as Row[];
  const total = data?.total ?? rows.length;

  const columns: FluidColumn<Row>[] = [
    {
      key: 'name',
      header: 'Company Name',
      render: r => <span style={{ fontWeight: 600 }}>{r.name}</span>,
    },
    { key: 'industry', header: 'Industry', render: r => r.industry ?? '—' },
    {
      key: 'size',
      header: 'Size',
      render: r => (
        <div>
          <div>{r.size_band ? SIZE_LABEL[r.size_band] : '—'}</div>
          {r.employee_count != null ? (
            <div style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)' }}>{r.employee_count} employees</div>
          ) : null}
        </div>
      ),
    },
    { key: 'location', header: 'Location', render: r => r.location ?? '—' },
    {
      key: 'status',
      header: 'Status',
      render: r => <FluidBadge tone={statusTone(r.status)}>{r.status}</FluidBadge>,
    },
    {
      key: 'revenue',
      header: 'Annual Revenue',
      render: r => (r.annual_revenue != null ? `$${r.annual_revenue.toLocaleString()}` : '—'),
    },
  ];

  return (
    <>
      <PageHeader
        title="Companies"
        subtitle={`${total} company records tracked`}
        actions={<MetricPill icon="apartment" label="Companies" value={String(total)} trend="tracked" />}
      />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, width: 320 }}>
        <FluidInput value={q} onChange={handleSearch} placeholder="Search companies…" icon="search" />
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {VIEWS.map(v => (
          <FluidChip key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
            {v.label}
          </FluidChip>
        ))}
      </div>
      {!isLoading && rows.length === 0 ? (
        <EmptyState
          icon="apartment"
          title="No companies found"
          message={debouncedQ || view !== 'all' ? 'Try a different search or view.' : 'Add your first company to get started.'}
        />
      ) : (
        <FluidTable
          columns={columns}
          rows={rows}
          rowKey={r => r.id}
          onRowClick={r => router.push(`/crm/companies/${r.id}`)}
        />
      )}
    </>
  );
}
