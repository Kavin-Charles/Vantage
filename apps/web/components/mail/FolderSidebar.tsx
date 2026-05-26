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
  { key: 'inbox',   label: 'Inbox'   },
  { key: 'sent',    label: 'Sent'    },
  { key: 'starred', label: 'Starred' },
  { key: 'trash',   label: 'Trash'   },
];

export function FolderSidebar({ selectedAccount, selectedFolder, onAccountChange, onFolderChange, onCompose }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [hover, setHover] = useState<Folder | null>(null);

  useEffect(() => {
    void apiFetch<{ data: Account[] }>('/api/mail/accounts')
      .then(j => setAccounts(j.data ?? []))
      .catch(() => setAccounts([]));
  }, []);

  return (
    <div style={{
      width: 200, flexShrink: 0,
      borderRight: '1px solid var(--border)',
      padding: '16px 12px',
      display: 'flex', flexDirection: 'column', gap: 2,
      background: 'var(--surface)',
    }}>
      <button
        onClick={onCompose}
        style={{
          marginBottom: 14, padding: '8px 0',
          background: 'var(--text)', color: '#fff',
          border: 'none', borderRadius: 10,
          fontSize: 13, fontWeight: 500,
          cursor: 'pointer', width: '100%',
          fontFamily: 'var(--font-sans)',
        }}
      >
        + Compose
      </button>

      {accounts.length > 1 && (
        <select
          value={selectedAccount ?? ''}
          onChange={e => onAccountChange(e.target.value || null)}
          style={{
            marginBottom: 10, padding: '6px 8px',
            fontSize: 12, border: '1px solid var(--border)',
            borderRadius: 8, background: 'var(--surface)',
            color: 'var(--text)', width: '100%',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <option value="">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
        </select>
      )}

      {FOLDERS.map(f => {
        const active = selectedFolder === f.key;
        const isHovered = hover === f.key;
        return (
          <button
            key={f.key}
            onClick={() => onFolderChange(f.key)}
            onMouseEnter={() => setHover(f.key)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: 'block', padding: '8px 10px', borderRadius: 10,
              fontSize: 13, cursor: 'pointer', border: 'none', width: '100%', textAlign: 'left',
              background: active ? 'var(--text)' : isHovered ? 'var(--surface2)' : 'transparent',
              color: active ? '#fff' : isHovered ? 'var(--text)' : 'var(--text2)',
              fontWeight: active ? 500 : 400,
              fontFamily: 'var(--font-sans)',
              transition: 'all .12s',
            }}
          >
            {f.label}
          </button>
        );
      })}

      {accounts.length === 0 && (
        <a
          href="/settings/mail"
          style={{
            fontSize: 12, color: 'var(--text3)',
            marginTop: 'auto', textDecoration: 'none',
            padding: '6px 10px',
          }}
        >
          + Connect account
        </a>
      )}
    </div>
  );
}
