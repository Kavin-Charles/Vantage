'use client';

import { useState, useRef, useCallback } from 'react';
import { Icon } from '@/modules/shared/components/ui/Icon';

interface Props {
  onSend: (body: string) => Promise<void>;
  onTyping?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MessageInput({ onSend, onTyping, placeholder = 'Message…', disabled = false }: Props) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);

    // Debounced typing notification (fire once, then re-fire after 2.5s gap)
    if (onTyping) {
      onTyping();
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        typingTimer.current = null;
      }, 2500);
    }

    // Auto-grow
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [onTyping]);

  const submit = useCallback(async () => {
    const body = value.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    try {
      await onSend(body);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [value, sending, disabled, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }, [submit]);

  return (
    <div style={{
      padding: '10px 16px 14px',
      borderTop: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 8,
        border: '1px solid var(--border)', borderRadius: 12,
        background: 'var(--bg)', padding: '6px 10px 6px 14px',
        transition: 'border-color .15s',
      }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
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
          disabled={!value.trim() || sending || disabled}
          style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: value.trim() && !disabled ? 'var(--text)' : 'var(--border)',
            border: 'none', cursor: value.trim() && !disabled ? 'pointer' : 'not-allowed',
            color: value.trim() && !disabled ? '#fff' : 'var(--text3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .15s',
          }}
        >
          <Icon name="send" size={15} />
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5, paddingLeft: 2 }}>
        <b>Enter</b> to send · <b>Shift+Enter</b> for newline
      </div>
    </div>
  );
}
