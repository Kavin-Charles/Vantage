'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface AdminChannel {
  id: string;
  name: string;
  type: 'channel' | 'dm' | 'group_dm';
  is_private: boolean;
  topic: string | null;
  archived_at: string | null;
  created_at: string;
  member_count: number;
}

function ChannelTypeBadge({ type, isPrivate }: { type: AdminChannel['type']; isPrivate: boolean }) {
  if (type === 'dm' || type === 'group_dm') {
    return (
      <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', borderRadius: 4, padding: '2px 6px' }}>
        DM
      </span>
    );
  }
  return (
    <span style={{ fontSize: 11, color: isPrivate ? 'var(--amber)' : 'var(--text3)', background: isPrivate ? 'var(--amber-bg)' : 'var(--surface2)', borderRadius: 4, padding: '2px 6px' }}>
      {isPrivate ? 'Private' : 'Public'}
    </span>
  );
}

export default function MessagingSettingsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['messaging-admin-channels'],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: AdminChannel[] }>('/api/messaging/channels?scope=all', { token });
    },
  });

  const archiveMut = useMutation({
    mutationFn: async (channelId: string) => {
      const token = await getToken();
      return apiFetch(`/api/messaging/channels/${channelId}`, { method: 'DELETE', token });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messaging-admin-channels'] }),
  });

  const channels = data?.data ?? [];
  const visible = showArchived ? channels : channels.filter(c => !c.archived_at);
  const publicChannels = channels.filter(c => c.type === 'channel' && !c.is_private && !c.archived_at);
  const privateChannels = channels.filter(c => c.type === 'channel' && c.is_private && !c.archived_at);
  const dmChannels = channels.filter(c => (c.type === 'dm' || c.type === 'group_dm') && !c.archived_at);
  const archivedCount = channels.filter(c => c.archived_at).length;

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, marginTop: 0, color: 'var(--text)' }}>
        Messaging
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24, marginTop: 0 }}>
        Manage workspace channels and messaging configuration.
      </p>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Public channels', value: publicChannels.length },
          { label: 'Private channels', value: privateChannels.length },
          { label: 'Direct messages', value: dmChannels.length },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'Instrument Serif, serif', color: 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Rate limit info */}
      <div style={{ background: 'var(--blue-bg)', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', marginBottom: 24, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 1, flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--blue)' }}>Rate limiting</div>
          <div style={{ fontSize: 12, color: 'var(--blue)', marginTop: 2, opacity: 0.85 }}>
            30 messages per 60 seconds per user. Exceeding this returns HTTP 429 and the frontend shows a cooldown indicator.
          </div>
        </div>
      </div>

      {/* Channel table */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Channels</h3>
        {archivedCount > 0 && (
          <button
            onClick={() => setShowArchived(v => !v)}
            style={{ fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
          >
            {showArchived ? 'Hide archived' : `Show ${archivedCount} archived`}
          </button>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No channels yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {['Name', 'Type', 'Members', 'Created', ''].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((ch, i) => (
                <tr
                  key={ch.id}
                  style={{ borderBottom: i < visible.length - 1 ? '1px solid var(--border)' : 'none', opacity: ch.archived_at ? 0.5 : 1 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                >
                  <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text)' }}>
                    <span style={{ color: 'var(--text3)', marginRight: 4 }}>#</span>
                    {ch.name}
                    {ch.archived_at && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', borderRadius: 4, padding: '1px 5px' }}>archived</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <ChannelTypeBadge type={ch.type} isPrivate={ch.is_private} />
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>{ch.member_count}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text3)', fontSize: 12 }}>
                    {new Date(ch.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    {!ch.archived_at && ch.type === 'channel' && (
                      <button
                        onClick={() => {
                          if (confirm(`Archive #${ch.name}? Members will no longer be able to send messages.`)) {
                            archiveMut.mutate(ch.id);
                          }
                        }}
                        disabled={archiveMut.isPending}
                        style={{ fontSize: 12, color: 'var(--text3)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                      >
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
