'use client';

import { useState } from 'react';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { EmojiPicker } from './EmojiPicker';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import type { Message } from '@vencore/types';

interface Props {
  channelId: string;
  message: Message;
  currentUserId: string;
  onReact: (messageId: string, emoji: string) => void;
  onUnreact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (messageId: string) => void;
  onThreadOpen?: (message: Message) => void;
  showAvatar?: boolean;
  isAuthorOnline?: boolean;
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
  channelId,
  message,
  currentUserId,
  onReact,
  onUnreact,
  onEdit,
  onDelete,
  onThreadOpen,
  showAvatar = true,
  isAuthorOnline = false,
}: Props) {
  const [hover, setHover] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const isDeleted = !!message.deleted_at;
  const isOwn = message.user_id === currentUserId;
  const grouped = groupReactions(message.reactions);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setShowEmojiPicker(false); }}
      onContextMenu={e => {
        if (isDeleted) return;
        const link = `${window.location.origin}/messaging/${channelId}?message=${message.id}`;
        const items: ContextMenuItem[] = [
          ...(onThreadOpen ? [{ icon: 'message-square', label: 'Reply in thread', onClick: () => onThreadOpen(message) }] : []),
          { icon: 'smile', label: 'Add reaction', onClick: () => setShowEmojiPicker(true) },
          { type: 'separator' as const },
          ...(isOwn && onEdit ? [{ icon: 'edit', label: 'Edit', onClick: () => onEdit(message) }] : []),
          { icon: 'copy', label: 'Copy text', onClick: () => navigator.clipboard.writeText(message.body) },
          { icon: 'link', label: 'Copy link', onClick: () => navigator.clipboard.writeText(link) },
          { type: 'separator' as const },
          { label: 'Pin message (coming soon)', disabled: true, onClick: () => {} },
          { label: 'Forward (coming soon)', disabled: true, onClick: () => {} },
          { label: 'Mark unread (coming soon)', disabled: true, onClick: () => {} },
          { label: 'Save message (coming soon)', disabled: true, onClick: () => {} },
          ...((isOwn || onDelete) ? [{ type: 'separator' as const }, { icon: 'trash', label: 'Delete', danger: true, onClick: () => onDelete?.(message.id) }] : []),
        ];
        openMenu(e, items);
      }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '4px 16px',
        background: hover ? 'var(--surface2)' : 'transparent',
        borderRadius: 8, position: 'relative',
        transition: 'background .1s',
      }}
    >
      {/* Avatar with presence dot */}
      <div style={{ position: 'relative', flexShrink: 0, marginTop: 2, opacity: showAvatar ? 1 : 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 600, color: 'var(--text2)',
        }}>
          {message.author ? (message.author.name[0] ?? '?').toUpperCase() : '?'}
        </div>
        {isAuthorOnline && showAvatar && (
          <span style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 9, height: 9, borderRadius: '50%',
            background: '#22c55e', border: '2px solid var(--surface)',
            display: 'block',
          }} />
        )}
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

        {/* Attachments */}
        {(message.attachments?.length ?? 0) > 0 && !isDeleted && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {message.attachments!.map(att => (
              <AttachmentPreview key={att.id} att={att} />
            ))}
          </div>
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
          {/* Emoji picker */}
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <ActionBtn
              icon="smile"
              title="Add reaction"
              onClick={() => setShowEmojiPicker(v => !v)}
            />
            {showEmojiPicker && (
              <div style={{
                position: 'absolute', right: 0, bottom: '110%', zIndex: 50,
              }}>
                <EmojiPicker
                  onSelect={(emoji) => onReact(message.id, emoji)}
                  onClose={() => setShowEmojiPicker(false)}
                />
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

      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}

function AttachmentPreview({ att }: { att: { id: string; filename: string; mime_type: string; size_bytes: number; url?: string } }) {
  const isImage = att.mime_type.startsWith('image/');
  const sizeKB = Math.round(att.size_bytes / 1024);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const handleContextMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const items: ContextMenuItem[] = [
      { icon: 'open', label: 'Open', disabled: !att.url, onClick: () => window.open(att.url, '_blank') },
      { icon: 'file', label: 'Download', disabled: !att.url, onClick: () => { const a = document.createElement('a'); a.href = att.url!; a.download = att.filename; a.click(); } },
      { icon: 'link', label: 'Copy link', disabled: !att.url, onClick: () => navigator.clipboard.writeText(att.url ?? '') },
    ];
    openMenu(e, items);
  };

  if (isImage && att.url) {
    return (
      <>
        <a href={att.url} target="_blank" rel="noopener noreferrer" onContextMenu={handleContextMenu} style={{ display: 'block' }}>
          <img
            src={att.url}
            alt={att.filename}
            style={{ maxWidth: 300, maxHeight: 200, borderRadius: 8, border: '1px solid var(--border)', objectFit: 'cover', display: 'block' }}
          />
        </a>
        <ContextMenu menu={menu} onClose={closeMenu} />
      </>
    );
  }

  return (
    <>
      <a
        href={att.url ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        onContextMenu={handleContextMenu}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px',
          background: 'var(--bg)', textDecoration: 'none', color: 'var(--text)',
          maxWidth: 260,
        }}
      >
        <Icon name="file" size={16} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {att.filename}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sizeKB} KB</div>
        </div>
      </a>
      <ContextMenu menu={menu} onClose={closeMenu} />
    </>
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
