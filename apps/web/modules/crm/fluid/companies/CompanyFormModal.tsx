'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FluidModal, FluidInput, FluidButton } from '@/modules/shared/fluid/ui';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { createCompany, updateCompany } from '@/modules/crm/companies/lib/companies';
import type { Company } from '@vencore/types';

export function CompanyFormModal({
  open, mode, initial, onClose, onSaved,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: Partial<Company>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [industry, setIndustry] = useState(initial?.industry ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [employeeCount, setEmployeeCount] = useState(
    initial?.employee_count != null ? String(initial.employee_count) : '',
  );
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (body: Partial<Company>) => {
      const token = await getToken();
      if (mode === 'edit' && initial?.id) {
        return updateCompany(token, initial.id, body);
      }
      return createCompany(token, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  });

  function reset() {
    setName(initial?.name ?? '');
    setIndustry(initial?.industry ?? '');
    setLocation(initial?.location ?? '');
    setWebsite(initial?.website ?? '');
    setEmployeeCount(initial?.employee_count != null ? String(initial.employee_count) : '');
    setFormError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function submit() {
    if (!name.trim()) return;
    setFormError(null);
    const body: Partial<Company> = { name: name.trim() };
    if (industry.trim()) body.industry = industry.trim();
    if (location.trim()) body.location = location.trim();
    if (website.trim()) body.website = website.trim();
    const parsedCount = parseInt(employeeCount, 10);
    if (employeeCount.trim() && !Number.isNaN(parsedCount) && parsedCount >= 0) {
      body.employee_count = parsedCount;
    }
    try {
      await save.mutateAsync(body);
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
      title={mode === 'edit' ? 'Edit Company' : 'Add New Company'}
      subtitle={mode === 'edit' ? 'Update the company details.' : 'Enter the details to create a new company.'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FluidInput value={name} onChange={setName} placeholder="Company name" />
        <FluidInput value={industry} onChange={setIndustry} placeholder="Industry" />
        <FluidInput value={location} onChange={setLocation} placeholder="Location" />
        <FluidInput value={website} onChange={setWebsite} placeholder="Website" />
        <FluidInput value={employeeCount} onChange={setEmployeeCount} placeholder="Employee count" type="number" />
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
          <FluidButton onClick={() => void submit()} disabled={save.isPending || !name.trim()}>
            {save.isPending ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Create Company'}
          </FluidButton>
        </div>
      </div>
    </FluidModal>
  );
}
