'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/FormField';
import {
  listPipelines,
  getPipeline,
  createPipeline,
  updatePipeline,
  deletePipeline,
  createStage,
  updateStage,
  deleteStage,
  createField,
  deleteField,
} from '@/lib/pipelines';
import type { Pipeline, PipelineWithStages, StageField } from '@vantage/types';

const FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const;

function StageFieldRow({
  field,
  stageId,
  onDelete,
}: {
  field: StageField;
  stageId: string;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 0',
        borderBottom: '1px solid var(--border)',
        fontSize: 13,
      }}
    >
      <span style={{ flex: 1, color: 'var(--text)' }}>{field.label}</span>
      <span
        style={{
          fontSize: 11,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '1px 6px',
          color: 'var(--text2)',
        }}
      >
        {field.field_type}
      </span>
      {field.required && (
        <span style={{ fontSize: 11, color: '#ef4444' }}>required</span>
      )}
      <button
        onClick={onDelete}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text3)',
          fontSize: 16,
          lineHeight: 1,
        }}
        title="Delete field"
      >
        ×
      </button>
    </div>
  );
}

function AddFieldForm({
  stageId,
  onAdded,
}: {
  stageId: string;
  onAdded: () => void;
}) {
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<string>('text');
  const [required, setRequired] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setLoading(true);
    try {
      await createField(stageId, { label: label.trim(), field_type: fieldType, required });
      setLabel('');
      setRequired(false);
      onAdded();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Input
        required
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="Field label"
        style={{ flex: '1 1 140px', minWidth: 0 }}
      />
      <select
        value={fieldType}
        onChange={e => setFieldType(e.target.value)}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '6px 8px',
          fontSize: 13,
          color: 'var(--text)',
        }}
      >
        {FIELD_TYPES.map(t => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />
        Required
      </label>
      <Button type="submit" disabled={loading} variant="primary">
        {loading ? '…' : 'Add field'}
      </Button>
    </form>
  );
}

function StageSection({
  stage,
  pipelineId,
  onDelete,
  onChanged,
}: {
  stage: PipelineWithStages['stages'][0];
  pipelineId: string;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(stage.name);
  const [showAddField, setShowAddField] = useState(false);
  const qc = useQueryClient();

  async function saveName() {
    if (name.trim() && name.trim() !== stage.name) {
      await updateStage(pipelineId, stage.id, { name: name.trim() });
      onChanged();
    }
    setEditingName(false);
  }

  async function removeField(fieldId: string, sid: string) {
    await deleteField(sid, fieldId);
    onChanged();
  }

  const terminalBadge = stage.is_won ? (
    <span style={{ fontSize: 11, background: '#22c55e20', color: '#22c55e', borderRadius: 4, padding: '1px 6px' }}>Won</span>
  ) : stage.is_lost ? (
    <span style={{ fontSize: 11, background: '#ef444420', color: '#ef4444', borderRadius: 4, padding: '1px 6px' }}>Lost</span>
  ) : null;

  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
        marginBottom: 10,
      }}
    >
      {/* Stage header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {editingName ? (
          <Input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter') void saveName(); if (e.key === 'Escape') { setName(stage.name); setEditingName(false); } }}
            style={{ flex: 1 }}
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'text',
              fontWeight: 600,
              fontSize: 13,
              color: 'var(--text)',
              textAlign: 'left',
              flex: 1,
              padding: 0,
            }}
          >
            {stage.name}
          </button>
        )}
        {terminalBadge}
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>pos {stage.position}</span>
        {!stage.is_won && !stage.is_lost && (
          <button
            onClick={onDelete}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text3)',
              fontSize: 16,
            }}
            title="Delete stage"
          >
            ×
          </button>
        )}
      </div>

      {/* Fields */}
      {stage.fields.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {stage.fields.map(f => (
            <StageFieldRow
              key={f.id}
              field={f}
              stageId={stage.id}
              onDelete={() => void removeField(f.id, stage.id).then(onChanged)}
            />
          ))}
        </div>
      )}

      {showAddField ? (
        <AddFieldForm
          stageId={stage.id}
          onAdded={() => {
            setShowAddField(false);
            onChanged();
            void qc.invalidateQueries({ queryKey: ['pipeline'] });
          }}
        />
      ) : (
        <button
          onClick={() => setShowAddField(true)}
          style={{
            background: 'none',
            border: '1px dashed var(--border)',
            borderRadius: 6,
            padding: '5px 12px',
            fontSize: 12,
            color: 'var(--text3)',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
          }}
        >
          + Add field
        </button>
      )}
    </div>
  );
}

