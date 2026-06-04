'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { Button } from '@/modules/shared/components/ui/Button';
import { Modal } from '@/modules/shared/components/ui/Modal';
import { ContactForm } from './ContactForm';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listContacts, deleteContact } from '@/modules/contacts/lib/contacts';
import { PluginPanelSlot } from '@/modules/shared/components/PluginPanelSlot';
import type { Contact } from '@vencore/types';

const COLS = '1.6fr 1.6fr 1.1fr .9fr 1fr auto';

const eyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1.4,
};

export function ContactsTable() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<'create' | Contact | null>(null);
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => listContacts(await getToken()),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteContact(await getToken(), id),
    onMutate: (id) => setRemoving(s => new Set(s).add(id)),
    onSuccess: (_, id) => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ['contacts'] }), 220);
      setTimeout(() => setRemoving(s => { const n = new Set(s); n.delete(id); return n; }), 220);
    },
  });

  const contacts = data?.data ?? [];

  if (isLoading) return <div style={{ padding: 24, color: 'var(--text3)' }}>Loading…</div>;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>{data?.total ?? 0} contacts</span>
        <Button variant="primary" onClick={() => setModal('create')}>+ Add Contact</Button>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '11px 18px', borderBottom: '1px solid var(--border)', gap: 14, alignItems: 'center' }}>
          {['Name', 'Email', 'Phone', 'Status', 'Last contacted'].map(h => (
            <span key={h} style={eyebrow}>{h}</span>
          ))}
          <span />
        </div>

        {contacts.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No contacts yet. Add your first one.
          </div>
        ) : contacts.map((c, i) => (
          <ContactRow
            key={c.id}
            c={c}
            last={i === contacts.length - 1}
            fading={removing.has(c.id)}
            onEdit={() => setModal(c)}
            onDelete={() => { if (confirm(`Delete ${c.name}?`)) deleteMut.mutate(c.id); }}
          />
        ))}
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
          {modal !== 'create' && (modal as Contact).id && (
            <PluginPanelSlot recordType="contact" recordId={(modal as Contact).id} />
          )}
        </Modal>
      )}
    </>
  );
}

function ContactRow({ c, last, fading, onEdit, onDelete }: {
  c: Contact; last: boolean; fading: boolean;
  onEdit: () => void; onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: COLS,
        gap: 14, alignItems: 'center',
        padding: '12px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        opacity: fading ? 0 : 1,
        transition: 'opacity .2s, background .15s',
        fontSize: 13,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--text)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, flexShrink: 0,
        }}>
          {c.name.charAt(0).toUpperCase()}
        </div>
        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{c.name}</span>
      </span>
      <span style={{ color: 'var(--text)' }}>{c.email}</span>
      <span style={{ color: c.phone ? 'var(--text)' : 'var(--text3)' }}>{c.phone ?? '—'}</span>
      <span><Badge label={c.status} color={statusColor[c.status] ?? 'gray'} /></span>
      <span style={{ color: 'var(--text2)' }}>
        {c.last_contacted_at ? new Date(c.last_contacted_at).toLocaleDateString() : '—'}
      </span>
      <span style={{ display: 'flex', gap: 6 }}>
        <Button onClick={onEdit} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12 }}>Edit</Button>
        <Button variant="danger" onClick={onDelete} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12 }}>Delete</Button>
      </span>
    </div>
  );
}
