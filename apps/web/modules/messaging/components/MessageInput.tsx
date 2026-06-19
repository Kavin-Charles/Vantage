'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listWorkspaceMembers, presignUpload, type WorkspaceMember, type PendingAttachment } from '../lib/messaging';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const BLOCKED_EXT = /\.(exe|sh|bat|cmd|ps1|msi|dll|so|dylib|app|deb|rpm)$/i;

interface Props {
  onSend: (body: string, attachments?: PendingAttachment[]) => Promise<void>;
  onTyping?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MessageInput({ onSend, onTyping, placeholder = 'Message…', disabled = false }: Props) {
  const getToken = useApiToken();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [caretPos, setCaretPos] = useState(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members'],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return [];
      const res = await listWorkspaceMembers(token);
      return res.data ?? [];
    },
    staleTime: 120_000,
  });

  const mentionMatches = mentionSearch !== null
    ? members.filter(m =>
        m.name.toLowerCase().includes(mentionSearch.toLowerCase()) ||
        m.email.toLowerCase().includes(mentionSearch.toLowerCase()),
      ).slice(0, 6)
    : [];

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    const caret = e.target.selectionStart ?? 0;
    setValue(v);
    setCaretPos(caret);

    // Detect @mention trigger
    const textUpToCaret = v.slice(0, caret);
    const atMatch = /@(\w*)$/.exec(textUpToCaret);
    if (atMatch) {
      setMentionSearch(atMatch[1] ?? '');
      setMentionIdx(0);
    } else {
      setMentionSearch(null);
    }

    if (onTyping) {
      onTyping();
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => { typingTimer.current = null; }, 2500);
    }

    // Auto-grow
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [onTyping]);

  const insertMention = useCallback((member: WorkspaceMember) => {
    const textUpToCaret = value.slice(0, caretPos);
    const textAfterCaret = value.slice(caretPos);
    const replaced = textUpToCaret.replace(/@\w*$/, `@${member.name} `);
    setValue(replaced + textAfterCaret);
    setMentionSearch(null);
    textareaRef.current?.focus();
  }, [value, caretPos]);

  const uploadFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      alert(`File too large (max 10 MB): ${file.name}`);
      return;
    }
    if (BLOCKED_EXT.test(file.name)) {
      alert(`File type not allowed: ${file.name}`);
      return;
    }

    setUploading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const presign = await presignUpload(token, {
        filename: file.name,
        mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
      });

      const { upload_url, r2_key, filename, size_bytes, mime_type } = presign.data;

      await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': mime_type },
        body: file,
      });

      const att: PendingAttachment = { r2_key, filename, size_bytes, mime_type };
      if (file.type.startsWith('image/')) {
        att.previewUrl = URL.createObjectURL(file);
      }
      setAttachments(prev => [...prev, att]);
    } catch {
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [getToken]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) void uploadFile(f);
  }, [uploadFile]);

  const removeAttachment = useCallback((r2_key: string) => {
    setAttachments(prev => {
      const att = prev.find(a => a.r2_key === r2_key);
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter(a => a.r2_key !== r2_key);
    });
  }, []);

  const submit = useCallback(async () => {
    const body = value.trim();
    if ((!body && attachments.length === 0) || sending || disabled || uploading) return;
    setSending(true);
    const atts = [...attachments];
    setValue('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    try {
      await onSend(body, atts.length > 0 ? atts : undefined);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [value, attachments, sending, disabled, uploading, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionSearch !== null && mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, mentionMatches.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionMatches[mentionIdx]!);
        return;
      }
      if (e.key === 'Escape') { setMentionSearch(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }, [mentionSearch, mentionMatches, mentionIdx, insertMention, submit]);

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !disabled && !uploading;

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}
    >
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {attachments.map(att => (
            <AttachmentChip key={att.r2_key} att={att} onRemove={() => removeAttachment(att.r2_key)} />
          ))}
        </div>
      )}

      {/* Mention dropdown */}
      {mentionSearch !== null && mentionMatches.length > 0 && (
        <div style={{
          position: 'relative', zIndex: 40,
        }}>
          <div style={{
            position: 'absolute', bottom: '100%', left: 0,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '4px 0', minWidth: 220,
            boxShadow: '0 4px 16px rgba(0,0,0,.1)',
          }}>
            {mentionMatches.map((m, i) => (
              <button
                key={m.id}
                onMouseDown={e => { e.preventDefault(); insertMention(m); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '7px 12px', border: 'none',
                  background: i === mentionIdx ? 'var(--surface2)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, color: 'var(--text2)', flexShrink: 0,
                }}>
                  {m.name[0]?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.email}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 8,
        border: dragOver ? '1.5px solid var(--text)' : '1px solid var(--border)',
        borderRadius: 12, background: 'var(--bg)', padding: '6px 10px 6px 14px',
        transition: 'border-color .15s',
      }}>
        {/* File upload trigger */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Attach file"
          style={{
            width: 28, height: 28, borderRadius: 6, flexShrink: 0, marginBottom: 2,
            background: 'none', border: 'none', cursor: uploading ? 'wait' : 'pointer',
            color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {uploading ? <Spinner /> : <Icon name="paperclip" size={15} />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
        />

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={dragOver ? 'Drop files here…' : placeholder}
          disabled={disabled || sending}
          rows={1}
          style={{
            flex: 1, resize: 'none', border: 'none', background: 'transparent',
            outline: 'none', fontSize: 13.5, color: 'var(--text)', lineHeight: 1.5,
            fontFamily: 'inherit', minHeight: 24, maxHeight: 160, overflowY: 'auto',
            padding: '2px 0',
          }}
        />

        <button
          onClick={() => void submit()}
          disabled={!canSend || sending}
          style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: canSend ? 'var(--text)' : 'var(--border)',
            border: 'none', cursor: canSend ? 'pointer' : 'not-allowed',
            color: canSend ? '#fff' : 'var(--text3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .15s',
          }}
        >
          <Icon name="send" size={15} />
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5, paddingLeft: 2 }}>
        <b>Enter</b> to send · <b>Shift+Enter</b> for newline · <b>@</b> to mention
      </div>
    </div>
  );
}

function AttachmentChip({ att, onRemove }: { att: PendingAttachment; onRemove: () => void }) {
  const isImage = att.mime_type.startsWith('image/');
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px',
      background: 'var(--surface)', maxWidth: 200,
    }}>
      {isImage && att.previewUrl ? (
        <img src={att.previewUrl} alt={att.filename} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
      ) : (
        <Icon name="file" size={16} />
      )}
      <span style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {att.filename}
      </span>
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 0, display: 'flex' }}
      >
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 14, height: 14, borderRadius: '50%',
      border: '2px solid var(--border)',
      borderTopColor: 'var(--text2)',
      animation: 'vt-spin .6s linear infinite',
    }}>
      <style>{`@keyframes vt-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
