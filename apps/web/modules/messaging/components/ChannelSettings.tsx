'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  getChannel, updateChannel, archiveChannel,
  addChannelMember, removeChannelMember, listWorkspaceMembers,
} from '../lib/messaging';

interface Props {
  channelId: string;
  onClose: () => void;
}

export function ChannelSettings({ channelId, onClose }: Props) {
  const getToken = useApiToken();
  const { user, hasPermission } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const [editName, setEditName] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [editingInfo, setEditingInfo] = useState(false);
  const [inviteUserId, setInviteUserId] = useState('');

  const { data: channel, refetch: refetchChannel } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return null;
      const res = await getChannel(token, channelId);
      return res.data;
    },
    staleTime: 30_000,
  });

  const { data: workspaceMembers = [] } = useQuery({
    queryKey: ['workspace-members'],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return [];
      const res = await listWorkspaceMembers(token);
      return res.data ?? [];
    },
    staleTime: 120_000,
  });

  const memberIds = new Set((channel?.members ?? []).map(m => m.user_id));
  const inviteable = workspaceMembers.filter(m => !memberIds.has(m.id));

  const saveInfo = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) return;
      await updateChannel(token, channelId, {
        name: editName.trim() || undefined,
        topic: editTopic.trim() || null,
      });
    },
    onSuccess: () => {
      setEditingInfo(false);
      void refetchChannel();
      void qc.invalidateQueries({ queryKey: ['channels'] });
    },
  });

  const invite = useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      if (!token) return;
      await addChannelMember(token, channelId, userId);
    },
    onSuccess: () => {
      setInviteUserId('');
      void refetchChannel();
    },
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      if (!token) return;
      await removeChannelMember(token, channelId, userId);
    },
    onSuccess: () => void refetchChannel(),
  });

  const leave = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const token = await getToken();
      if (!token) return;
      await removeChannelMember(token, channelId, user.id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['channels'] });
      router.push('/messaging');
    },
  });

  const archive = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) return;
      await archiveChannel(token, channelId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['channels'] });
      router.push('/messaging');
    },
  });

  const isAdmin = hasPermission('messaging:manage');

  return (
    <div style={{
      width: 360, borderLeft: '1px solid var(--border)',
      background: 'var(--surface)', display: 'flex', flexDirection: 'column',
      height: '100%', flexShrink: 0, overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        padding: '0 16px', height: 52, flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Channel Settings</span>
        <button onClick={onClose} style={iconBtnStyle}>
          <Icon name="x" size={15} />
        </button>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Info section */}
        <section>
          <SectionTitle label="Channel info" />
          {editingInfo ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Topic</label>
                <input
                  value={editTopic}
                  onChange={e => setEditTopic(e.target.value)}
                  placeholder="What's this channel about?"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => saveInfo.mutate()}
                  disabled={saveInfo.isPending}
                  style={primaryBtnStyle(saveInfo.isPending)}
                >
                  {saveInfo.isPending ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingInfo(false)} style={ghostBtnStyle}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
                    #{channel?.name ?? '…'}
                  </div>
                  {channel?.topic && (
                    <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 2 }}>{channel.topic}</div>
                  )}
                  {!channel?.topic && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, fontStyle: 'italic' }}>No topic set</div>
                  )}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => { setEditName(channel?.name ?? ''); setEditTopic(channel?.topic ?? ''); setEditingInfo(true); }}
                    style={iconBtnStyle}
                    title="Edit"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Members section */}
        <section>
          <SectionTitle label={`Members (${channel?.members?.length ?? 0})`} />

          {/* Invite */}
          {isAdmin && inviteable.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <select
                value={inviteUserId}
                onChange={e => setInviteUserId(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              >
                <option value="">Add member…</option>
                {inviteable.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                ))}
              </select>
              <button
                onClick={() => { if (inviteUserId) invite.mutate(inviteUserId); }}
                disabled={!inviteUserId || invite.isPending}
                style={primaryBtnStyle(!inviteUserId || invite.isPending)}
              >
                Add
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(channel?.members ?? []).map(m => (
              <div key={m.user_id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 8px', borderRadius: 8,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, color: 'var(--text2)', flexShrink: 0,
                }}>
                  {m.name[0]?.toUpperCase() ?? '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {m.name}
                    {m.role === 'owner' && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>
                        owner
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.email}</div>
                </div>
                {isAdmin && m.user_id !== user?.id && m.role !== 'owner' && (
                  <button
                    onClick={() => removeMember.mutate(m.user_id)}
                    style={iconBtnStyle}
                    title="Remove from channel"
                  >
                    <Icon name="x" size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <SectionTitle label="Actions" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => { if (confirm('Leave this channel?')) leave.mutate(); }}
              style={dangerBtnStyle}
            >
              Leave channel
            </button>
            {isAdmin && (
              <button
                onClick={() => { if (confirm('Archive this channel? Members will lose access.')) archive.mutate(); }}
                style={{ ...dangerBtnStyle, opacity: 0.7 }}
              >
                Archive channel
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: 'var(--text3)',
      textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10,
    }}>
      {label}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid var(--border)',
  borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
  outline: 'none', boxSizing: 'border-box',
};
const primaryBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '7px 14px', border: 'none', borderRadius: 8,
  background: disabled ? 'var(--border)' : 'var(--text)',
  color: disabled ? 'var(--text3)' : '#fff',
  cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12.5, fontWeight: 500,
  whiteSpace: 'nowrap' as const,
});
const ghostBtnStyle: React.CSSProperties = {
  padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: 'var(--text2)',
};
const iconBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8, background: 'none', border: 'none',
  cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const dangerBtnStyle: React.CSSProperties = {
  padding: '8px 14px', border: '1px solid var(--red)', borderRadius: 8,
  background: 'transparent', cursor: 'pointer', fontSize: 13,
  color: 'var(--red)', fontWeight: 500, textAlign: 'left' as const,
};
