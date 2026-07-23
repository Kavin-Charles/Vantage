'use client';
import { useState } from 'react';
import {
  PageHeader, FluidButton, GlassCard, FluidBadge, FluidChip, MetricPill,
  FluidInput, PillTabs, Avatar, FluidModal, FluidTable, EmptyState,
} from '@/modules/shared/fluid/ui';

export default function ProbePage() {
  const [tab, setTab] = useState('a');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Fluid Probe" subtitle="Foundation smoke test" actions={<FluidButton icon="add" onClick={() => setOpen(true)}>Add</FluidButton>} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <MetricPill icon="account_balance_wallet" label="Revenue" value="$1,980,130" trend="+11% week" />
        <FluidBadge tone="blue">Active</FluidBadge>
        <FluidBadge tone="gold">Lead</FluidBadge>
        <FluidBadge tone="red">Churned</FluidBadge>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <FluidChip active>All</FluidChip><FluidChip>Active Deals</FluidChip><FluidChip>Leads</FluidChip>
      </div>
      <div style={{ maxWidth: 360, marginBottom: 24 }}><FluidInput value={q} onChange={setQ} placeholder="Find…" icon="search" /></div>
      <PillTabs tabs={[{ id: 'a', label: 'General' }, { id: 'b', label: 'Hooks' }]} active={tab} onChange={setTab} />
      <div style={{ marginTop: 24 }}>
        <GlassCard>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Avatar name="Julianne Davis" /> Julianne Davis</div>
        </GlassCard>
      </div>
      <div style={{ marginTop: 24 }}>
        <FluidTable
          columns={[
            { key: 'name', header: 'Name', render: (r: { name: string; status: string }) => r.name },
            { key: 'status', header: 'Status', render: (r) => <FluidBadge tone="blue">{r.status}</FluidBadge> },
          ]}
          rows={[{ name: 'Julianne Davis', status: 'Active' }, { name: 'Marcus Thorne', status: 'Lead' }]}
          rowKey={r => r.name}
        />
      </div>
      <div style={{ marginTop: 24 }}><EmptyState icon="inbox" title="Nothing here" message="Empty-state sample" /></div>
      <FluidModal open={open} onClose={() => setOpen(false)} title="Add New Contact" subtitle="Sample modal">
        <FluidInput value="" onChange={() => {}} placeholder="Name" />
      </FluidModal>
    </>
  );
}
