'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listPipelines, createPipeline, deletePipeline } from '@/modules/pipeline/lib/pipelines';
import { listRecordTypes } from '@/modules/pipeline/lib/record-types';
import { PipelineEditor } from '@/modules/pipeline/components/PipelineEditor';
import type { PipelineWithDetails } from '@vencore/types';

export default function PipelinesSettingsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { ask: askConfirm, el: confirmEl } = useConfirm();
  const [newName, setNewName] = useState('');
  const [newTypeId, setNewTypeId] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });
  const { data: typesData } = useQuery({
    queryKey: ['record-types'],
    queryFn: async () => listRecordTypes(await getToken()),
  });

  const pipelines: PipelineWithDetails[] = data?.data ?? [];
  const recordTypes = typesData?.data ?? [];

  const createMut = useMutation({
    mutationFn: async () => createPipeline(await getToken(), { name: newName.trim(), record_type_id: newTypeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipelines'] });
      setCreating(false);
      setNewName('');
      setNewTypeId('');
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deletePipeline(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  });

  return (
    <div style={{ padding: '32px 40px', maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 24, color: 'var(--text)', margin: 0 }}>
          Pipelines
        </h1>
        <button
          onClick={() => setCreating(true)}
          style={{
            padding: '8px 16px', background: 'var(--text)', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif', fontSize: 14,
          }}
        >+ New pipeline</button>
      </div>

      {creating && (
        <div style={{
          padding: 16, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Pipeline name"
              style={{
                flex: 1, padding: '8px 12px', border: '1px solid var(--border)',
                borderRadius: 8, fontFamily: 'DM Sans, sans-serif', fontSize: 14,
              }}
            />
            <select
              value={newTypeId}
              onChange={e => setNewTypeId(e.target.value)}
              style={{
                padding: '8px 12px', border: '1px solid var(--border)',
                borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans, sans-serif',
              }}
            >
              <option value="">Record type…</option>
              {recordTypes.map(rt => (
                <option key={rt.id} value={rt.id}>{rt.icon ?? '📋'} {rt.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => createMut.mutate()}
              disabled={!newName.trim() || !newTypeId || createMut.isPending}
              style={{
                padding: '8px 16px', background: 'var(--text)', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14,
              }}
            >Create</button>
            <button
              onClick={() => { setCreating(false); setNewName(''); setNewTypeId(''); }}
              style={{
                padding: '8px 16px', background: 'none',
                border: '1px solid var(--border)', borderRadius: 8,
                cursor: 'pointer', fontSize: 14, color: 'var(--text2)',
              }}
            >Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pipelines.map(p => (
          <div key={p.id} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
            >
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 500, fontSize: 15, flex: 1, color: 'var(--text)' }}>
                {p.name}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif' }}>
                {p.record_type?.name} · {p.stages.length} stages
              </span>
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>{expanded === p.id ? '▲' : '▼'}</span>
            </div>
            {expanded === p.id && (
              <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                <div style={{ marginTop: 16 }}>
                  <PipelineEditor pipelineId={p.id} />
                </div>
                <button
                  onClick={() => askConfirm({ title: 'Delete pipeline', message: `Delete pipeline "${p.name}"? All stages and records will be lost.`, confirmLabel: 'Delete', variant: 'danger', onConfirm: () => deleteMut.mutate(p.id) })}
                  style={{
                    marginTop: 16, padding: '6px 12px',
                    background: 'var(--red-bg)', color: 'var(--red)',
                    border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >Delete pipeline</button>
              </div>
            )}
          </div>
        ))}
        {pipelines.length === 0 && !creating && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif' }}>
            No pipelines yet. Create your first pipeline above.
          </div>
        )}
      </div>
      {confirmEl}
    </div>
  );
}
