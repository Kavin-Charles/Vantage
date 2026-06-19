'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { Modal } from '@/modules/shared/components/ui/Modal';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listChannels, createChannel } from '../lib/messaging';
import type { Channel, Message } from '@vencore/types';

type ChannelWithMeta = Channel & { unread_count: number; last_message: Message | null };

export function ChannelSidebar() {
  const getToken = useApiToken();
  const router = useRouter();
  const params = useParams();
  const activeId = params?.['channelId'] as string | undefined;
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newPrivate, setNewPrivate] = useState(false);

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return [];
      const res = await listChannels(token);
      return res.data ?? [];
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token || !newName.trim()) return;
      await createChannel(token, { name: newName.trim(), topic: newTopic.trim() || undefined, is_private: newPrivate });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['channels'] });
      setShowCreate(false);
      setNewName('');
      setNewTopic('');
      setNewPrivate(false);
    },
  });

  const regular = channels.filter(c => c.type === 'channel');
  const dms = channels.filter(c => c.type === 'dm' || c.type === 'group_dm');

  return (
    <div style={{
      width: 240, background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100%', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 14px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Messaging</span>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            width: 26, height: 26, borderRadius: 8,
            background: 'none', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text2)',
          }}
          title="New channel"
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      <div style={{ flex: 1, padding: '8px 8px' }}>
        {/* Channels */}
        <SectionLabel label="Channels" />
        {regular.map(ch => (
          <ChannelRow
            key={ch.id}
            channel={ch}
            active={activeId === ch.id}
            onClick={() => router.push(`/messaging/${ch.id}`)}
          />
        ))}
        {regular.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 10px' }}>No channels yet</div>
        )}

        {/* DMs */}
        {dms.length > 0 && (
          <>
            <SectionLabel label="Direct Messages" />
            {dms.map(ch => (
              <ChannelRow
                key={ch.id}
                channel={ch}
                active={activeId === ch.id}
                onClick={() => router.push(`/messaging/${ch.id}`)}
                isDm
              />
            ))}
          </>
        )}
      </div>

      {/* Create Channel Modal */}
      {showCreate && (
        <Modal title="New Channel" onClose={() => setShowCreate(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Channel name</label>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. general"
                style={inputStyle}
                onKeyDown={e => { if (e.key === 'Enter') create.mutate(); }}
              />
            </div>
            <div>
              <label style={labelStyle}>Topic (optional)</label>
              <input
                value={newTopic}
                onChange={e => setNewTopic(e.target.value)}
                placeholder="What's this channel about?"
                style={inputStyle}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={newPrivate} onChange={e => setNewPrivate(e.target.checked)} />
              Private channel
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={() => create.mutate()}
                disabled={!newName.trim() || create.isPending}
                style={primaryBtnStyle(create.isPending || !newName.trim())}
              >
                {create.isPending ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, color: 'var(--text3)',
      textTransform: 'uppercase', letterSpacing: 1.2,
      padding: '10px 10px 4px',
    }}>
      {label}
    </div>
  );
}

function ChannelRow({
  channel, active, onClick, isDm,
}: {
  channel: ChannelWithMeta;
  active: boolean;
  onClick: () => void;
  isDm?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const bg = active ? 'var(--text)' : hover ? 'var(--surface2)' : 'transparent';
  const fg = active ? '#fff' : 'var(--text2)';
  const hasUnread = (channel.unread_count ?? 0) > 0;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '6px 10px', borderRadius: 8,
        background: bg, border: 'none', cursor: 'pointer',
        color: fg, fontSize: 13.5, fontWeight: hasUnread && !active ? 600 : 400,
        textAlign: 'left', marginBottom: 1, transition: 'all .12s',
      }}
    >
      <span style={{ fontSize: 13, opacity: active ? 1 : 0.65, flexShrink: 0 }}>
        {isDm ? '●' : channel.is_private ? <Icon name="lock" size={13} /> : '#'}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {channel.name}
      </span>
      {hasUnread && !active && (
        <span style={{
          background: 'var(--text)', color: '#fff',
          borderRadius: 10, fontSize: 10, fontWeight: 700,
          padding: '1px 6px', flexShrink: 0,
        }}>
          {channel.unread_count > 99 ? '99+' : channel.unread_count}
        </span>
      )}
    </button>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
  borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
  outline: 'none', boxSizing: 'border-box',
};
const cancelBtnStyle: React.CSSProperties = {
  padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text2)',
};
const primaryBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '7px 18px', border: 'none', borderRadius: 8,
  background: disabled ? 'var(--border)' : 'var(--text)',
  color: disabled ? 'var(--text3)' : '#fff',
  cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500,
});
