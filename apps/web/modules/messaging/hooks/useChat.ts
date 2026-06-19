'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Message, MessagesPage, WsServerEvent } from '@vencore/types';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getMessages, sendMessage, type PendingAttachment } from '../lib/messaging';

const WS_RECONNECT_DELAY = 3000;

type TypingUser = { user_id: string; name: string; until: number };

export function useChat(channelId: string | null) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [oldestId, setOldestId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [typing, setTyping] = useState<TypingUser[]>([]);
  const [wsReady, setWsReady] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Prune typing indicators every second
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setTyping(prev => prev.filter(u => u.until > now));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const applyEvent = useCallback((event: WsServerEvent) => {
    switch (event.type) {
      case 'message.new':
        setMessages(prev => {
          if (prev.some(m => m.id === event.message.id)) return prev;
          return [...prev, event.message as unknown as Message];
        });
        break;

      case 'message.edited':
        setMessages(prev =>
          prev.map(m =>
            m.id === event.message_id ? { ...m, body: event.body, edited_at: event.edited_at } : m,
          ),
        );
        break;

      case 'message.deleted':
        setMessages(prev =>
          prev.map(m =>
            m.id === event.message_id ? { ...m, body: '[deleted]', deleted_at: new Date().toISOString() } : m,
          ),
        );
        break;

      case 'reaction.added':
        setMessages(prev =>
          prev.map(m => {
            if (m.id !== event.message_id) return m;
            const reactions = [...(m.reactions ?? [])];
            const exists = reactions.find(r => r.user_id === event.user_id && r.emoji === event.emoji);
            if (exists) return m;
            return { ...m, reactions: [...reactions, { message_id: m.id, user_id: event.user_id, emoji: event.emoji, created_at: new Date().toISOString() }] };
          }),
        );
        break;

      case 'reaction.removed':
        setMessages(prev =>
          prev.map(m => {
            if (m.id !== event.message_id) return m;
            return { ...m, reactions: (m.reactions ?? []).filter(r => !(r.user_id === event.user_id && r.emoji === event.emoji)) };
          }),
        );
        break;

      case 'user.typing':
        if (event.channel_id !== channelId) return;
        setTyping(prev => {
          const filtered = prev.filter(u => u.user_id !== event.user_id);
          return [...filtered, { user_id: event.user_id, name: event.name, until: Date.now() + 3500 }];
        });
        break;

      case 'user.presence':
        setOnlineUsers(prev => {
          const next = new Set(prev);
          if (event.status === 'online') next.add(event.user_id);
          else next.delete(event.user_id);
          return next;
        });
        break;

      default:
        break;
    }
  }, [channelId]);

  // WebSocket lifecycle
  useEffect(() => {
    mountedRef.current = true;
    let ws: WebSocket;

    async function connect() {
      if (!mountedRef.current) return;
      const token = await getToken();
      if (!token || !mountedRef.current) return;

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
      const wsUrl = apiUrl.replace(/^http/, 'ws') + `/api/messaging/ws?token=${token}`;

      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        setWsReady(true);
        if (channelId) {
          ws.send(JSON.stringify({ type: 'subscribe', channel_ids: [channelId] }));
        }
      };

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data as string) as WsServerEvent;
          applyEvent(event);
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        setWsReady(false);
        wsRef.current = null;
        if (mountedRef.current) {
          reconnectTimer.current = setTimeout(() => { void connect(); }, WS_RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    void connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe when channelId changes
  useEffect(() => {
    if (!channelId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', channel_ids: [channelId] }));
    }
  }, [channelId]);

  // Load initial history when channelId changes
  useEffect(() => {
    if (!channelId) return;
    setMessages([]);
    setOldestId(null);
    setHasMore(false);
    setLoadingHistory(true);

    void (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await getMessages(token, channelId);
      if (!mountedRef.current) return;
      const page = res.data as MessagesPage;
      setMessages(page.messages as unknown as Message[]);
      setHasMore(page.has_more);
      setOldestId(page.oldest_id ?? null);
      setLoadingHistory(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const loadMore = useCallback(async () => {
    if (!channelId || !hasMore || loadingHistory || !oldestId) return;
    setLoadingHistory(true);
    const token = await getToken();
    if (!token) return;
    const res = await getMessages(token, channelId, oldestId);
    const page = res.data as MessagesPage;
    setMessages(prev => [...(page.messages as unknown as Message[]), ...prev]);
    setHasMore(page.has_more);
    setOldestId(page.oldest_id ?? null);
    setLoadingHistory(false);
  }, [channelId, hasMore, loadingHistory, oldestId, getToken]);

  const send = useCallback(async (body: string, attachments?: PendingAttachment[], parentMessageId?: string) => {
    if (!channelId) return;
    const token = await getToken();
    if (!token) return;
    await sendMessage(token, channelId, { body, parent_message_id: parentMessageId, attachments });
    void qc.invalidateQueries({ queryKey: ['channels'] });
  }, [channelId, getToken, qc]);

  const sendTyping = useCallback(() => {
    if (!channelId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'typing.start', channel_id: channelId }));
  }, [channelId]);

  const markRead = useCallback((messageId: string) => {
    if (!channelId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'mark_read', channel_id: channelId, message_id: messageId }));
  }, [channelId]);

  return { messages, hasMore, loadingHistory, typing, wsReady, onlineUsers, loadMore, send, sendTyping, markRead };
}
