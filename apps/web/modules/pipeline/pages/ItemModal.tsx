'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/modules/shared/components/ui/Button';
import { FormField, Input, Select } from '@/modules/shared/components/ui/FormField';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { createItem, updateItem, convertItem, listItemGroups } from '@/modules/pipeline/lib/item-groups';
import type { Item, ItemGroupWithStages, GroupStage, ItemField } from '@vantage/types';

interface Props {
  item?: Item;
  group: ItemGroupWithStages;
  pipelineId: string;
  defaultStageId: string | null;
  onDone: () => void;
}

function FieldInput({ field, value, onChange }: { field: ItemField; value: string; onChange: (v: string) => void }) {
  if (field.field_type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={value === 'true'} onChange={e => onChange(e.target.checked ? 'true' : 'false')} />
        {field.label}
      </label>
    );
  }
  if (field.field_type === 'select' && field.options && field.options.length > 0) {
    return (
      <Select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">— select —</option>
        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
      </Select>
    );
  }
  const inputType = field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text';
  return <Input type={inputType} value={value} onChange={e => onChange(e.target.value)} />;
}

export function ItemModal({ item, group, pipelineId, defaultStageId, onDone }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [targetGroupId, setTargetGroupId] = useState('');

  const [form, setForm] = useState({
    title: item?.title ?? '',
    value: item?.value?.toString() ?? '',
    stage_id: item?.stage_id ?? defaultStageId ?? group.stages[0]?.id ?? '',
  });
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(item?.field_values ?? {});

  const { data: groupsData } = useQuery({
    queryKey: ['item-groups', pipelineId],
    queryFn: async () => listItemGroups(await getToken(), pipelineId),
    enabled: !!item, // only need this for convert, when editing existing
  });
  const otherGroups = (groupsData?.data ?? []).filter(g => g.id !== group.id);

  function setField(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const token = await getToken();
      if (item) {
        await updateItem(token, item.id, {
          title: form.title,
          stage_id: form.stage_id,
          value: form.value ? parseFloat(form.value) : null,
          field_values: fieldValues,
        });
      } else {
        await createItem(token, {
          group_id: group.id,
          stage_id: form.stage_id,
          title: form.title,
          value: form.value ? parseFloat(form.value) : undefined,
          field_values: Object.keys(fieldValues).length > 0 ? fieldValues : undefined,
        });
      }
      onDone();
    } finally {
      setLoading(false);
    }
  }

  async function handleConvert() {
    if (!item || !targetGroupId) return;
    setConverting(true);
    try {
      await convertItem(await getToken(), item.id, targetGroupId);
      void qc.invalidateQueries({ queryKey: ['items'] });
      onDone();
    } finally {
      setConverting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <FormField label="Title *">
        <Input required value={form.title} onChange={setField('title')} placeholder="e.g. Acme Corp enquiry" />
      </FormField>
      <FormField label="Value ($)">
        <Input type="number" min="0" step="0.01" value={form.value} onChange={setField('value')} placeholder="0" />
      </FormField>
      <FormField label="Stage">
        <Select value={form.stage_id} onChange={setField('stage_id')}>
          {group.stages.map((s: GroupStage) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </FormField>

      {/* Custom fields */}
      {group.fields.map((f: ItemField) => (
        <FormField key={f.id} label={`${f.label}${f.required ? ' *' : ''}`}>
          <FieldInput
            field={f}
            value={fieldValues[f.id] ?? ''}
            onChange={v => setFieldValues(fv => ({ ...fv, [f.id]: v }))}
          />
        </FormField>
      ))}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Button type="button" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Saving…' : item ? 'Save changes' : 'Add item'}
        </Button>
      </div>

      {/* Convert — only when editing */}
      {item && otherGroups.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Convert to another group</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Select value={targetGroupId} onChange={e => setTargetGroupId(e.target.value)} style={{ flex: 1 }}>
              <option value="">Select group…</option>
              {otherGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            <Button type="button" onClick={handleConvert} disabled={!targetGroupId || converting}>
              {converting ? '…' : 'Convert →'}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
