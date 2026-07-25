'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getPipeline } from '@/modules/crm/pipeline/lib/pipelines';
import { GlassCard, PillTabs, PageHeader } from '@/modules/shared/fluid/ui';
import { StagesTab } from './StagesTab';
import { FieldsTab } from './FieldsTab';
import { GeneralTab } from './GeneralTab';

type Tab = 'stages' | 'fields' | 'general';

const TABS: { id: Tab; label: string }[] = [
  { id: 'stages', label: 'Stages' },
  { id: 'fields', label: 'Fields' },
  { id: 'general', label: 'General' },
];

interface Props {
  pipelineId: string;
}

export function PipelineSettingsScreen({ pipelineId }: Props) {
  const getToken = useApiToken();
  const [tab, setTab] = useState<Tab>('stages');

  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId),
  });

  if (isLoading || !pipeline) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--fl-on-surface-variant)', fontFamily: 'var(--fl-font-body)' }}>
        Loading…
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={pipeline.name}
        subtitle="Configure stages, fields, and settings for this pipeline."
      />
      <div style={{ marginBottom: 24 }}>
        <PillTabs tabs={TABS} active={tab} onChange={id => setTab(id as Tab)} />
      </div>
      <GlassCard>
        {tab === 'stages' && <StagesTab pipeline={pipeline} />}
        {tab === 'fields' && <FieldsTab pipeline={pipeline} />}
        {tab === 'general' && <GeneralTab pipeline={pipeline} />}
      </GlassCard>
    </div>
  );
}
