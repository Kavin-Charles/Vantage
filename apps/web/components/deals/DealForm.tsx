'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/FormField';
import { useApiToken } from '@/lib/useApiToken';
import { createDeal, updateDeal } from '@/lib/deals';
import type { Deal, DealStage } from '@vantage/types';

const STAGES: DealStage[] = ['lead', 'qualifying', 'proposal', 'closing', 'won', 'lost'];

export function DealForm({ deal, defaultStage, onDone }: { deal?: Deal; defaultStage?: DealStage; onDone: () => void }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: deal?.name ?? '',
    value: deal?.value?.toString() ?? '0',
    stage: deal?.stage ?? defaultStage ?? 'lead',
    probability: deal?.probability?.toString() ?? '0',
    close_date: '',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const token = await getToken();
      const body: Omit<Partial<Deal>, 'close_date'> & { close_date?: string; name: string; stage: DealStage; value: number; probability: number } = {
        name: form.name,
        stage: form.stage as DealStage,
        value: parseFloat(form.value) || 0,
        probability: parseInt(form.probability) || 0,
        close_date: form.close_date || undefined,
      };
      if (deal) await updateDeal(token, deal.id, body);
      else await createDeal(token, body);
      await qc.invalidateQueries({ queryKey: ['deals'] });
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
        <Select value={form.stage} onChange={set('stage')}>
          {STAGES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
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
