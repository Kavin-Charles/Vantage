'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { updatePipeline } from '@/modules/crm/pipeline/lib/pipelines';
import type { Pipeline } from '@/modules/crm/pipeline/lib/pipelines';
import { FluidInput, FluidButton, MSIcon } from '@/modules/shared/fluid/ui';

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 8, fontFamily: 'var(--fl-font-body)',
  fontSize: 13, fontWeight: 600, color: 'var(--fl-on-surface-variant)',
};

export function GeneralTab({ pipeline }: { pipeline: Pipeline }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const router = useRouter();

  const [name, setName] = useState(pipeline.name);
  const [description, setDescription] = useState(pipeline.description ?? '');
  const [saved, setSaved] = useState(false);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['pipeline', pipeline.id] });
    void qc.invalidateQueries({ queryKey: ['pipelines'] });
  };

  const updateMut = useMutation({
    mutationFn: async (body: { name?: string; description?: string; is_default?: boolean }) =>
      updatePipeline(await getToken(), pipeline.id, body),
    onSuccess: () => {
      invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  function saveAll() {
    const body: { name?: string; description?: string } = {};
    const trimmedName = name.trim();
    if (trimmedName && trimmedName !== pipeline.name) body.name = trimmedName;
    if (description !== (pipeline.description ?? '')) body.description = description;
    if (Object.keys(body).length > 0) updateMut.mutate(body);
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Pipeline name</label>
        <FluidInput value={name} onChange={setName} placeholder="Pipeline name" />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="What is this pipeline used for?"
          style={{
            width: '100%', padding: '12px 16px', resize: 'vertical', boxSizing: 'border-box',
            borderRadius: 'var(--fl-radius-input)', fontFamily: 'var(--fl-font-body)', fontSize: 15,
            color: 'var(--fl-on-surface)', background: 'var(--fl-surface-container-lowest)',
            border: '1px solid var(--fl-outline-variant)', outline: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <FluidButton onClick={saveAll} icon="save" disabled={updateMut.isPending}>
          {updateMut.isPending ? 'Saving…' : 'Save changes'}
        </FluidButton>
        {saved && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--fl-font-body)', fontSize: 13, color: 'var(--fl-primary)' }}>
            <MSIcon name="check_circle" size={16} /> Saved
          </span>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 18px',
        border: '1px solid var(--fl-outline-variant)', borderRadius: 'var(--fl-radius-input)',
        background: 'var(--fl-surface-container-lowest)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--fl-font-body)', color: 'var(--fl-on-surface)', marginBottom: 2 }}>
            Default pipeline
          </div>
          <div style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)', fontFamily: 'var(--fl-font-body)' }}>
            New workspaces start with this pipeline active
          </div>
        </div>
        <FluidButton
          variant={pipeline.is_default ? 'ghost' : 'primary'}
          disabled={pipeline.is_default || updateMut.isPending}
          onClick={() => updateMut.mutate({ is_default: true })}
        >
          {pipeline.is_default ? 'Default' : 'Set as default'}
        </FluidButton>
      </div>

      <div style={{ marginTop: 24 }}>
        <FluidButton variant="ghost" onClick={() => router.push('/settings/pipelines')}>
          Back to pipelines
        </FluidButton>
      </div>
    </div>
  );
}
