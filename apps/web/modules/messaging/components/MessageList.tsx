'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@vencore/types';
import { MessageBubble } from './MessageBubble';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { addReaction, removeReaction, deleteMessage, editMessage } from '../lib/messaging';

interface Props {
  messages: Message[];
  currentUserId: string;
  hasMore: boolean;
  loadingHistory: boolean;
  onLoadMore: () => void;
  onMarkRead: (messageId: string) => void;
  onThreadOpen?: (message: Message) => void;
}

function isSameAuthorAndMinute(a: Message, b: Message) {
  if (a.user_id !== b.user_id) return false;
  const da = new Date(a.created_at);
  const db = new Date(b.created_at);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate()
    && da.getHours() === db.getHours()
    && da.getMinutes() === db.getMinutes();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function isDifferentDay(a: Message, b: Message) {
  const da = new Date(a.created_at);
  const db = new Date(b.created_at);
  return da.toDateString() !== db.toDateString();
}

export function MessageList({
  messages, currentUserId, hasMore, loadingHistory, onLoadMore, onMarkRead, onThreadOpen,
}: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const prevScrollHeight = useRef(0);
  const isAtBottom = useRef(true);

  // Scroll to bottom on new messages if user is already at bottom
  useEffect(() => {
    if (!bottomRef.current || !containerRef.current) return;
    if (isAtBottom.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Restore scroll position after loading older messages
  useEffect(() => {
    if (!containerRef.current || loadingHistory) return;
    const el = containerRef.current;
    const newScrollHeight = el.scrollHeight;
    const diff = newScrollHeight - prevScrollHeight.current;
    if (diff > 0 && el.scrollTop < 10) {
      el.scrollTop = diff;
    }
    prevScrollHeight.current = newScrollHeight;
  }, [loadingHistory, messages]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;

    // Load more when near top
    if (el.scrollTop < 80 && hasMore && !loadingHistory) {
      prevScrollHeight.current = el.scrollHeight;
      onLoadMore();
    }

    // Mark read — last visible message
    if (messages.length > 0 && isAtBottom.current) {
      const last = messages[messages.length - 1];
      if (last) onMarkRead(last.id);
    }
  }, [hasMore, loadingHistory, messages, onLoadMore, onMarkRead]);

  const react = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const token = await getToken();
      if (!token) return;
      await addReaction(token, messageId, emoji);
    },
  });

  const unreact = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const token = await getToken();
      if (!token) return;
      await removeReaction(token, messageId, emoji);
    },
  });

  const remove = useMutation({
    mutationFn: async (messageId: string) => {
      const token = await getToken();
      if (!token) return;
      await deleteMessage(token, messageId);
    },
  });

  const edit = useMutation({
    mutationFn: async ({ messageId, body }: { messageId: string; body: string }) => {
      const token = await getToken();
      if (!token) return;
      await editMessage(token, messageId, body);
      setEditingId(null);
    },
  });

  if (messages.length === 0 && !loadingHistory) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <div style={{ fontSize: 32 }}>💬</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>No messages yet</div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Be the first to say something!</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}
    >
      {/* Load more indicator */}
      {loadingHistory && (
        <div style={{ textAlign: 'center', padding: '12px', fontSize: 12, color: 'var(--text3)' }}>
          Loading…
        </div>
      )}

      {hasMore && !loadingHistory && (
        <div style={{ textAlign: 'center', padding: '8px' }}>
          <button
            onClick={onLoadMore}
            style={{
              fontSize: 12, color: 'var(--text2)', background: 'none',
              border: '1px solid var(--border)', borderRadius: 8,
              padding: '4px 12px', cursor: 'pointer',
            }}
          >
            Load earlier messages
          </button>
        </div>
      )}

      {messages.map((msg, i) => {
        const prev = messages[i - 1];
        const showAvatar = !prev || !isSameAuthorAndMinute(prev, msg);
        const showDayDivider = !prev || isDifferentDay(prev, msg);

        return (
          <div key={msg.id}>
            {showDayDivider && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px 8px',
              }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {dayLabel(msg.created_at)}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            )}

            {editingId === msg.id ? (
              <InlineEdit
                initial={msg.body}
                onSave={body => edit.mutate({ messageId: msg.id, body })}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <MessageBubble
                message={msg}
                currentUserId={currentUserId}
                showAvatar={showAvatar}
                onReact={(id, emoji) => react.mutate({ messageId: id, emoji })}
                onUnreact={(id, emoji) => unreact.mutate({ messageId: id, emoji })}
                onEdit={m => { setEditingId(m.id); setEditBody(m.body); }}
                onDelete={id => remove.mutate(id)}
                onThreadOpen={onThreadOpen}
              />
            )}
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}

function InlineEdit({ initial, onSave, onCancel }: { initial: string; onSave: (b: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(initial);

  return (
    <div style={{ padding: '4px 16px 4px 58px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <textarea
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        rows={Math.max(2, val.split('\n').length)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(val.trim()); }
          if (e.key === 'Escape') onCancel();
        }}
        style={{
          width: '100%', border: '1px solid var(--border)', borderRadius: 8,
          padding: '8px 10px', fontSize: 13.5, lineHeight: 1.5,
          fontFamily: 'inherit', resize: 'none', outline: 'none',
          background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onSave(val.trim())} style={saveBtnStyle}>Save</button>
        <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
      </div>
    </div>
  );
}

const saveBtnStyle: React.CSSProperties = {
  padding: '4px 12px', borderRadius: 6, border: 'none',
  background: 'var(--text)', color: '#fff', fontSize: 12, cursor: 'pointer',
};
const cancelBtnStyle: React.CSSProperties = {
  padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text2)', fontSize: 12, cursor: 'pointer',
};
