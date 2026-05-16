'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/FormField';
import { createDeal, updateDeal } from '@/lib/deals';
import { useApiToken } from '@/lib/useApiToken';
import type { Deal, PipelineStage, StageField } from '@vantage/types';

type StageWithFields = PipelineStage & { fields: StageField[] };

interface Props {
  deal?: Deal;
  pipelineId: string;
  stages: StageWithFields[];
  defaultStageId: string | null;
  onDone: () => void;
}

function FieldInput({ field, value, onChange }: { field: StageField; value: string; onChange: (v: string) => void }) {
  if (field.field_type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={value === 'true'} onChange={e => onChange(e.target.checked ? 'true' : 'false')} />
        {field.name}
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

export function DealForm({ deal, pipelineId, stages, defaultStageId, onDone }: Props) {
  const qc = useQueryClient();
  const getToken = useApiToken();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: deal?.name ?? '',
    value: deal?.value?.toString() ?? '0',
    stage_id: deal?.stage_id ?? defaultStageId ?? stages[0]?.id ?? '',
    probability: deal?.probability?.toString() ?? '0',
    close_date: '',
  });

  // Seed field_values from existing deal if editing
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    deal?.field_values
      ? Object.fromEntries(Object.entries(deal.field_values).map(([k, v]) => [k, typeof v === 'string' ? v : (v as { value: string }).value ?? '']))
      : {}
  );

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Fields for the currently selected stage
  const selectedStage = stages.find(s => s.id === form.stage_id);
  const currentFields = selectedStage?.fields ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const fv = Object.keys(fieldValues).length > 0 ? fieldValues : undefined;
      const token = await getToken();
      if (deal) {
        await updateDeal(token, deal.id, {
          name: form.name,
          stage_id: form.stage_id,
          value: parseFloat(form.value) || 0,
          probability: parseInt(form.probability) || 0,
          close_date: form.close_date || undefined,
          field_values: fv,
        });
      } else {
        await createDeal(token, {
          name: form.name,
          pipeline_id: pipelineId,
          stage_id: form.stage_id,
          value: parseFloat(form.value) || 0,
          probability: parseInt(form.probability) || 0,
          close_date: form.close_date || undefined,
          field_values: fv,
        });
      }
      await qc.invalidateQueries({ queryKey: ['deals', pipelineId] });
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <FormField label="Name *">
        <Input required value={form.name} onChange={set('name')} placeholder="Acme Corp — Enterprise" />
      </FormField>
      <FormField label="Value ($)">
        <Input type="number" min="0" step="0.01" value={form.value} onChange={set('value')} />
      </FormField>
      <FormField label="Stage">
        <Select value={form.stage_id} onChange={set('stage_id')}>
          {stages.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Probability (%)">
        <Input type="number" min="0" max="100" value={form.probability} onChange={set('probability')} />
      </FormField>
      <FormField label="Close date">
        <Input type="date" value={form.close_date} onChange={set('close_date')} />
      </FormField>

      {/* Custom fields for selected stage */}
      {currentFields.map(f => (
        <FormField key={f.id} label={`${f.name}${f.is_required ? ' *' : ''}`}>
          <FieldInput
            field={f}
            value={fieldValues[f.id] ?? ''}
            onChange={v => setFieldValues(fv => ({ ...fv, [f.id]: v }))}
          />
        </FormField>
      ))}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <Button type="button" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Saving…' : deal ? 'Save changes' : 'Add item'}
        </Button>
      </div>
    </form>
  );
}
