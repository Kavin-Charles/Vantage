'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/modules/shared/components/ui/Button';
import { FormField, Input, Select } from '@/modules/shared/components/ui/FormField';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { createContact, updateContact } from '@/modules/contacts/lib/contacts';
import type { Contact } from '@vantage/types';

interface Props {
  contact?: Contact;
  onDone: () => void;
}

export function ContactForm({ contact, onDone }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: contact?.name ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    status: contact?.status ?? 'prospect',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const token = await getToken();
      if (contact) {
        await updateContact(token, contact.id, form);
      } else {
        await createContact(token, form);
      }
      await qc.invalidateQueries({ queryKey: ['contacts'] });
      onDone();
    } catch {
      // error surfaced via loading state reset; form stays open for retry
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <FormField label="Name *">
        <Input required value={form.name} onChange={set('name')} placeholder="Jane Smith" />
      </FormField>
      <FormField label="Email *">
        <Input required type="email" value={form.email} onChange={set('email')} placeholder="jane@example.com" />
      </FormField>
      <FormField label="Phone">
        <Input value={form.phone} onChange={set('phone')} placeholder="+1 555 000 0000" />
      </FormField>
      <FormField label="Status">
        <Select value={form.status} onChange={set('status')}>
          <option value="prospect">Prospect</option>
          <option value="customer">Customer</option>
          <option value="cold">Cold</option>
          <option value="churned">Churned</option>
        </Select>
      </FormField>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <Button type="button" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Saving…' : contact ? 'Save changes' : 'Add contact'}
        </Button>
      </div>
    </form>
  );
}
