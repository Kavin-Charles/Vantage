'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Email {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
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

interface EmailBody {
  body_html: string | null;
  body_text: string | null;
}

export function EmailDetail({ email, onReply, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<EmailBody | null>(null);
  const [bodyLoading, setBodyLoading] = useState(true);
  const [bodyError, setBodyError] = useState<string | null>(null);

  // Mark as read
  useEffect(() => {
    if (!email.is_read) {
      void apiFetch(`/api/mail/emails/${email.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_read: true }),
      }).catch(() => void 0);
    }
  }, [email.id, email.is_read]);

  // Fetch body when email changes
  useEffect(() => {
    setBody(null);
    setBodyLoading(true);
    setBodyError(null);

    void apiFetch<{ data: EmailBody }>(`/api/mail/emails/${email.id}/body`)
      .then(res => {
        setBody(res.data);
      })
      .catch(() => {
        setBodyError('Failed to load email body.');
      })
      .finally(() => {
        setBodyLoading(false);
      });
  }, [email.id]);

  // Write HTML into sandboxed iframe
  useEffect(() => {
    if (iframeRef.current && body?.body_html) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(body.body_html);
        doc.close();
      }
    }
  }, [body?.body_html]);

  const from = email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, fontFamily: 'var(--font-display)', letterSpacing: '-0.3px', lineHeight: 1.2, color: 'var(--text)' }}>
          {email.subject ?? '(no subject)'}
        </h1>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text3)', padding: 4, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, padding: '10px 16px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <div><span style={{ color: 'var(--text3)', fontWeight: 500 }}>From</span> &nbsp;{from}</div>
        <div><span style={{ color: 'var(--text3)', fontWeight: 500 }}>To</span> &nbsp;{email.to_addresses.join(', ')}</div>
        {email.cc_addresses.length > 0 && <div><span style={{ color: 'var(--text3)', fontWeight: 500 }}>Cc</span> &nbsp;{email.cc_addresses.join(', ')}</div>}
        <div><span style={{ color: 'var(--text3)', fontWeight: 500 }}>Date</span> &nbsp;{new Date(email.sent_at).toLocaleString()}</div>
        {email.contact_id && (
          <div>
            <Link href={`/contacts/${email.contact_id}`} style={{ color: 'var(--text)', fontSize: 12, background: 'var(--surface2)', padding: '2px 8px', borderRadius: 12, textDecoration: 'none', display: 'inline-block', marginTop: 2 }}>
              View contact &rarr;
            </Link>
          </div>
        )}
      </div>

      <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', minHeight: 300 }}>
        {bodyLoading ? (
          <div style={{ padding: 16, color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        ) : bodyError ? (
          <div style={{ padding: 16, color: 'var(--red)', fontSize: 13 }}>{bodyError}</div>
        ) : body?.body_html ? (
          <iframe
            ref={iframeRef}
            sandbox="allow-same-origin"
            style={{ width: '100%', height: '100%', minHeight: 300, border: 'none' }}
            title="Email body"
          />
        ) : (
          <pre style={{ padding: 16, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0, color: 'var(--text)' }}>
            {body?.body_text ?? '(empty)'}
          </pre>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onReply(email)}
          style={{
            padding: '8px 18px', fontSize: 13,
            background: 'var(--text)', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer',
          }}
        >
          Reply
        </button>
      </div>
    </div>
  );
}
