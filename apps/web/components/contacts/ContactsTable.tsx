'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, statusColor } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ContactForm } from './ContactForm';
import { useApiToken } from '@/lib/useApiToken';
import { listContacts, deleteContact } from '@/lib/contacts';
import type { Contact } from '@vantage/types';

const th: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text3)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 13,
  color: 'var(--text)',
  borderBottom: '1px solid var(--border)',
};

export function ContactsTable() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<'create' | Contact | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => {
      const token = await getToken();
      return listContacts(token);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      await deleteContact(token, id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });

  const contacts = data?.data ?? [];

  if (isLoading) {
    return <div style={{ padding: 24, color: 'var(--text3)' }}>Loading…</div>;
  }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{data?.total ?? 0} contacts</span>
        </div>
        <Button variant="primary" onClick={() => setModal('create')}>+ Add Contact</Button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Email</th>
              <th style={th}>Phone</th>
              <th style={th}>Status</th>
              <th style={th}>Last contacted</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>
                  No contacts yet. Add your first one.
                </td>
              </tr>
            ) : contacts.map(c => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'var(--text)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 600, flexShrink: 0,
                    }}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                  </div>
                </td>
                <td style={{ ...td, color: 'var(--text2)' }}>{c.email}</td>
                <td style={{ ...td, color: 'var(--text2)' }}>{c.phone ?? '—'}</td>
                <td style={td}>
                  <Badge label={c.status} color={statusColor[c.status] ?? 'gray'} />
                </td>
                <td style={{ ...td, color: 'var(--text2)' }}>
                  {c.last_contacted_at ? new Date(c.last_contacted_at).toLocaleDateString() : '—'}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Button onClick={() => setModal(c)}>Edit</Button>
                    <Button
                      variant="danger"
                      onClick={() => { if (confirm(`Delete ${c.name}?`)) deleteMut.mutate(c.id); }}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal === 'create' ? 'Add contact' : `Edit ${(modal as Contact).name}`}
          onClose={() => setModal(null)}
        >
          <ContactForm
            contact={modal === 'create' ? undefined : modal as Contact}
            onDone={() => setModal(null)}
          />
        </Modal>
      )}
    </>
  );
}
