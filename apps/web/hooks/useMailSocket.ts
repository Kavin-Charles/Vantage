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

    // Mutable container so the async setup can hand off the socket to the cleanup closure.
    const state: {
      ws: WebSocket | null;
      cancelled: boolean;
      retryDelay: number;
      reconnectTimer: ReturnType<typeof setTimeout> | null;
    } = { ws: null, cancelled: false, retryDelay: 1_000, reconnectTimer: null };

    const connect = async (): Promise<void> => {
      // Exchange session cookie for a short-lived WS token — handles cross-origin deployments
      // where SameSite=Strict prevents the cookie from being sent on WS upgrade requests.
      let wsToken = '';
      try {
        const res = await fetch(`${apiBase}/api/auth/ws-token`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json() as { data: { token: string } };
          wsToken = json.data.token;
        }
      } catch { /* fall back to cookie auth (same-origin / same-site deployments) */ }

      if (state.cancelled) return;

      const qs = wsToken ? `?token=${encodeURIComponent(wsToken)}` : '';
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${wsBase}/api/mail/ws${qs}`);
      } catch {
        return;
      }

      state.ws = ws;
      if (state.cancelled) {
        ws.close();
        return;
      }

      ws.addEventListener('open', () => {
        state.retryDelay = 1_000;
      });

      ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type: string; email?: MailSocketEmail };
          if (msg.type === 'new_email' && msg.email) {
            onNewEmailRef.current(msg.email);
          }
        } catch { /* ignore malformed messages */ }
      });

      ws.addEventListener('error', () => {
        if (process.env['NODE_ENV'] === 'development') {
          console.warn('[useMailSocket] WebSocket error');
        }
      });

      ws.addEventListener('close', () => {
        if (!state.cancelled) {
          const delay = state.retryDelay;
          state.retryDelay = Math.min(state.retryDelay * 2, 30_000);
          state.reconnectTimer = setTimeout(() => {
            if (!state.cancelled) void connect();
          }, delay);
        }
      });
    };

    void connect();

    return () => {
      state.cancelled = true;
      if (state.reconnectTimer !== null) clearTimeout(state.reconnectTimer);
      state.ws?.close();
    };
  }, [enabled]);
}
