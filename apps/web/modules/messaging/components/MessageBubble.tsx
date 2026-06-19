'use client';

import { useState } from 'react';
import { Icon } from '@/modules/shared/components/ui/Icon';
import type { Message } from '@vencore/types';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀'];

interface Props {
  message: Message;
  currentUserId: string;
  onReact: (messageId: string, emoji: string) => void;
  onUnreact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (messageId: string) => void;
  onThreadOpen?: (message: Message) => void;
  showAvatar?: boolean;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function groupReactions(reactions: Message['reactions']) {
  const map = new Map<string, { count: number; users: string[] }>();
  for (const r of reactions ?? []) {
    const cur = map.get(r.emoji) ?? { count: 0, users: [] };
    cur.count++;
    cur.users.push(r.user_id);
    map.set(r.emoji, cur);
  }
  return Array.from(map.entries()).map(([emoji, d]) => ({ emoji, ...d }));
}

export function MessageBubble({
  message,
  currentUserId,
  onReact,
  onUnreact,
  onEdit,
  onDelete,
  onThreadOpen,
  showAvatar = true,
}: Props) {
  const [hover, setHover] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const isDeleted = !!message.deleted_at;
  const isOwn = message.user_id === currentUserId;
  const grouped = groupReactions(message.reactions);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setShowEmojiPicker(false); }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '4px 16px',
        background: hover ? 'var(--surface2)' : 'transparent',
        borderRadius: 8, position: 'relative',
        transition: 'background .1s',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 600, color: 'var(--text2)', flexShrink: 0,
        marginTop: 2, opacity: showAvatar ? 1 : 0,
      }}>
        {message.author ? (message.author.name[0] ?? '?').toUpperCase() : '?'}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {showAvatar && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
              {message.author?.name ?? 'Unknown'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {formatTime(message.created_at)}
            </span>
          </div>
        )}

        {isDeleted ? (
          <span style={{ fontSize: 13.5, color: 'var(--text3)', fontStyle: 'italic' }}>
            This message was deleted
          </span>
        ) : (
          <p style={{
            margin: 0, fontSize: 13.5, color: 'var(--text)',
            lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {message.body}
            {message.edited_at && (
              <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>(edited)</span>
            )}
          </p>
        )}

        {/* Reactions */}
        {grouped.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {grouped.map(({ emoji, count, users }) => {
              const reacted = users.includes(currentUserId);
              return (
                <button
                  key={emoji}
                  onClick={() => reacted ? onUnreact(message.id, emoji) : onReact(message.id, emoji)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '2px 7px', borderRadius: 12,
                    border: reacted ? '1.5px solid var(--text)' : '1px solid var(--border)',
                    background: reacted ? 'var(--surface2)' : 'var(--bg)',
                    cursor: 'pointer', fontSize: 12.5, color: 'var(--text2)',
                  }}
                >
                  <span>{emoji}</span>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Thread reply count */}
        {(message.thread_count ?? 0) > 0 && !isDeleted && (
          <button
            onClick={() => onThreadOpen?.(message)}
            style={{
              marginTop: 4, background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text2)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, padding: 0,
            }}
          >
            <Icon name="message-square" size={12} />
            <span style={{ fontWeight: 600, fontSize: 12 }}>
              {message.thread_count} {message.thread_count === 1 ? 'reply' : 'replies'}
            </span>
          </button>
        )}
      </div>

      {/* Hover actions */}
      {hover && !isDeleted && (
        <div style={{
          position: 'absolute', right: 14, top: 2,
          display: 'flex', alignItems: 'center', gap: 2,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '2px 4px', boxShadow: '0 2px 6px rgba(0,0,0,.06)',
        }}>
          {/* Quick emojis */}
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <ActionBtn
              icon="smile"
              title="Add reaction"
              onClick={() => setShowEmojiPicker(v => !v)}
            />
            {showEmojiPicker && (
              <div style={{
                position: 'absolute', right: 0, bottom: '110%',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '6px 8px',
                display: 'flex', gap: 4,
                boxShadow: '0 4px 12px rgba(0,0,0,.1)', zIndex: 50,
              }}>
                {QUICK_EMOJIS.map(e => (
                  <button
                    key={e}
                    onClick={() => { onReact(message.id, e); setShowEmojiPicker(false); }}
                    style={{
                      fontSize: 18, background: 'none', border: 'none',
                      cursor: 'pointer', padding: '2px 3px', borderRadius: 6,
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {onThreadOpen && (
            <ActionBtn icon="message-square" title="Reply in thread" onClick={() => onThreadOpen(message)} />
          )}

          {isOwn && onEdit && (
            <ActionBtn icon="edit" title="Edit" onClick={() => onEdit(message)} />
          )}

          {(isOwn || onDelete) && (
            <ActionBtn icon="trash" title="Delete" onClick={() => onDelete?.(message.id)} />
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  const [h, setH] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 26, height: 26, borderRadius: 6,
        background: h ? 'var(--surface2)' : 'none', border: 'none',
        cursor: 'pointer', color: 'var(--text2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}
