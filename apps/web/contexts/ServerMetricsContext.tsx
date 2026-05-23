'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useApiToken } from '@/lib/useApiToken';

export interface LiveServerMetrics {
  serverId: string;
  cpu_pct: number | null;
  mem_pct: number | null;
  disk_pct: number | null;
  load_avg_1m: number | null;
  net_in_bytes: number | null;
  net_out_bytes: number | null;
  uptime_seconds: number | null;
  status: 'online' | 'degraded' | 'offline' | 'stopped';
  last_ping_at: string | null;
}

export interface LiveAlertEvent {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  resource_type: string;
  resource_id: string;
}

interface ContextValue {
  metrics: Map<string, LiveServerMetrics>;
  lastAlert: LiveAlertEvent | null;
}

const ServerMetricsContext = createContext<ContextValue>({
  metrics: new Map(),
  lastAlert: null,
});

export function ServerMetricsProvider({ children }: { children: ReactNode }) {
  const getToken = useApiToken();
  const [metrics, setMetrics] = useState<Map<string, LiveServerMetrics>>(new Map());
  const [lastAlert, setLastAlert] = useState<LiveAlertEvent | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(async (retryDelay: number): Promise<void> => {
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = await getToken();
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? '';
      const res = await fetch(`${apiUrl}/api/sse/servers`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
        signal: controller.signal,
      });

      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventName = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventName = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const data = JSON.parse(raw) as unknown;
              if (eventName === 'metric') {
                const m = data as LiveServerMetrics;
                setMetrics(prev => {
                  const next = new Map(prev);
                  next.set(m.serverId, m);
                  return next;
                });
              } else if (eventName === 'alert_new') {
                setLastAlert(data as LiveAlertEvent);
              }
            } catch { /* ignore malformed */ }
            eventName = '';
          }
        }
      }

      // Stream ended cleanly — reconnect with reset delay
      void connect(1_000);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      // Exponential backoff, cap at 30s
      const next = Math.min(retryDelay * 2, 30_000);
      setTimeout(() => void connect(next), retryDelay);
    }
  }, [getToken]);

  useEffect(() => {
    void connect(1_000);
    return () => abortRef.current?.abort();
  }, [connect]);

  return (
    <ServerMetricsContext.Provider value={{ metrics, lastAlert }}>
      {children}
    </ServerMetricsContext.Provider>
  );
}

export function useServerMetrics(serverId: string): LiveServerMetrics | null {
  const { metrics } = useContext(ServerMetricsContext);
  return metrics.get(serverId) ?? null;
}

export function useLastAlert(): LiveAlertEvent | null {
  return useContext(ServerMetricsContext).lastAlert;
}
