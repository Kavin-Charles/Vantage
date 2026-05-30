'use client';

import { useEffect, useRef } from 'react';

export interface MailSocketEmail {
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
  deal_id: string | null;
  is_starred: boolean;
  is_read: boolean;
  account_id: string;
  message_id: string;
  folder: string;
}

interface UseMailSocketOptions {
  onNewEmail: (email: MailSocketEmail) => void;
  enabled?: boolean;
}

export function useMailSocket({ onNewEmail, enabled = true }: UseMailSocketOptions): void {
  const onNewEmailRef = useRef(onNewEmail);
  onNewEmailRef.current = onNewEmail;

  useEffect(() => {
    if (!enabled) return;

    const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
    const wsBase = apiBase.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/api/mail/ws`);

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; email?: MailSocketEmail };
        if (msg.type === 'new_email' && msg.email) {
          onNewEmailRef.current(msg.email);
        }
      } catch { /* ignore malformed messages */ }
    });

    ws.addEventListener('close', () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
    });

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws.close();
    };
  }, [enabled]);
}