function PipelineEditor({ pipeline }: { pipeline: Pipeline }) {
  const qc = useQueryClient();
  const [newStageName, setNewStageName] = useState('');
  const [addingStage, setAddingStage] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['pipeline', pipeline.id],
    queryFn: () => getPipeline(pipeline.id),
  });

  const pw: PipelineWithStages | undefined = data?.data;

  const addStageMut = useMutation({
    mutationFn: (name: string) => createStage(pipeline.id, { name }),
    onSuccess: () => { void refetch(); setNewStageName(''); setAddingStage(false); },
  });

  const deleteStageMut = useMutation({
    mutationFn: (stageId: string) => deleteStage(pipeline.id, stageId),
    onSuccess: () => refetch(),
  });

  if (!pw) return <div style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>Loading…</div>;

  return (
    <div>
      {pw.stages.map(stage => (
        <StageSection
          key={stage.id}
          stage={stage}
          pipelineId={pipeline.id}
          onDelete={() => deleteStageMut.mutate(stage.id)}
          onChanged={() => { void refetch(); void qc.invalidateQueries({ queryKey: ['pipelines'] }); }}
        />
      ))}

      {addingStage ? (
        <form
          onSubmit={e => { e.preventDefault(); if (newStageName.trim()) addStageMut.mutate(newStageName.trim()); }}
          style={{ display: 'flex', gap: 8, marginTop: 4 }}
        >
          <Input
            autoFocus
            value={newStageName}
            onChange={e => setNewStageName(e.target.value)}
            placeholder="Stage name"
            style={{ flex: 1 }}
          />
          <Button type="submit" variant="primary" disabled={addStageMut.isPending}>
            {addStageMut.isPending ? '…' : 'Add'}
          </Button>
          <Button type="button" onClick={() => setAddingStage(false)}>Cancel</Button>
        </form>
      ) : (
        <Button onClick={() => setAddingStage(true)}>+ Add stage</Button>
      )}
    </div>
  );
}

export default function PipelinesSettingsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pipelines'],
    queryFn: listPipelines,
  });

  const pipelines: Pipeline[] = data?.data ?? [];
  const activePipeline = pipelines.find(p => p.id === selected) ?? pipelines[0];

  // Auto-select first pipeline once loaded
  useEffect(() => {
    if (!selected && pipelines.length > 0 && pipelines[0]) {
      setSelected(pipelines[0].id);
    }
  }, [pipelines, selected]);

  const createMut = useMutation({
    mutationFn: (name: string) => createPipeline({ name }),
    onSuccess: (res) => {
      void refetch();
      setSelected(res.data.id);
      setNewName('');
      setCreating(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePipeline(id),
    onSuccess: () => {
      void refetch();
      void qc.invalidateQueries({ queryKey: ['pipeline'] });
      setDeletingId(null);
      setSelected(null);
    },
  });

  if (isLoading) {
    return <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading pipelines…</div>;
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Pipelines</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
            Configure deal stages and custom fields per stage.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>+ New pipeline</Button>
      </div>

      {creating && (
        <form
          onSubmit={e => { e.preventDefault(); if (newName.trim()) createMut.mutate(newName.trim()); }}
          style={{
            display: 'flex',
            gap: 8,
            padding: 16,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <Input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Pipeline name"
            style={{ flex: 1 }}
          />
          <Button type="submit" variant="primary" disabled={createMut.isPending}>
            {createMut.isPending ? 'Creating…' : 'Create'}
          </Button>
          <Button type="button" onClick={() => setCreating(false)}>Cancel</Button>
        </form>
      )}

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Pipeline list */}
        <div style={{ width: 200, flexShrink: 0 }}>
          {pipelines.map(p => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: p.id === (activePipeline?.id) ? 'var(--bg)' : 'none',
                border: p.id === (activePipeline?.id) ? '1px solid var(--border)' : '1px solid transparent',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: p.id === (activePipeline?.id) ? 600 : 400,
                color: 'var(--text)',
                cursor: 'pointer',
                marginBottom: 4,
              }}
            >
              {p.name}
              {p.is_default && (
                <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>default</span>
              )}
            </button>
          ))}
        </div>

        {/* Pipeline editor */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {activePipeline ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{activePipeline.name}</h3>
                {!activePipeline.is_default && (
                  deletingId === activePipeline.id ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#ef4444' }}>Delete pipeline?</span>
                      <Button
                        onClick={() => deleteMut.mutate(activePipeline.id)}
                        disabled={deleteMut.isPending}
                      >
                        {deleteMut.isPending ? '…' : 'Yes, delete'}
                      </Button>
                      <Button onClick={() => setDeletingId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(activePipeline.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 12,
                        color: 'var(--text3)',
                      }}
                    >
                      Delete pipeline
                    </button>
                  )
                )}
              </div>
              <PipelineEditor key={activePipeline.id} pipeline={activePipeline} />
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>No pipelines yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
