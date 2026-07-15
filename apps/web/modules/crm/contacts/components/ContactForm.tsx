'use client';

import { useState } from 'react';
import { Button } from '@/modules/shared/components/ui/Button';
import { FormField, Input, Select } from '@/modules/shared/components/ui/FormField';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { createContact, updateContact } from '@/modules/crm/contacts/lib/contacts';
import type { Contact } from '@vencore/types';

interface Props {
  contact?: Contact;
  onDone: () => void;
}

interface FieldErrors {
  name?: string;
  email?: string;
  phone?: string;
}

function clientValidate(form: { name: string; email: string; phone: string }): FieldErrors {
  const errs: FieldErrors = {};
  if (!form.name.trim()) errs.name = 'Name is required';
  if (!form.email.trim()) {
    errs.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errs.email = 'Enter a valid email address';
  }
  if (form.phone && form.phone.length > 50) {
    errs.phone = 'Phone too long (max 50 chars)';
  }
  return errs;
}

export function ContactForm({ contact, onDone }: Props) {
  const getToken = useApiToken();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: contact?.name ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    status: contact?.status ?? 'prospect',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    setFieldErrors(fe => ({ ...fe, [k]: undefined }));
    setFormError(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = clientValidate(form);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setLoading(true);
    setFormError(null);
    try {
      const token = await getToken();
      const payload = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        status: form.status as Contact['status'],
      };

      if (contact) {
        await updateContact(token, contact.id, payload);
      } else {
        await createContact(token, payload);
      }
      onDone();
    } catch (err: unknown) {
      const msg = extractApiError(err);
      setFormError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <FormField label="Name *" error={fieldErrors.name}>
        <Input
          required
          value={form.name}
          onChange={set('name')}
          placeholder="Jane Smith"
          autoFocus
        />
      </FormField>
      <FormField label="Email *" error={fieldErrors.email}>
        <Input
          required
          type="email"
          value={form.email}
          onChange={set('email')}
          placeholder="jane@example.com"
        />
      </FormField>
      <FormField label="Phone" error={fieldErrors.phone}>
        <Input
          value={form.phone}
          onChange={set('phone')}
          placeholder="+1 555 000 0000"
        />
      </FormField>
      <FormField label="Status">
        <Select value={form.status} onChange={set('status')}>
          <option value="prospect">Prospect</option>
          <option value="customer">Customer</option>
          <option value="cold">Cold</option>
          <option value="churned">Churned</option>
        </Select>
      </FormField>

      {formError && (
        <div style={{
          padding: '10px 12px', marginBottom: 8, borderRadius: 8,
          background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13,
        }}>
          {formError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <Button type="button" onClick={onDone} disabled={loading}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Saving…' : contact ? 'Save changes' : 'Add contact'}
        </Button>
      </div>
    </form>
  );
}

function extractApiError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    // Our API error shape: { error: { code, message } }
    if (e['error'] && typeof e['error'] === 'object') {
      const apiErr = e['error'] as Record<string, unknown>;
      const code = apiErr['code'];
      if (code === 'DUPLICATE_EMAIL') return 'A contact with this email already exists.';
      if (apiErr['message']) return String(apiErr['message']);
    }
    if (e['message']) return String(e['message']);
  }
  return 'Something went wrong. Please try again.';
}
