'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Account { id: string; email: string; }
interface Props {
  accounts: Account[];
  replyTo?: { account_id: string; to: string; subject: string; message_id: string };
  onClose: () => void;
  onSent: () => void;
}

export function ComposeModal({ accounts, replyTo, onClose, onSent }: Props) {
  const [accountId, setAccountId] = useState(replyTo?.account_id ?? accounts[0]?.id ?? '');
  const [to, setTo] = useState(replyTo?.to ?? '');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6,
    fontSize: 13, background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box',
  };

  async function send() {
    setSending(true);
    setError(null);
    try {
      await apiFetch('/api/mail/send', {
        method: 'POST',
        body: JSON.stringify({
          account_id: accountId,
          to: to.split(',').map(s => s.trim()).filter(Boolean),
          cc: cc ? cc.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          subject,
          body_html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6">${body.replace(/\n/g, '<br>')}</div>`,
          reply_to_message_id: replyTo?.message_id,
        }),
      });
      onSent();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, width: 480, background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      display: 'flex', flexDirection: 'column', zIndex: 1000,
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>New message</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text3)' }}>
          &times;
        </button>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {accounts.length > 1 && (
          <select value={accountId} onChange={e => setAccountId(e.target.value)} style={inputStyle}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
          </select>
        )}
        <input placeholder="To" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
        <input placeholder="Cc" value={cc} onChange={e => setCc(e.target.value)} style={inputStyle} />
        <input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
        <textarea
          placeholder="Body"
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={8}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
        {error && <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{error}</p>}
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <button
          onClick={() => void send()}
          disabled={sending}
          style={{ padding: '8px 18px', fontSize: 13, background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
        <button onClick={onClose} style={{ padding: '8px 14px', fontSize: 13, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
          Discard
        </button>
      </div>
    </div>
  );
}
