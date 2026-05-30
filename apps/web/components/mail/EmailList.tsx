'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { type MailSocketEmail } from '@/hooks/useMailSocket';

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
  prependEmails?: MailSocketEmail[];
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

function EmailItem({ email, selected, onSelect }: { email: Email; selected: boolean; onSelect: (e: Email) => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={() => onSelect(email)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '12px 16px', cursor: 'pointer',
        borderBottom: '1px solid var(--border)',
        background: selected ? 'var(--surface2)' : hover ? 'var(--bg)' : 'var(--surface)',
        transition: 'background .1s',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{
          fontSize: 13, fontWeight: email.is_read ? 400 : 600,
          color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180,
        }}>
          {email.from_name ?? email.from_address}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{relativeTime(email.sent_at)}</span>
      </div>
      <div style={{
        fontSize: 12, fontWeight: email.is_read ? 400 : 500,
        color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {email.subject ?? '(no subject)'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
        {email.snippet}
      </div>
      {!email.is_read && (
        <span style={{
          position: 'absolute', top: 14, right: 16,
          width: 7, height: 7, borderRadius: '50%', background: 'var(--text)',
          display: 'inline-block',
        }} />
      )}
    </div>
  );
}

export function EmailList({ accountId, folder, search, selectedId, onlyStarred, prependEmails, onSelect }: Props) {
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
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {(prependEmails ?? []).map(socketEmail => {
        const email: Email = {
          id: socketEmail.id,
          subject: socketEmail.subject,
          from_name: socketEmail.from_name,
          from_address: socketEmail.from_address,
          snippet: socketEmail.body_text ? socketEmail.body_text.slice(0, 120) : null,
          sent_at: socketEmail.sent_at,
          is_read: socketEmail.is_read,
          is_starred: socketEmail.is_starred,
          contact_id: socketEmail.contact_id,
          folder: socketEmail.folder,
        };
        return (
          <div key={socketEmail.id} style={{ animation: 'slideDown 200ms ease-out' }}>
            <EmailItem
              email={email}
              selected={selectedId === email.id}
              onSelect={onSelect}
            />
          </div>
        );
      })}
      {visible.map(email => (
        <EmailItem
          key={email.id}
          email={email}
          selected={selectedId === email.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
