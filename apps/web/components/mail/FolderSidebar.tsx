'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Account { id: string; email: string; provider: string; }
type Folder = 'inbox' | 'sent' | 'starred' | 'trash';

interface Props {
  selectedAccount: string | null;
  selectedFolder: Folder;
  onAccountChange: (id: string | null) => void;
  onFolderChange: (folder: Folder) => void;
  onCompose: () => void;
}

const FOLDERS: { key: Folder; label: string }[] = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'sent', label: 'Sent' },
  { key: 'starred', label: 'Starred' },
  { key: 'trash', label: 'Trash' },
];

export function FolderSidebar({ selectedAccount, selectedFolder, onAccountChange, onFolderChange, onCompose }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    void apiFetch<{ data: Account[] }>('/api/mail/accounts')
      .then(j => setAccounts(j.data ?? []))
      .catch(() => setAccounts([]));
  }, []);

  const linkStyle = (active: boolean): React.CSSProperties => ({
    display: 'block', padding: '7px 12px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
    background: active ? 'var(--surface2)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text2)', fontWeight: active ? 500 : 400,
    border: 'none', width: '100%', textAlign: 'left',
  });

  return (
    <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        onClick={onCompose}
        style={{ marginBottom: 12, padding: '8px 0', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', width: '100%' }}
      >
        + Compose
      </button>

      {accounts.length > 1 && (
        <select
          value={selectedAccount ?? ''}
          onChange={e => onAccountChange(e.target.value || null)}
          style={{ marginBottom: 8, padding: '6px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', width: '100%' }}
        >
          <option value="">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
        </select>
      )}

      {FOLDERS.map(f => (
        <button key={f.key} style={linkStyle(selectedFolder === f.key)} onClick={() => onFolderChange(f.key)}>
          {f.label}
        </button>
      ))}

      {accounts.length === 0 && (
        <a href="/settings/mail" style={{ fontSize: 12, color: 'var(--text3)', marginTop: 'auto', textDecoration: 'none' }}>
          + Connect account
        </a>
      )}
    </div>
  );
}
