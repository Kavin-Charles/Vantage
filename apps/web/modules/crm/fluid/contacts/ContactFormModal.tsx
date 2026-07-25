'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FluidModal, FluidInput, FluidButton, FluidSelect, Avatar } from '@/modules/shared/fluid/ui';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { createContact, updateContact } from '@/modules/crm/contacts/lib/contacts';
import { listCompanies } from '@/modules/crm/companies/lib/companies';
import type { Contact, ContactStatus } from '@vencore/types';

const STATUS_OPTIONS: { label: string; value: ContactStatus }[] = [
  { label: 'Prospect', value: 'prospect' },
  { label: 'Customer', value: 'customer' },
  { label: 'Cold', value: 'cold' },
  { label: 'Churned', value: 'churned' },
];

function splitName(name: string | undefined | null): [string, string] {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return ['', ''];
  const [first, ...rest] = trimmed.split(' ');
  return [first, rest.join(' ')];
}

export function ContactFormModal({
  open, mode, initial, companyId, onClose, onSaved,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: Partial<Contact> | null;
  companyId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [initialFirst, initialLast] = splitName(initial?.name);
  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [selectedCompanyId, setSelectedCompanyId] = useState(initial?.company_id ?? companyId ?? '');
  const [status, setStatus] = useState<ContactStatus>(initial?.status ?? 'prospect');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const [first, last] = splitName(initial?.name);
    setFirstName(first);
    setLastName(last);
    setTitle(initial?.title ?? '');
    setEmail(initial?.email ?? '');
    setPhone(initial?.phone ?? '');
    setSelectedCompanyId(initial?.company_id ?? companyId ?? '');
    setStatus(initial?.status ?? 'prospect');
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const { data: companiesData } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => listCompanies(await getToken(), {}),
  });
  const companyOptions = [
    { label: 'No company', value: '' },
    ...(companiesData?.data ?? []).map(c => ({ label: c.name, value: c.id })),
  ];

  const create = useMutation({
    mutationFn: async (body: Partial<Contact>) => createContact(await getToken(), body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });

  const update = useMutation({
    mutationFn: async (body: Partial<Contact>) => updateContact(await getToken(), initial?.id ?? '', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });

  const isSaving = create.isPending || update.isPending;

  function reset() {
    setFirstName(initialFirst);
    setLastName(initialLast);
    setTitle(initial?.title ?? '');
    setEmail(initial?.email ?? '');
    setPhone(initial?.phone ?? '');
    setSelectedCompanyId(initial?.company_id ?? companyId ?? '');
    setStatus(initial?.status ?? 'prospect');
    setFormError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function submit() {
    const name = `${firstName} ${lastName}`.trim();
    if (!name || !email.trim()) return;
    setFormError(null);
    const body: Partial<Contact> = { name, email: email.trim().toLowerCase(), status };
    if (title.trim()) body.title = title.trim();
    if (phone.trim()) body.phone = phone.trim();
    if (selectedCompanyId) body.company_id = selectedCompanyId;
    try {
      if (mode === 'edit') {
        await update.mutateAsync(body);
      } else {
        await create.mutateAsync(body);
      }
      reset();
      onSaved();
    } catch {
      setFormError('Something went wrong. Please try again.');
    }
  }

  return (
    <FluidModal
      open={open}
      onClose={handleClose}
      title={mode === 'edit' ? 'Edit Contact' : 'Add New Contact'}
      subtitle={mode === 'edit' ? 'Update the details for this contact.' : 'Enter the details to create a new pipeline entry.'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Avatar name={`${firstName} ${lastName}`} size={96} />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <FluidInput value={firstName} onChange={setFirstName} placeholder="First name" />
          <FluidInput value={lastName} onChange={setLastName} placeholder="Last name" />
        </div>
        <FluidInput value={title} onChange={setTitle} placeholder="Title (e.g. Head of Product)" />
        <FluidInput value={email} onChange={setEmail} placeholder="Email" type="email" />
        <FluidInput value={phone} onChange={setPhone} placeholder="Phone" />
        <FluidSelect
          value={selectedCompanyId}
          onChange={setSelectedCompanyId}
          options={companyOptions}
          testId="contact-company-select"
        />
        <FluidSelect
          value={status}
          onChange={v => setStatus(v as ContactStatus)}
          options={STATUS_OPTIONS}
          testId="contact-status-select"
        />
        {formError ? (
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'var(--fl-error-container)', color: 'var(--fl-on-error-container)', fontSize: 13,
          }}>
            {formError}
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
          <FluidButton variant="ghost" onClick={handleClose}>Cancel</FluidButton>
          <FluidButton onClick={() => void submit()} disabled={isSaving || !email || !firstName}>
            {isSaving ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Create Contact'}
          </FluidButton>
        </div>
      </div>
    </FluidModal>
  );
}
