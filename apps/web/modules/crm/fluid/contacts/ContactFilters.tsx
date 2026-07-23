'use client';

import { FluidChip } from '@/modules/shared/fluid/ui';

const VIEWS = [
  { id: 'all', label: 'All Contacts' },
  { id: 'active_deals', label: 'Active Deals' },
  { id: 'leads', label: 'Leads' },
  { id: 'dormant', label: 'Dormant' },
];

export function ContactFilters({
  active, onChange,
}: {
  active: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      {VIEWS.map(v => (
        <FluidChip key={v.id} active={active === v.id} onClick={() => onChange(v.id)}>
          {v.label}
        </FluidChip>
      ))}
    </div>
  );
}
