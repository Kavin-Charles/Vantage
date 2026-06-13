'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  listRecordTypes, createRecordType,
  listConversions, createConversion, deleteConversion,
} from '@/modules/pipeline/lib/record-types';
import { listPipelines } from '@/modules/pipeline/lib/pipelines';
import { RecordTypeEditor } from '@/modules/pipeline/components/RecordTypeEditor';
import { FieldMappingEditor } from '@/modules/pipeline/components/FieldMappingEditor';
import type { RecordType, ConversionFieldMapping, PipelineWithDetails } from '@vencore/types';

type Tab = 'fields' | 'conversions';

export default function RecordTypesPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Record<string, Tab>>({});
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const { data } = useQuery({
    queryKey: ['record-types'],
    queryFn: async () => listRecordTypes(await getToken()),
  });
  const { data: pipelinesData } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });

  const types: RecordType[] = data?.data ?? [];
  const pipelines: PipelineWithDetails[] = pipelinesData?.data ?? [];

  const createMut = useMutation({
    mutationFn: async () => createRecordType(await getToken(), { name: newName.trim() }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['record-types'] });
      setCreating(false);
      setNewName('');
      setExpanded(res.data.id);
    },
  });

  function tab(id: string): Tab { return tabs[id] ?? 'fields'; }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 24, color: 'var(--text)', margin: 0 }}>
          Record Types
        </h1>
        <button
          onClick={() => setCreating(true)}
          style={{
            padding: '8px 16px', background: 'var(--text)', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif', fontSize: 14,
          }}
        >+ New type</button>
      </div>

      {creating && (
        <div style={{
          padding: 16, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16,
        }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) createMut.mutate(); if (e.key === 'Escape') setCreating(false); }}
            placeholder="Type name (e.g. Lead, Support Ticket)"
            style={{
              width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
              borderRadius: 8, fontFamily: 'DM Sans, sans-serif', fontSize: 14,
              marginBottom: 12, boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => createMut.mutate()}
              disabled={!newName.trim() || createMut.isPending}
              style={{
                padding: '8px 16px', background: 'var(--text)', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14,
              }}
            >Create</button>
            <button
              onClick={() => setCreating(false)}
              style={{
                padding: '8px 16px', background: 'none', border: '1px solid var(--border)',
                borderRadius: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text2)',
              }}
            >Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {types.map(rt => (
          <div key={rt.id} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}
              onClick={() => setExpanded(expanded === rt.id ? null : rt.id)}
            >
              <span style={{ fontSize: 18 }}>{rt.icon ?? '📋'}</span>
              <span style={{ flex: 1, fontFamily: 'DM Sans, sans-serif', fontWeight: 500, fontSize: 15, color: 'var(--text)' }}>
                {rt.name}
              </span>
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>{expanded === rt.id ? '▲' : '▼'}</span>
            </div>
            {expanded === rt.id && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                  {(['fields', 'conversions'] as Tab[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setTabs(prev => ({ ...prev, [rt.id]: t }))}
                      style={{
                        padding: '10px 20px', background: 'none', border: 'none',
                        cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                        borderBottom: tab(rt.id) === t ? '2px solid var(--text)' : '2px solid transparent',
                        color: tab(rt.id) === t ? 'var(--text)' : 'var(--text2)',
                        marginBottom: -1,
                      }}
                    >
                      {t === 'fields' ? 'Fields' : 'Converts to →'}
                    </button>
                  ))}
                </div>
                <div style={{ padding: 16 }}>
                  {tab(rt.id) === 'fields' && <RecordTypeEditor recordTypeId={rt.id} />}
                  {tab(rt.id) === 'conversions' && (
                    <ConversionsSection typeId={rt.id} types={types} pipelines={pipelines} />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConversionsSection({
  typeId, types, pipelines,
}: { typeId: string; types: RecordType[]; pipelines: PipelineWithDetails[] }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', target_type_id: '', target_pipeline_id: '', target_stage_id: '' });
  const [mappings, setMappings] = useState<Partial<ConversionFieldMapping>[]>([]);

  const { data } = useQuery({
    queryKey: ['conversions', typeId],
    queryFn: async () => listConversions(await getToken(), typeId),
  });
  const conversions = data?.data ?? [];

  const createMut = useMutation({
    mutationFn: async () => createConversion(await getToken(), typeId, { ...form, field_mappings: mappings }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversions', typeId] });
      setAdding(false);
      setMappings([]);
      setForm({ name: '', target_type_id: '', target_pipeline_id: '', target_stage_id: '' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (tid: string) => deleteConversion(await getToken(), typeId, tid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversions', typeId] }),
  });

  const targetPipeline = pipelines.find(p => p.id === form.target_pipeline_id);
  const targetStages = targetPipeline?.stages ?? [];

  return (
    <div>
      {conversions.map(c => (
        <div key={c.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 0', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ flex: 1, fontSize: 14, fontFamily: 'DM Sans, sans-serif', color: 'var(--text)' }}>
            {c.name}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif' }}>
            → {types.find(t => t.id === c.target_type_id)?.name ?? 'Unknown'}
          </span>
          <button
            onClick={() => { if (window.confirm(`Delete "${c.name}"?`)) deleteMut.mutate(c.id); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18 }}
          >×</button>
        </div>
      ))}

      {adding ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            autoFocus
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Template name"
            style={{
              padding: '8px 12px', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans, sans-serif',
            }}
          />
          <select
            value={form.target_type_id}
            onChange={e => setForm(f => ({ ...f, target_type_id: e.target.value }))}
            style={{
              padding: '8px 12px', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans, sans-serif',
            }}
          >
            <option value="">Target record type…</option>
            {types.filter(t => t.id !== typeId).map(t => (
              <option key={t.id} value={t.id}>{t.icon ?? '📋'} {t.name}</option>
            ))}
          </select>
          <select
            value={form.target_pipeline_id}
            onChange={e => setForm(f => ({ ...f, target_pipeline_id: e.target.value, target_stage_id: '' }))}
            style={{
              padding: '8px 12px', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans, sans-serif',
            }}
          >
            <option value="">Target pipeline…</option>
            {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={form.target_stage_id}
            onChange={e => setForm(f => ({ ...f, target_stage_id: e.target.value }))}
            style={{
              padding: '8px 12px', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans, sans-serif',
            }}
          >
            <option value="">Initial stage…</option>
            {targetStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {form.target_type_id && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif', marginBottom: 8 }}>
                Field mappings
              </div>
              <FieldMappingEditor
                sourceTypeId={typeId}
                targetTypeId={form.target_type_id}
                value={mappings}
                onChange={setMappings}
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => createMut.mutate()}
              disabled={!form.name || !form.target_type_id || !form.target_pipeline_id || !form.target_stage_id || createMut.isPending}
              style={{
                padding: '8px 16px', background: 'var(--text)', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                fontFamily: 'DM Sans, sans-serif',
              }}
            >Save</button>
            <button
              onClick={() => setAdding(false)}
              style={{
                padding: '8px 16px', background: 'none',
                border: '1px solid var(--border)', borderRadius: 8,
                cursor: 'pointer', fontSize: 13, color: 'var(--text2)',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            marginTop: 8, padding: '8px 0', background: 'none',
            border: 'none', cursor: 'pointer', color: 'var(--blue)',
            fontSize: 13, fontFamily: 'DM Sans, sans-serif',
          }}
        >+ Add conversion</button>
      )}
    </div>
  );
}
