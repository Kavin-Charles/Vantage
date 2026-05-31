'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { type MailSocketEmail } from '@/hooks/useMailSocket';

const PER_PAGE = 50;

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset + fetch page 1 whenever filter changes
  const loadPage1 = useCallback(async () => {
    setLoading(true);
    setPage(1);
    try {
      const params = new URLSearchParams({ folder, per_page: String(PER_PAGE), page: '1' });
      if (accountId) params.set('account_id', accountId);
      if (search) params.set('q', search);
      const json = await apiFetch<{ data: Email[]; total: number }>(`/api/mail/emails?${params}`);
      const data = json.data ?? [];
      setEmails(data);
      setHasMore(json.total > data.length);
    } catch {
      setEmails([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [accountId, folder, search]);

  useEffect(() => { void loadPage1(); }, [loadPage1]);

  // Silent 60s refresh — only refreshes page 1, doesn't reset scroll
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const params = new URLSearchParams({ folder, per_page: String(PER_PAGE), page: '1' });
        if (accountId) params.set('account_id', accountId);
        if (search) params.set('q', search);
        const json = await apiFetch<{ data: Email[]; total: number }>(`/api/mail/emails?${params}`);
        const fresh = json.data ?? [];
        // Merge: replace page-1 slice, keep beyond-page-1 emails already loaded
        setEmails(prev => {
          const beyond = prev.slice(PER_PAGE);
          const merged = [...fresh, ...beyond.filter(e => !fresh.some(f => f.id === e.id))];
          return merged;
        });
        setHasMore(json.total > emails.length);
      } catch { /* silent */ }
    }, 60_000);
    return () => clearInterval(t);
  }, [accountId, folder, search, emails.length]);

  // Load next page
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const params = new URLSearchParams({ folder, per_page: String(PER_PAGE), page: String(nextPage) });
      if (accountId) params.set('account_id', accountId);
      if (search) params.set('q', search);
      const json = await apiFetch<{ data: Email[]; total: number }>(`/api/mail/emails?${params}`);
      const data = json.data ?? [];
      setEmails(prev => {
        const ids = new Set(prev.map(e => e.id));
        return [...prev, ...data.filter(e => !ids.has(e.id))];
      });
      setPage(nextPage);
      setHasMore(json.total > (emails.length + data.length));
    } catch { /* silent */ }
    finally { setLoadingMore(false); }
  }, [loadingMore, hasMore, page, accountId, folder, search, emails.length]);

  // Infinite scroll — trigger when 200px from bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      if (!el) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
        void loadMore();
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [loadMore]);

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13, padding: 32 }}>
      Loading…
    </div>
  );

  const visible = onlyStarred ? emails.filter(e => e.is_starred) : emails;

  if (!visible.length && !(prependEmails?.length)) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13, padding: 32 }}>
      No emails
    </div>
  );

  const prependVisible = (prependEmails ?? []).filter(
    pe => !visible.some(e => e.id === pe.id)
  );

  return (
    <div ref={scrollRef} style={{ overflowY: 'auto', height: '100%' }}>
      {prependVisible.map(socketEmail => {
        const email: Email = {
          id: socketEmail.id,
          subject: socketEmail.subject,
          from_name: socketEmail.from_name,
          from_address: socketEmail.from_address,
          snippet: null,
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
      {loadingMore && (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
          Loading more…
        </div>
      )}
      {!hasMore && visible.length > 0 && (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>
          — end —
        </div>
      )}
    </div>
  );
}
