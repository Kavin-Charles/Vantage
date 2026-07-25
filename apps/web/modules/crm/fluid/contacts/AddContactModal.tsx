'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FluidModal, FluidInput, FluidButton, FluidSelect, Avatar } from '@/modules/shared/fluid/ui';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { createContact } from '@/modules/crm/contacts/lib/contacts';
import { listCompanies } from '@/modules/crm/companies/lib/companies';
import type { Contact } from '@vencore/types';

export function AddContactModal({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

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

  function reset() {
    setFirstName('');
    setLastName('');
    setTitle('');
    setEmail('');
    setPhone('');
    setCompanyId('');
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
    const body: Partial<Contact> = { name, email: email.trim().toLowerCase() };
    if (title.trim()) body.title = title.trim();
    if (phone.trim()) body.phone = phone.trim();
    if (companyId) body.company_id = companyId;
    try {
      await create.mutateAsync(body);
      reset();
      onCreated();
    } catch {
      setFormError('Something went wrong. Please try again.');
    }
  }

  return (
    <FluidModal
      open={open}
      onClose={handleClose}
      title="Add New Contact"
      subtitle="Enter the details to create a new pipeline entry."
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
        <FluidSelect value={companyId} onChange={setCompanyId} options={companyOptions} />
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
          <FluidButton onClick={() => void submit()} disabled={create.isPending || !email || !firstName}>
            {create.isPending ? 'Creating…' : 'Create Contact'}
          </FluidButton>
        </div>
      </div>
    </FluidModal>
  );
}
