'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Email {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  body_html: string | null;
  body_text: string | null;
  sent_at: string;
  contact_id: string | null;
  is_starred: boolean;
  is_read: boolean;
  account_id: string;
  message_id: string;
}

interface Props {
  email: Email;
  onReply: (email: Email) => void;
  onClose: () => void;
}

export function EmailDetail({ email, onReply, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!email.is_read) {
      void apiFetch(`/api/mail/emails/${email.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_read: true }),
      }).catch(() => void 0);
    }
  }, [email.id, email.is_read]);

  useEffect(() => {
    if (iframeRef.current && email.body_html) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(email.body_html);
        doc.close();
      }
    }
  }, [email.body_html]);

  const from = email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, fontFamily: 'Instrument Serif, serif' }}>
          {email.subject ?? '(no subject)'}
        </h1>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text3)' }}>
          &times;
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div><strong>From:</strong> {from}</div>
        <div><strong>To:</strong> {email.to_addresses.join(', ')}</div>
        {email.cc_addresses.length > 0 && <div><strong>Cc:</strong> {email.cc_addresses.join(', ')}</div>}
        <div><strong>Date:</strong> {new Date(email.sent_at).toLocaleString()}</div>
        {email.contact_id && (
          <div>
            <Link href={`/contacts/${email.contact_id}`} style={{ color: 'var(--text)', fontSize: 12, background: 'var(--surface2)', padding: '2px 8px', borderRadius: 12, textDecoration: 'none', display: 'inline-block', marginTop: 2 }}>
              View contact &rarr;
            </Link>
          </div>
        )}
      </div>

      <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', minHeight: 300 }}>
        {email.body_html ? (
          <iframe
            ref={iframeRef}
            sandbox="allow-same-origin"
            style={{ width: '100%', height: '100%', minHeight: 300, border: 'none' }}
            title="Email body"
          />
        ) : (
          <pre style={{ padding: 16, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0, color: 'var(--text)' }}>
            {email.body_text ?? '(empty)'}
          </pre>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onReply(email)}
          style={{ padding: '8px 16px', fontSize: 13, background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
        >
          Reply
        </button>
      </div>
    </div>
  );
}
