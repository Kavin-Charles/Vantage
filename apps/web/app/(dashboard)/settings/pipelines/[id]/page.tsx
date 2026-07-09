'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getPipeline } from '@/modules/pipeline/lib/pipelines';
import { GeneralTab } from '@/modules/pipeline/components/settings/GeneralTab';
import { StagesTab } from '@/modules/pipeline/components/settings/StagesTab';
import { FieldsTab } from '@/modules/pipeline/components/settings/FieldsTab';

type Tab = 'general' | 'stages' | 'fields';

const TABS: { key: Tab; label: string; badge?: (stageCount: number, fieldCount: number) => number }[] = [
  { key: 'general', label: 'General' },
  { key: 'stages', label: 'Stages', badge: (s) => s },
  { key: 'fields', label: 'Fields', badge: (_, f) => f },
];

export default function PipelineConfigPage() {
  const { id } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const [tab, setTab] = useState<Tab>('general');

  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['pipeline', id],
    queryFn: async () => getPipeline(await getToken(), id),
  });

  if (isLoading) {
    return (
      <div style={{ padding: 48, color: 'var(--text3)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div style={{ padding: 48, color: 'var(--text3)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
        Pipeline not found.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, padding: '32px 0' }}>
      {/* Back link */}
      <Link
        href="/settings/pipelines"
        style={{
          fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-sans)',
          textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
          gap: 4, marginBottom: 20, transition: 'color .15s ease',
        }}
        onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = 'var(--text2)'; }}
        onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = 'var(--text3)'; }}
      >
        ← Pipelines
      </Link>

      <h1 style={{
        fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600,
        letterSpacing: '-0.4px', color: 'var(--text)', margin: '0 0 4px',
      }}>
        {pipeline.name}
      </h1>
      {pipeline.description && (
        <p style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--font-sans)', margin: '0 0 4px', lineHeight: 1.5 }}>
          {pipeline.description}
        </p>
      )}
      <p style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--font-sans)', margin: '0 0 28px' }}>
        Configure stages, fields, and settings for this pipeline.
      </p>

      {pipeline.stages.length === 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', borderRadius: 12, marginBottom: 20,
          background: 'var(--amber-bg, #fef3c7)', border: '1px solid var(--amber, #92400e)',
        }}>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--amber, #92400e)', fontFamily: 'var(--font-sans)' }}>
            <strong>No stages configured.</strong> Records cannot be added until this pipeline has at least one stage. Create stages first, then add fields.
          </div>
          {tab !== 'stages' && (
            <button
              onClick={() => setTab('stages')}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'var(--amber, #92400e)', color: '#fff',
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
              }}
            >
              Create stages
            </button>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 28 }}>
        {TABS.map(t => {
          const badgeCount = t.badge?.(pipeline.stages.length, pipeline.fields.length);
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontFamily: 'var(--font-sans)',
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--text)' : 'var(--text3)',
                borderBottom: active ? '2px solid var(--text)' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color .15s ease, border-color .15s ease',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text2)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text3)'; }}
            >
              {t.label}
              {badgeCount !== undefined && (
                <span style={{
                  marginLeft: 6, fontSize: 11, color: 'var(--text3)',
                  background: 'var(--surface2)', borderRadius: 999,
                  padding: '1px 6px', fontWeight: 400,
                  transition: 'background .15s ease',
                }}>
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ animation: 'ctx-in .15s ease' }} key={tab}>
        {tab === 'general' && <GeneralTab pipeline={pipeline} />}
        {tab === 'stages'  && <StagesTab  pipeline={pipeline} />}
        {tab === 'fields'  && <FieldsTab  pipeline={pipeline} />}
      </div>
    </div>
  );
}
