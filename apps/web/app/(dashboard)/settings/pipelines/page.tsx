'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';

interface RecordType { id: string; name: string; icon: string; color: string; }
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/FormField';
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
import {
  listItemGroups,
  getItemGroup,
  createItemGroup,
  updateItemGroup,
  deleteItemGroup,
  createGroupStage,
  updateGroupStage,
  deleteGroupStage,
  createItemField,
  deleteItemField,
} from '@/lib/item-groups';
import type { Pipeline, PipelineWithStages, StageField, ItemGroup, ItemGroupWithStages, GroupStage, ItemField } from '@vantage/types';

const FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const;

const ALL_COLUMNS: { key: string; label: string }[] = [
  { key: 'record_number', label: 'Record #' },
  { key: 'name', label: 'Name' },
  { key: 'stage', label: 'Stage' },
  { key: 'owner_id', label: 'Owner' },
  { key: 'contact_id', label: 'Contact' },
  { key: 'company_id', label: 'Company' },
  { key: 'created_at', label: 'Created' },
];

const DEFAULT_TABLE_COLUMNS = ['record_number', 'name', 'stage', 'owner_id', 'created_at'];

// ── PipelineEditor ──────────────────────────────────────────────────────────

function ViewSettings({ pipeline, onChanged }: { pipeline: Pipeline; onChanged: () => void }) {
  const getToken = useApiToken();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localView, setLocalView] = useState<string | null>(null);
  const [localColumns, setLocalColumns] = useState<string[] | null>(null);
  const [localRecordTypeId, setLocalRecordTypeId] = useState<string | null | undefined>(undefined);
  const prevPipelineId = useRef(pipeline.id);

  const { data: typesResp } = useQuery<{ data: RecordType[] }>({
    queryKey: ['record-types'],
    queryFn: async () => {
      const res = await fetch('/api/record-types');
      return res.json() as Promise<{ data: RecordType[] }>;
    },
  });
  const recordTypes: RecordType[] = typesResp?.data ?? [];

  // Reset local state when switching to a different pipeline
  useEffect(() => {
    if (prevPipelineId.current !== pipeline.id) {
      setLocalView(null);
      setLocalColumns(null);
      setLocalRecordTypeId(undefined);
      prevPipelineId.current = pipeline.id;
    }
  }, [pipeline.id]);

  const currentView = localView ?? pipeline.view ?? 'list';
  const currentColumns: string[] = localColumns ?? (pipeline.table_columns as string[] | null) ?? DEFAULT_TABLE_COLUMNS;
  const currentRecordTypeId = localRecordTypeId === undefined ? (pipeline.record_type_id ?? '') : (localRecordTypeId ?? '');

  async function handleRecordTypeChange(rtId: string) {
    const value = rtId === '' ? null : rtId;
    setLocalRecordTypeId(value);
    setSaving(true);
    setError(null);
    try {
      await updatePipeline(await getToken(), pipeline.id, { record_type_id: value });
      onChanged();
    } catch {
      setLocalRecordTypeId(undefined);
      setError('Failed to save record type');
    } finally {
      setSaving(false);
    }
  }

  async function handleViewChange(view: string) {
    setLocalView(view); // optimistic update
    setSaving(true);
    setError(null);
    try {
      await updatePipeline(await getToken(), pipeline.id, { view });
      onChanged();
    } catch {
      setLocalView(null); // revert on error
      setError('Failed to save view setting');
    } finally {
      setSaving(false);
    }
  }

  async function handleColumnToggle(key: string, checked: boolean) {
    const next = checked
      ? [...currentColumns, key]
      : currentColumns.filter(c => c !== key);
    setLocalColumns(next.length > 0 ? next : DEFAULT_TABLE_COLUMNS); // optimistic update
    setSaving(true);
    setError(null);
    try {
      await updatePipeline(await getToken(), pipeline.id, {
        table_columns: next.length > 0 ? next : null,
      });
      onChanged();
    } catch {
      setLocalColumns(null); // revert on error
      setError('Failed to save column setting');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
      {error && (
        <p style={{ color: '#ef4444', fontSize: 12, margin: '0 0 8px' }}>{error}</p>
      )}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6, fontWeight: 600 }}>Record Type</div>
        <select
          value={currentRecordTypeId}
          onChange={e => void handleRecordTypeChange(e.target.value)}
          disabled={saving}
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '6px 8px', fontSize: 13, color: 'var(--text)',
            opacity: saving ? 0.6 : 1,
          }}
        >
          <option value="">— None —</option>
          {recordTypes.map(rt => (
            <option key={rt.id} value={rt.id}>{rt.icon} {rt.name}</option>
          ))}
        </select>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8, fontWeight: 600 }}>View</div>
      <select
        value={currentView}
        onChange={e => void handleViewChange(e.target.value)}
        disabled={saving}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
          padding: '6px 8px', fontSize: 13, color: 'var(--text)', marginBottom: 12,
          opacity: saving ? 0.6 : 1,
        }}
      >
        <option value="table">Table</option>
        <option value="list">List</option>
      </select>

      {currentView === 'table' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Columns</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {ALL_COLUMNS.map(col => (
              <label
                key={col.key}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text2)', cursor: saving ? 'not-allowed' : 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={currentColumns.includes(col.key)}
                  disabled={saving}
                  onChange={e => void handleColumnToggle(col.key, e.target.checked)}
                />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
      <span style={{ flex: 1, color: 'var(--text)' }}>{field.name}</span>
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
      {field.is_required && (
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
  const getToken = useApiToken();
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<string>('text');
  const [required, setRequired] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setLoading(true);
    try {
      await createField(await getToken(), stageId, { name: label.trim(), field_type: fieldType, is_required: required });
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
  const getToken = useApiToken();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(stage.name);
  const [showAddField, setShowAddField] = useState(false);
  const qc = useQueryClient();

  async function saveName() {
    if (name.trim() && name.trim() !== stage.name) {
      await updateStage(await getToken(), pipelineId, stage.id, { name: name.trim() });
      onChanged();
    }
    setEditingName(false);
  }

  async function removeField(fieldId: string, sid: string) {
    await deleteField(await getToken(), sid, fieldId);
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
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [newStageName, setNewStageName] = useState('');
  const [addingStage, setAddingStage] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['pipeline', pipeline.id],
    queryFn: async () => getPipeline(await getToken(), pipeline.id),
  });

  const pw: PipelineWithStages | undefined = data?.data;

  const addStageMut = useMutation({
    mutationFn: async (name: string) => createStage(await getToken(), pipeline.id, { name }),
    onSuccess: () => { void refetch(); setNewStageName(''); setAddingStage(false); },
  });

  const deleteStageMut = useMutation({
    mutationFn: async (stageId: string) => deleteStage(await getToken(), pipeline.id, stageId),
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

// ── GroupEditor ────────────────────────────────────────────────────────────

function ItemFieldRow({
  field,
  groupId,
  onDelete,
}: {
  field: ItemField;
  groupId: string;
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

function AddItemFieldForm({
  groupId,
  onAdded,
}: {
  groupId: string;
  onAdded: () => void;
}) {
  const getToken = useApiToken();
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<string>('text');
  const [required, setRequired] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setLoading(true);
    try {
      await createItemField(await getToken(), groupId, { label: label.trim(), field_type: fieldType, required });
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

function GroupStageRow({
  stage,
  groupId,
  onDelete,
  onChanged,
}: {
  stage: GroupStage & { fields: ItemField[] };
  groupId: string;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const getToken = useApiToken();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(stage.name);
  const qc = useQueryClient();

  async function saveName() {
    if (name.trim() && name.trim() !== stage.name) {
      await updateGroupStage(await getToken(), groupId, stage.id, { name: name.trim() });
      onChanged();
    }
    setEditingName(false);
  }

  return (
    <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
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
              fontWeight: 500,
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
      </div>
      {stage.fields.map(f => (
        <ItemFieldRow
          key={f.id}
          field={f}
          groupId={groupId}
          onDelete={() => void getToken().then(t => deleteItemField(t, groupId, f.id)).then(onChanged)}
        />
      ))}
    </div>
  );
}

function GroupEditor({ group }: { group: ItemGroupWithStages }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [newStageName, setNewStageName] = useState('');
  const [addingStage, setAddingStage] = useState(false);
  const [showAddField, setShowAddField] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['item-group', group.id],
    queryFn: async () => getItemGroup(await getToken(), group.id),
  });

  const groupData = data?.data ?? group;

  const addStageMut = useMutation({
    mutationFn: async (name: string) => createGroupStage(await getToken(), group.id, { name }),
    onSuccess: () => { void refetch(); setNewStageName(''); setAddingStage(false); },
  });

  const deleteStageMut = useMutation({
    mutationFn: async (stageId: string) => deleteGroupStage(await getToken(), group.id, stageId),
    onSuccess: () => refetch(),
  });

  return (
    <div>
      <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Stages</div>
        {groupData.stages.map(stage => (
          <GroupStageRow
            key={stage.id}
            stage={stage}
            groupId={group.id}
            onDelete={() => deleteStageMut.mutate(stage.id)}
            onChanged={() => { void refetch(); void qc.invalidateQueries({ queryKey: ['item-groups'] }); }}
          />
        ))}

        {addingStage ? (
          <form
            onSubmit={e => { e.preventDefault(); if (newStageName.trim()) addStageMut.mutate(newStageName.trim()); }}
            style={{ display: 'flex', gap: 8, marginTop: 8 }}
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

      <div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Custom fields</div>
        {groupData.fields.map(f => (
          <ItemFieldRow
            key={f.id}
            field={f}
            groupId={group.id}
            onDelete={() => void getToken().then(t => deleteItemField(t, group.id, f.id)).then(() => refetch())}
          />
        ))}

        {showAddField ? (
          <AddItemFieldForm
            groupId={group.id}
            onAdded={() => {
              setShowAddField(false);
              void refetch();
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
              marginTop: 8,
            }}
          >
            + Add field
          </button>
        )}
      </div>
    </div>
  );
}

// ── ItemGroupsSection ──────────────────────────────────────────────────────

function ItemGroupsSection({ pipelineId }: { pipelineId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creatingName, setCreatingName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ['item-groups', pipelineId],
    queryFn: async () => listItemGroups(await getToken(), pipelineId),
  });

  const groups: (ItemGroup & { stages: GroupStage[]; fields: ItemField[] })[] = data?.data ?? [];

  const createMut = useMutation({
    mutationFn: async (name: string) => createItemGroup(await getToken(), { pipeline_id: pipelineId, name }),
    onSuccess: () => {
      void refetch();
      setCreatingName('');
      setCreating(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteItemGroup(await getToken(), id),
    onSuccess: () => {
      void refetch();
      void qc.invalidateQueries({ queryKey: ['item-groups', pipelineId] });
      setDeletingId(null);
    },
  });

  return (
    <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Item Groups</h3>
        <Button variant="primary" onClick={() => setCreating(true)}>+ New group</Button>
      </div>

      {creating && (
        <form
          onSubmit={e => { e.preventDefault(); if (creatingName.trim()) createMut.mutate(creatingName.trim()); }}
          style={{
            display: 'flex',
            gap: 8,
            padding: 12,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          <Input
            autoFocus
            value={creatingName}
            onChange={e => setCreatingName(e.target.value)}
            placeholder="Group name"
            style={{ flex: 1 }}
          />
          <Button type="submit" variant="primary" disabled={createMut.isPending}>
            {createMut.isPending ? '…' : 'Create'}
          </Button>
          <Button type="button" onClick={() => setCreating(false)}>Cancel</Button>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {groups.map(g => (
          <div
            key={g.id}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setExpanded(expanded === g.id ? null : g.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: 12,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text)',
              }}
            >
              <span style={{ flex: 1 }}>{g.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{g.stages.length} stages · {g.fields.length} fields</span>
              <span style={{ fontSize: 16, color: 'var(--text3)', transform: expanded === g.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                ▼
              </span>
              {deletingId !== g.id && (
                <button
                  onClick={e => { e.stopPropagation(); setDeletingId(g.id); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text3)',
                    fontSize: 16,
                  }}
                  title="Delete group"
                >
                  ×
                </button>
              )}
            </button>

            {deletingId === g.id && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', borderTop: '1px solid var(--border)', background: '#ef444408' }}>
                <span style={{ fontSize: 12, color: '#ef4444', flex: 1 }}>Delete group?</span>
                <Button
                  onClick={() => deleteMut.mutate(g.id)}
                  disabled={deleteMut.isPending}
                >
                  {deleteMut.isPending ? '…' : 'Yes, delete'}
                </Button>
                <Button onClick={() => setDeletingId(null)}>Cancel</Button>
              </div>
            )}

            {expanded === g.id && (
              <div style={{ padding: 12, borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                <GroupEditor group={{ ...g, stages: g.stages.map(s => ({ ...s, fields: g.fields.filter(f => true) })) }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function PipelinesSettingsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });

  const pipelines: Pipeline[] = data?.data ?? [];
  const activePipeline = pipelines.find(p => p.id === selected) ?? pipelines[0];

  useEffect(() => {
    if (!selected && pipelines.length > 0 && pipelines[0]) {
      setSelected(pipelines[0].id);
    }
  }, [pipelines, selected]);

  const createMut = useMutation({
    mutationFn: async (name: string) => createPipeline(await getToken(), { name }),
    onSuccess: (res) => {
      void refetch();
      setSelected(res.data.id);
      setNewName('');
      setCreating(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deletePipeline(await getToken(), id),
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
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Pipelines</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
            Configure pipeline stages, item groups, and custom fields.
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
              <ViewSettings
                pipeline={activePipeline}
                onChanged={() => { void refetch(); void qc.invalidateQueries({ queryKey: ['pipelines'] }); }}
              />
              <PipelineEditor key={activePipeline.id} pipeline={activePipeline} />
              <ItemGroupsSection pipelineId={activePipeline.id} />
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>No pipelines yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
