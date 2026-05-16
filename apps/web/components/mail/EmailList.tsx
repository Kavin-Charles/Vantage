'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

interface Email {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string;
  snippet: string | null;
  sent_at: string;
  is_read: boolean;
  is_starred: boolean;
  contact_id: string | null;
  folder: string;
}

interface Props {
  accountId: string | null;
  folder: string;
  search: string;
  selectedId: string | null;
  onlyStarred?: boolean;
  onSelect: (email: Email) => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function EmailList({ accountId, folder, search, selectedId, onlyStarred, onSelect }: Props) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ folder, per_page: '50' });
      if (accountId) params.set('account_id', accountId);
      if (search) params.set('q', search);
      const json = await apiFetch<{ data: Email[] }>(`/api/mail/emails?${params}`);
      setEmails(json.data ?? []);
    } catch {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, folder, search]);

  useEffect(() => { void load(); }, [load]);

  // Re-fetch every 60s so new incoming emails appear without manual refresh
  useEffect(() => {
    const t = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13, padding: 32 }}>
      Loading…
    </div>
  );
  const visible = onlyStarred ? emails.filter(e => e.is_starred) : emails;

  if (!visible.length) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13, padding: 32 }}>
      No emails
    </div>
  );

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      {visible.map(email => (
        <div
          key={email.id}
          onClick={() => onSelect(email)}
          style={{
            padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
            background: selectedId === email.id ? 'var(--surface2)' : 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: email.is_read ? 400 : 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
              {email.from_name ?? email.from_address}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{relativeTime(email.sent_at)}</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: email.is_read ? 400 : 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {email.subject ?? '(no subject)'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
            {email.snippet}
          </div>
          {!email.is_read && (
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text)', marginTop: 4 }} />
          )}
        </div>
      ))}
    </div>
  );
}
