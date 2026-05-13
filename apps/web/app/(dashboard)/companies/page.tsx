'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CompanyForm } from '@/components/companies/CompanyForm';
import { CsvImportExport } from '@/components/CsvImportExport';
import { useApiToken } from '@/lib/useApiToken';
import { listCompanies } from '@/lib/companies';
import type { Company } from '@vantage/types';

const th: React.CSSProperties = { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)' };
const td: React.CSSProperties = { padding: '12px 16px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };

export default function CompaniesPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<'create' | Company | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => listCompanies(await getToken()),
  });

  const companies = data?.data ?? [];

  return (
    <>
      <Topbar
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <CsvImportExport
              resource="companies"
              filename="companies.csv"
              templateHeaders={['name', 'industry', 'location', 'employee_count', 'website']}
              onImported={() => qc.invalidateQueries({ queryKey: ['companies'] })}
            />
            <Button variant="primary" onClick={() => setModal('create')}>+ Add Company</Button>
          </div>
        }
      />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{data?.total ?? 0} companies</span>
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Company</th>
                <th style={th}>Industry</th>
                <th style={th}>Location</th>
                <th style={th}>Employees</th>
                <th style={th}>Website</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>Loading…</td></tr>
              ) : companies.length === 0 ? (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>No companies yet.</td></tr>
              ) : companies.map(c => (
                <tr key={c.id} onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={td}><span style={{ fontWeight: 500 }}>{c.name}</span></td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{c.industry ?? '—'}</td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{c.location ?? '—'}</td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{c.employee_count ?? '—'}</td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{c.website ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Button onClick={() => setModal(c)}>Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {modal && (
          <Modal title={modal === 'create' ? 'Add company' : `Edit ${(modal as Company).name}`} onClose={() => setModal(null)}>
            <CompanyForm company={modal === 'create' ? undefined : modal as Company} onDone={() => setModal(null)} />
          </Modal>
        )}
      </div>
    </>
  );
}
