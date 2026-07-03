'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getThread, sendMessage, addReaction, removeReaction, deleteMessage } from '../lib/messaging';
import type { Message } from '@vencore/types';

interface Props {
  parentMessage: Message;
  currentUserId: string;
  onClose: () => void;
}

export function ThreadPanel({ parentMessage, currentUserId, onClose }: Props) {
  const getToken = useApiToken();

  const { data: replies = [], refetch } = useQuery({
    queryKey: ['thread', parentMessage.id],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return [];
      const res = await getThread(token, parentMessage.id);
      return res.data ?? [];
    },
    refetchInterval: 10_000,
  });

  const send = useMutation({
    mutationFn: async (body: string) => {
      const token = await getToken();
      if (!token) return;
      await sendMessage(token, parentMessage.channel_id, { body, parent_message_id: parentMessage.id });
    },
    onSuccess: () => { void refetch(); },
  });

  const react = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const token = await getToken();
      if (!token) return;
      await addReaction(token, messageId, emoji);
      void refetch();
    },
  });

  const unreact = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const token = await getToken();
      if (!token) return;
      await removeReaction(token, messageId, emoji);
      void refetch();
    },
  });

  const remove = useMutation({
    mutationFn: async (messageId: string) => {
      const token = await getToken();
      if (!token) return;
      await deleteMessage(token, messageId);
      void refetch();
    },
  });

  return (
    <div style={{
      width: 360, borderLeft: '1px solid var(--border)',
      background: 'var(--surface)', display: 'flex', flexDirection: 'column',
      height: '100%', flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '0 16px', height: 52,
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Thread</span>
        <button
          onClick={onClose}
          style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="x" size={15} />
        </button>
      </div>

      {/* Original message */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <MessageBubble
          channelId={parentMessage.channel_id}
          message={parentMessage}
          currentUserId={currentUserId}
          onReact={(id, emoji) => react.mutate({ messageId: id, emoji })}
          onUnreact={(id, emoji) => unreact.mutate({ messageId: id, emoji })}
          onDelete={id => remove.mutate(id)}
          showAvatar
        />
      </div>

      {/* Replies */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {replies.length === 0 && (
          <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>
            No replies yet
          </div>
        )}
        {replies.map(msg => (
          <MessageBubble
            key={msg.id}
            channelId={parentMessage.channel_id}
            message={msg as unknown as Message}
            currentUserId={currentUserId}
            onReact={(id, emoji) => react.mutate({ messageId: id, emoji })}
            onUnreact={(id, emoji) => unreact.mutate({ messageId: id, emoji })}
            onDelete={id => remove.mutate(id)}
            showAvatar
          />
        ))}
      </div>

      {/* Reply input */}
      <MessageInput
        onSend={async (body) => { send.mutate(body); }}
        placeholder="Reply in thread…"
      />
    </div>
  );
}
