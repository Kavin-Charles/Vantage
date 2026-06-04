'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/modules/shared/components/ui/Button';
import { FormField, Input } from '@/modules/shared/components/ui/FormField';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { createCompany, updateCompany } from '@/modules/companies/lib/companies';
import type { Company } from '@vencore/types';

export function CompanyForm({ company, onDone }: { company?: Company; onDone: () => void }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: company?.name ?? '',
    industry: company?.industry ?? '',
    location: company?.location ?? '',
    website: company?.website ?? '',
    employee_count: company?.employee_count?.toString() ?? '',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const token = await getToken();
      const body = {
        ...form,
        employee_count: form.employee_count ? parseInt(form.employee_count) : undefined,
      };
      if (company) await updateCompany(token, company.id, body);
      else await createCompany(token, body);
      await qc.invalidateQueries({ queryKey: ['companies'] });
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <FormField label="Company name *">
        <Input required value={form.name} onChange={set('name')} placeholder="Acme Corp" />
      </FormField>
      <FormField label="Industry">
        <Input value={form.industry} onChange={set('industry')} placeholder="SaaS, Fintech…" />
      </FormField>
      <FormField label="Location">
        <Input value={form.location} onChange={set('location')} placeholder="San Francisco, CA" />
      </FormField>
      <FormField label="Website">
        <Input value={form.website} onChange={set('website')} placeholder="https://example.com" />
      </FormField>
      <FormField label="Employees">
        <Input type="number" value={form.employee_count} onChange={set('employee_count')} placeholder="50" />
      </FormField>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <Button type="button" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Saving…' : company ? 'Save changes' : 'Add company'}
        </Button>
      </div>
    </form>
  );
}
