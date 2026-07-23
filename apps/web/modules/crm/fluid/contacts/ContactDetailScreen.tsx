'use client';

import { useContactOverview } from '@/modules/crm/fluid/lib/useContactOverview';
import { PageHeader, FluidButton, GlassCard, MetricPill, Avatar, EmptyState, MSIcon } from '@/modules/shared/fluid/ui';
import { FluidPanelSlot } from '@/modules/shared/fluid/host/FluidPanelSlot';

export function ContactDetailScreen({ id }: { id: string }) {
  const { data, isLoading, error } = useContactOverview(id);

  if (isLoading) return <EmptyState icon="hourglass_empty" title="Loading…" />;
  if (error || !data) {
    return <EmptyState icon="error" title="Could not load contact" message="Try again shortly." />;
  }

  const { contact, metrics, activities, stage_funnel } = data;
  const money = (n: number) => `$${n.toLocaleString()}`;

  return (
    <>
      <PageHeader
        title={contact.name}
        subtitle={contact.title ?? 'Contact'}
        actions={
          <>
            <FluidButton variant="ghost" icon="edit">Edit</FluidButton>
            <FluidButton variant="ghost" icon="mail">Email</FluidButton>
            <FluidButton icon="add">Add Task</FluidButton>
          </>
        }
      />
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <MetricPill icon="payments" label="Total Deal Value" value={money(metrics.total_deal_value)} />
        <MetricPill icon="forum" label="Interactions" value={String(metrics.interaction_count)} />
        <MetricPill icon="account_tree" label="Pipeline Stage" value={metrics.current_stage ?? '—'} />
        <MetricPill
          icon="timer"
          label="Last Contact"
          value={metrics.last_contact_at ? new Date(metrics.last_contact_at).toLocaleDateString() : '—'}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <GlassCard>
          <h3 style={{ marginTop: 0, fontFamily: 'var(--fl-font-display)' }}>Interaction History</h3>
          {activities.length === 0 ? (
            <EmptyState icon="history" title="No interactions yet" />
          ) : (
            activities.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: '1px solid var(--fl-outline-variant)' }}>
                <MSIcon name="handshake" size={20} />
                <div>
                  <div style={{ fontWeight: 600 }}>{a.body ?? a.type}</div>
                  <div style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)' }}>
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </GlassCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <GlassCard>
            <h3 style={{ marginTop: 0, fontFamily: 'var(--fl-font-display)' }}>Stage Funnel</h3>
            {stage_funnel.map(s => (
              <div key={s.stage} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span>{s.stage}</span>
                <span style={{ fontWeight: 600 }}>{money(s.total)}</span>
              </div>
            ))}
          </GlassCard>
          <GlassCard>
            <h3 style={{ marginTop: 0, fontFamily: 'var(--fl-font-display)' }}>Detailed Information</h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <Avatar name={contact.name} src={contact.avatar_url} /> {contact.name}
            </div>
            <div style={{ fontSize: 14 }}>Email: {contact.email}</div>
            <div style={{ fontSize: 14 }}>Phone: {contact.phone ?? '—'}</div>
          </GlassCard>
        </div>
      </div>
      <div style={{ marginTop: 24 }}>
        <FluidPanelSlot recordType="contact" recordId={id} />
      </div>
    </>
  );
}
