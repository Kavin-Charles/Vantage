'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type ConversionTemplate,
  type RawFieldMapping,
} from '@/modules/pipeline/lib/conversions';
import { TemplateFieldMapper, type MappableField } from '@/modules/pipeline/components/TemplateFieldMapper';

interface RecordType {
  id: string;
  name: string;
  icon: string;
}

interface RecordTypeField {
  id: string;
  label: string;
  field_type: string;
}

interface PipelineStage { id: string; name: string; }
interface Pipeline { id: string; name: string; record_type_id: string | null; stages?: PipelineStage[]; }

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  const json = await res.json() as { data: T };
  return json.data;
}

type Step = 'list' | 'step1' | 'step2' | 'step3';

interface DraftTemplate {
  id?: string; // present when editing
  name: string;
  source_type_id: string;
  target_type_id: string;
  target_pipeline_id: string;
  target_stage_id: string;
  field_mappings: RawFieldMapping[];
}

const EMPTY_DRAFT: DraftTemplate = {
  name: '',
  source_type_id: '',
  target_type_id: '',
  target_pipeline_id: '',
  target_stage_id: '',
  field_mappings: [],
};

export default function ConversionsSettingsPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('list');
  const [draft, setDraft] = useState<DraftTemplate>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  const { data: templates = [] } = useQuery<ConversionTemplate[]>({
    queryKey: ['conversion-templates'],
    queryFn: () => listTemplates(),
  });

  const { data: recordTypes = [] } = useQuery<RecordType[]>({
    queryKey: ['record-types'],
    queryFn: () => fetchJson('/record-types'),
  });

  // Use a distinct queryKey to avoid cache-shape collision with the pipeline page
  // (which stores { data: Pipeline[] } via listPipelines, not Pipeline[]).
  const { data: pipelines = [] } = useQuery<Pipeline[]>({
    queryKey: ['conversions-pipelines'],
    queryFn: () => fetchJson<Pipeline[]>('/pipelines'),
  });

  // Fetch fields for source and target types when on step 3
  const { data: sourceFields = [] } = useQuery<RecordTypeField[]>({
    queryKey: ['record-type-fields', draft.source_type_id],
    queryFn: () => fetchJson(`/record-types/${draft.source_type_id}/fields`),
    enabled: !!draft.source_type_id && step === 'step3',
  });

  const { data: targetFields = [] } = useQuery<RecordTypeField[]>({
    queryKey: ['record-type-fields', draft.target_type_id],
    queryFn: () => fetchJson(`/record-types/${draft.target_type_id}/fields`),
    enabled: !!draft.target_type_id && step === 'step3',
  });

  const targetPipelines = pipelines.filter(p => p.record_type_id === draft.target_type_id);

  // For stage list, fetch pipeline with stages when pipeline is selected
  const { data: pipelineWithStages } = useQuery<{ stages: PipelineStage[] }>({
    queryKey: ['pipeline', draft.target_pipeline_id],
    queryFn: () => fetchJson(`/pipelines/${draft.target_pipeline_id}`),
    enabled: !!draft.target_pipeline_id,
  });
  const targetStages = pipelineWithStages?.stages ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: draft.name,
        source_type_id: draft.source_type_id,
        target_type_id: draft.target_type_id,
        target_pipeline_id: draft.target_pipeline_id,
        target_stage_id: draft.target_stage_id,
        field_mappings: draft.field_mappings,
      };
      if (draft.id) {
        return updateTemplate(draft.id, body);
      }
      return createTemplate(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversion-templates'] });
      setStep('list');
      setDraft(EMPTY_DRAFT);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['conversion-templates'] }),
  });

  async function startEdit(tpl: ConversionTemplate) {
    const full = await getTemplate(tpl.id).catch(() => null);
    setDraft({
      id: tpl.id,
      name: tpl.name,
      source_type_id: tpl.source_type_id,
      target_type_id: tpl.target_type_id,
      target_pipeline_id: tpl.target_pipeline_id,
      target_stage_id: tpl.target_stage_id,
      field_mappings: (full?.field_mappings ?? []).map(m => ({
        source_field_id: m.source_field_id,
        source_builtin: m.source_builtin,
        target_field_id: m.target_field_id,
        target_builtin: m.target_builtin,
      })),
    });
    setStep('step1');
  }

  function typeName(id: string) {
    return recordTypes.find(rt => rt.id === id)?.name ?? id;
  }
  function pipelineName(id: string) {
    return pipelines.find(p => p.id === id)?.name ?? id;
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 6,
    padding: '8px 10px', fontSize: 13, fontFamily: 'var(--font-sans)',
    boxSizing: 'border-box', background: '#fff',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text3)',
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
  };
  const btnPrimary: React.CSSProperties = {
    background: 'var(--text, #1a1814)', color: '#fff', border: 'none',
    borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13,
  };
  const btnSecondary: React.CSSProperties = {
    background: 'none', border: '1px solid var(--border)',
    borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13,
  };

  if (step === 'list') {
    return (
      <div style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: 0 }}>Conversion Templates</h2>
            <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>
              Define how records convert between types (e.g. Enquiry → Quote).
            </p>
          </div>
          <button onClick={() => { setDraft(EMPTY_DRAFT); setStep('step1'); }} style={btnPrimary}>
            + New Template
          </button>
        </div>

        {templates.length === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
            No templates yet. Create one to enable record conversion.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(tpl => (
            <div key={tpl.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{tpl.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text3)' }}>
                  {typeName(tpl.source_type_id)} → {typeName(tpl.target_type_id)}
                  {' · '}{pipelineName(tpl.target_pipeline_id)}
                </p>
              </div>
              <button onClick={() => void startEdit(tpl)} style={btnSecondary}>Edit</button>
              <button
                onClick={() => { if (confirm('Delete this template?')) deleteMutation.mutate(tpl.id); }}
                style={{ ...btnSecondary, color: 'var(--red, #991b1b)', borderColor: 'var(--red, #991b1b)' }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step === 'step1') {
    // Step 1: Name + source/target type selection
    return (
      <div style={{ maxWidth: 480 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '0 0 4px' }}>
          {draft.id ? 'Edit Template' : 'New Template'} — Step 1 of 3
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>Choose source and target record types.</p>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Template Name</label>
          <input
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Enquiry → Quote"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Source Record Type</label>
          <select value={draft.source_type_id} onChange={e => setDraft(d => ({ ...d, source_type_id: e.target.value }))} style={inputStyle}>
            <option value="">— select —</option>
            {recordTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.icon} {rt.name}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Target Record Type</label>
          <select value={draft.target_type_id} onChange={e => setDraft(d => ({ ...d, target_type_id: e.target.value, target_pipeline_id: '', target_stage_id: '' }))} style={inputStyle}>
            <option value="">— select —</option>
            {recordTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.icon} {rt.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setStep('list'); setDraft(EMPTY_DRAFT); }} style={btnSecondary}>Cancel</button>
          <button
            onClick={() => {
              if (!draft.name.trim() || !draft.source_type_id || !draft.target_type_id) {
                setError('Please fill in all fields');
                return;
              }
              setError(null);
              setStep('step2');
            }}
            style={btnPrimary}
          >
            Next →
          </button>
        </div>
        {error && <p style={{ color: 'var(--red, #991b1b)', fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  if (step === 'step2') {
    // Step 2: Target pipeline + stage
    return (
      <div style={{ maxWidth: 480 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '0 0 4px' }}>
          {draft.name} — Step 2 of 3
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>
          Choose where converted records land.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Target Pipeline</label>
          <select
            value={draft.target_pipeline_id}
            onChange={e => setDraft(d => ({ ...d, target_pipeline_id: e.target.value, target_stage_id: '' }))}
            style={inputStyle}
          >
            <option value="">— select —</option>
            {targetPipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {targetPipelines.length === 0 && draft.target_type_id && (
            <p style={{ fontSize: 12, color: 'var(--amber, #92400e)', marginTop: 4 }}>
              No pipelines linked to this record type. Link one in Settings → Pipelines.
            </p>
          )}
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Target Stage</label>
          <select
            value={draft.target_stage_id}
            onChange={e => setDraft(d => ({ ...d, target_stage_id: e.target.value }))}
            style={inputStyle}
            disabled={!draft.target_pipeline_id}
          >
            <option value="">— select —</option>
            {targetStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setStep('step1')} style={btnSecondary}>← Back</button>
          <button
            onClick={() => {
              if (!draft.target_pipeline_id || !draft.target_stage_id) {
                setError('Select a pipeline and stage');
                return;
              }
              setError(null);
              setStep('step3');
            }}
            style={btnPrimary}
          >
            Next →
          </button>
        </div>
        {error && <p style={{ color: 'var(--red, #991b1b)', fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  // Step 3: Field mapping
  const sourceMappable: MappableField[] = sourceFields.map(f => ({ id: f.id, label: f.label }));
  const targetMappable: MappableField[] = targetFields.map(f => ({ id: f.id, label: f.label }));

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '0 0 4px' }}>
        {draft.name} — Step 3 of 3
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>
        Map fields from source to target (optional). Built-in fields include name, contact, company, owner.
      </p>

      <TemplateFieldMapper
        sourceFields={sourceMappable}
        targetFields={targetMappable}
        mappings={draft.field_mappings}
        onChange={mappings => setDraft(d => ({ ...d, field_mappings: mappings }))}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <button onClick={() => setStep('step2')} style={btnSecondary}>← Back</button>
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} style={btnPrimary}>
          {saveMutation.isPending ? 'Saving…' : draft.id ? 'Save Changes' : 'Create Template'}
        </button>
      </div>
      {error && <p style={{ color: 'var(--red, #991b1b)', fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  );
}
