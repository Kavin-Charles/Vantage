'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/FormField';
import { createDeal, updateDeal } from '@/lib/deals';
import type { Deal, PipelineStage } from '@vantage/types';

interface Props {
  deal?: Deal;
  pipelineId: string;
  stages: PipelineStage[];
  defaultStageId: string | null;
  onDone: () => void;
}

export function DealForm({ deal, pipelineId, stages, defaultStageId, onDone }: Props) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: deal?.name ?? '',
    value: deal?.value?.toString() ?? '0',
    stage_id: deal?.stage_id ?? defaultStageId ?? stages[0]?.id ?? '',
    probability: deal?.probability?.toString() ?? '0',
    close_date: '',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (deal) {
        await updateDeal(deal.id, {
          name: form.name,
          stage_id: form.stage_id,
          value: parseFloat(form.value) || 0,
          probability: parseInt(form.probability) || 0,
          close_date: form.close_date || undefined,
        });
      } else {
        await createDeal({
          name: form.name,
          pipeline_id: pipelineId,
          stage_id: form.stage_id,
          value: parseFloat(form.value) || 0,
          probability: parseInt(form.probability) || 0,
          close_date: form.close_date || undefined,
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
      <FormField label="Deal name *">
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
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <Button type="button" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Saving…' : deal ? 'Save changes' : 'Add deal'}
        </Button>
      </div>
    </form>
  );
}
