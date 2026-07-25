'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCompanyOverview } from '@/modules/crm/fluid/lib/useCompanyOverview';
import { PageHeader, GlassCard, FluidBadge, FluidButton, MetricPill, EmptyState, MSIcon } from '@/modules/shared/fluid/ui';
import { FluidPanelSlot } from '@/modules/shared/fluid/host/FluidPanelSlot';
import { CompanyFormModal } from './CompanyFormModal';

export function CompanyDetailScreen({ id }: { id: string }) {
  const { data, isLoading, error, refetch } = useCompanyOverview(id);
  const [editing, setEditing] = useState(false);

  if (isLoading) return <EmptyState icon="hourglass_empty" title="Loading…" />;
  if (error || !data) {
    return <EmptyState icon="error" title="Could not load company" message="Try again shortly." />;
  }

  const { company, contacts, deals, tasks, metrics } = data;
  const money = (n: number) => `$${n.toLocaleString()}`;

  return (
    <>
      <PageHeader
        title={company.name}
        subtitle={company.industry ?? 'Company'}
        actions={(
          <FluidButton variant="ghost" icon="edit" onClick={() => setEditing(true)}>Edit</FluidButton>
        )}
      />
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <MetricPill icon="payments" label="Total Deal Value" value={money(metrics.total_deal_value)} />
        <MetricPill icon="account_tree" label="Open Deals" value={String(metrics.open_deal_count)} />
        <MetricPill icon="group" label="Contacts" value={String(metrics.contact_count)} />
        <MetricPill
          icon="timer"
          label="Last Activity"
          value={metrics.last_activity_at ? new Date(metrics.last_activity_at).toLocaleDateString() : '—'}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <GlassCard>
          <h3 style={{ marginTop: 0, fontFamily: 'var(--fl-font-display)' }}>Contacts</h3>
          {contacts.length === 0 ? (
            <EmptyState icon="group" title="No contacts" />
          ) : (
            contacts.map(c => (
              <Link
                key={c.id}
                href={`/crm/contacts/${c.id}`}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                  padding: '12px 0', borderTop: '1px solid var(--fl-outline-variant)', color: 'inherit', textDecoration: 'none',
                }}
              >
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                <span style={{ fontSize: 14, color: 'var(--fl-on-surface-variant)' }}>{c.email}</span>
              </Link>
            ))
          )}
        </GlassCard>
        <GlassCard>
          <h3 style={{ marginTop: 0, fontFamily: 'var(--fl-font-display)' }}>Detailed Information</h3>
          <div style={{ fontSize: 14 }}>Industry: {company.industry ?? '—'}</div>
          <div style={{ fontSize: 14 }}>Location: {company.location ?? '—'}</div>
          <div style={{ fontSize: 14 }}>Website: {company.website ?? '—'}</div>
          <div style={{ fontSize: 14 }}>Employees: {company.employee_count ?? '—'}</div>
        </GlassCard>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginTop: 24 }}>
        <GlassCard>
          <h3 style={{ marginTop: 0, fontFamily: 'var(--fl-font-display)' }}>Deals</h3>
          {deals.length === 0 ? (
            <EmptyState icon="account_tree" title="No linked deals" />
          ) : (
            deals.map(d => (
              <div
                key={d.id}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--fl-outline-variant)' }}
              >
                <span style={{ fontWeight: 600 }}>{d.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span>{money(d.value)}</span>
                  {d.stage ? <FluidBadge tone="blue">{d.stage}</FluidBadge> : null}
                </div>
              </div>
            ))
          )}
        </GlassCard>
        <GlassCard>
          <h3 style={{ marginTop: 0, fontFamily: 'var(--fl-font-display)' }}>Tasks</h3>
          {tasks.length === 0 ? (
            <EmptyState icon="checklist" title="No tasks yet" />
          ) : (
            tasks.map(t => (
              <div
                key={t.id}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--fl-outline-variant)' }}
              >
                <MSIcon
                  name={t.status === 'done' ? 'check_circle' : 'radio_button_unchecked'}
                  size={18}
                  style={{ color: t.status === 'done' ? 'var(--fl-primary)' : 'var(--fl-on-surface-variant)' }}
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      textDecoration: t.status === 'done' ? 'line-through' : 'none',
                      color: t.status === 'done' ? 'var(--fl-on-surface-variant)' : 'var(--fl-on-surface)',
                    }}
                  >
                    {t.title}
                  </div>
                  {t.due_date ? (
                    <div style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)' }}>
                      Due {new Date(t.due_date).toLocaleDateString()}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </GlassCard>
      </div>
      <div style={{ marginTop: 24 }}>
        <FluidPanelSlot recordType="company" recordId={id} />
      </div>
      <CompanyFormModal
        open={editing}
        mode="edit"
        initial={company}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); void refetch(); }}
      />
    </>
  );
}
