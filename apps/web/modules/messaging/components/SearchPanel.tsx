'use client';

import { useState, useCallback } from 'react';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { searchMessages } from '../lib/messaging';
import type { Message } from '@vencore/types';

interface SearchResult extends Omit<Message, 'reactions' | 'attachments'> {
  author_name: string;
  channel_name: string;
  snippet: string;
}

interface Props {
  onClose: () => void;
  onJump?: (channelId: string, messageId: string) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function SearchPanel({ onClose, onJump }: Props) {
  const getToken = useApiToken();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await searchMessages(token, query.trim());
      setResults((res.data ?? []) as unknown as SearchResult[]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void search(q);
    if (e.key === 'Escape') onClose();
  };

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 380,
      background: 'var(--surface)', borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', zIndex: 30,
      boxShadow: '-4px 0 16px rgba(0,0,0,.06)',
    }}>
      {/* Header */}
      <div style={{
        padding: '0 16px', height: 52, flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Icon name="search" size={15} />
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search messages…"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 14, color: 'var(--text)', fontFamily: 'inherit',
          }}
        />
        <button
          onClick={onClose}
          style={{
            width: 28, height: 28, borderRadius: 8, background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="x" size={15} />
        </button>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Searching…</div>
        )}

        {!loading && searched && results.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No results for &ldquo;{q}&rdquo;
          </div>
        )}

        {!loading && results.map(r => (
          <button
            key={r.id}
            onClick={() => onJump?.(r.channel_id, r.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '12px 16px',
              background: 'none', border: 'none', borderBottom: '1px solid var(--border)',
              cursor: onJump ? 'pointer' : 'default',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>
                #{r.channel_name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>·</span>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{r.author_name}</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 'auto' }}>{formatTime(r.created_at)}</span>
            </div>
            {r.snippet ? (
              <div
                style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.snippet) }}
              />
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{r.body}</div>
            )}
          </button>
        ))}

        {!searched && !loading && (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>
              Type a phrase and press <b>Enter</b> to search
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function sanitizeSnippet(html: string): string {
  // PostgreSQL ts_headline wraps matches in <b> tags — allow only <b> and </b>
  return html.replace(/<(?!\/?b>)[^>]+>/g, '');
}
