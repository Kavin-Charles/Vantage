'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/modules/shared/components/Topbar';
import { Button } from '@/modules/shared/components/ui/Button';
import { Modal } from '@/modules/shared/components/ui/Modal';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import { CompanyForm } from '@/modules/crm/companies/components/CompanyForm';
import { CsvImportExport } from '@/modules/shared/components/CsvImportExport';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listCompanies } from '@/modules/crm/companies/lib/companies';
import type { Company } from '@vencore/types';

const COLS = '1.6fr 1.2fr 1.2fr 1fr 1.4fr auto';

const eyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1.4,
};

export default function CompaniesPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<'create' | Company | null>(null);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const { data, isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => listCompanies(await getToken()),
  });

  const companies = data?.data ?? [];

  return (
    <ModuleGuard moduleId="crm">
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
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>{data?.total ?? 0} companies</div>

        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '11px 18px', borderBottom: '1px solid var(--border)', gap: 14, alignItems: 'center' }}>
            {['Company', 'Industry', 'Location', 'Employees', 'Website'].map(h => (
              <span key={h} style={eyebrow}>{h}</span>
            ))}
            <span />
          </div>

          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
          ) : companies.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No companies yet.</div>
          ) : companies.map((c, i) => (
            <CompanyRow
              key={c.id}
              company={c}
              last={i === companies.length - 1}
              onEdit={() => setModal(c)}
              onContextMenu={(e) => {
                const items: ContextMenuItem[] = [
                  { icon: 'open', label: 'Edit company', onClick: () => setModal(c) },
                  { type: 'separator' },
                  { icon: 'copy', label: 'Copy name',    onClick: () => navigator.clipboard.writeText(c.name) },
                  { icon: 'globe', label: 'Copy website', disabled: !c.website, onClick: () => navigator.clipboard.writeText(c.website ?? '') },
                  { icon: 'link',  label: 'Copy link',   onClick: () => navigator.clipboard.writeText(`${window.location.origin}/crm/companies/${c.id}`) },
                ];
                openMenu(e, items);
              }}
            />
          ))}
        </div>

        <ContextMenu menu={menu} onClose={closeMenu} />

        {modal && (
          <Modal title={modal === 'create' ? 'Add company' : `Edit ${(modal as Company).name}`} onClose={() => setModal(null)}>
            <CompanyForm company={modal === 'create' ? undefined : modal as Company} onDone={() => setModal(null)} />
          </Modal>
        )}
      </div>
    </ModuleGuard>
  );
}

function CompanyRow({ company: c, last, onEdit, onContextMenu }: {
  company: Company; last: boolean; onEdit: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={onContextMenu}
      style={{
        display: 'grid', gridTemplateColumns: COLS,
        gap: 14, alignItems: 'center',
        padding: '12px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s', fontSize: 13,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, color: 'var(--text2)',
        }}>
          <Icon name="companies" size={15} />
        </div>
        <span style={{ fontWeight: 500, color: 'var(--text)' }}>{c.name}</span>
      </span>
      <span style={{ color: 'var(--text2)' }}>{c.industry ?? '—'}</span>
      <span style={{ color: 'var(--text2)' }}>{c.location ?? '—'}</span>
      <span style={{ color: 'var(--text2)' }}>{c.employee_count ?? '—'}</span>
      <span>
        {c.website ? (
          <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer"
            style={{ color: 'var(--text2)', textDecoration: 'underline', textDecorationColor: 'var(--border)', textUnderlineOffset: 3, fontSize: 13 }}>
            {c.website}
          </a>
        ) : <span style={{ color: 'var(--text3)' }}>—</span>}
      </span>
      <span>
        <Button onClick={onEdit} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12 }}>Edit</Button>
      </span>
    </div>
  );
}
