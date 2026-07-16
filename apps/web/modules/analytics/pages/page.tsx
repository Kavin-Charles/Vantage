'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '@/modules/shared/components/Topbar';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { usePluginRegistry } from '@/modules/shared/contexts/PluginRuntimeContext';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import {
  getAnalyticsSections,
  type Period,
  type ResolvedAnalyticsSection,
} from '@/modules/analytics/lib/analytics';
import { ANALYTICS_SECTION_COMPONENTS } from '../sections/registry';

const PERIODS: { label: string; value: Period }[] = [
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: '12M', value: '12m' },
];

function SectionRenderer({ section, period }: { section: ResolvedAnalyticsSection; period: Period }) {
  const { registry } = usePluginRegistry();

  if (section.kind === 'builtin') {
    const Component = ANALYTICS_SECTION_COMPONENTS[section.id];
    if (!Component) return null;
    return <Component period={period} />;
  }

  // Plugin section — same fallback path as SlotOutlet
  const def = registry.sections.get(`${section.plugin_id}:${section.id}`);
  if (!def) return null;
  const PluginComponent = def.component;
  return <PluginComponent />;
}

export default function AnalyticsPage() {
  const getToken = useApiToken();
  const [period, setPeriod] = useState<Period>('30d');

  const { data: sectionsData, isLoading } = useQuery({
    queryKey: ['analytics-sections'],
    queryFn: async () => getAnalyticsSections(await getToken()),
  });

  const sections = sectionsData?.data ?? [];
  const overview = sections.filter(s => s.slot_id === 'overview');
  const panels = sections.filter(s => s.slot_id === 'panels');

  const periodToggle = (
    <div style={{ display: 'flex', gap: 3, background: 'var(--surface2)', borderRadius: 'var(--radius-md)', padding: 3 }}>
      {PERIODS.map(p => (
        <button
          key={p.value}
          onClick={() => setPeriod(p.value)}
          style={{
            padding: '4px 14px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            background: period === p.value ? 'var(--surface)' : 'transparent',
            color: period === p.value ? 'var(--text)' : 'var(--text2)',
            boxShadow: period === p.value ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
            transition: 'all .15s',
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  return (
    <ModuleGuard moduleId="analytics">
      <Topbar action={periodToggle} />

      <div style={{ padding: 24 }}>
        {!isLoading && sections.length === 0 && (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '48px 24px',
              textAlign: 'center',
              color: 'var(--text2)',
              fontSize: 13,
            }}
          >
            No analytics sources enabled — enable a module to see analytics here.
          </div>
        )}

        {overview.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(overview.length, 3)}, 1fr)`,
              gap: 16,
              marginBottom: 16,
            }}
          >
            {overview.map(s => (
              <SectionRenderer key={`${s.plugin_id}:${s.id}`} section={s} period={period} />
            ))}
          </div>
        )}

        {panels.map(s => (
          <SectionRenderer key={`${s.plugin_id}:${s.id}`} section={s} period={period} />
        ))}
      </div>
    </ModuleGuard>
  );
}
