import { apiFetch } from './api';
import type { WorkspaceSshKeypair, SshCommandLog, SshStreamEvent, SshFileEntry } from '@vantage/types';

// ── Keypair ──────────────────────────────────────────────────────────────────

export async function getSshKeypair(token: string) {
  return apiFetch<{ data: WorkspaceSshKeypair; error: null }>('/api/ssh/keypair', { token });
}

export async function regenerateSshKeypair(token: string) {
  return apiFetch<{ data: WorkspaceSshKeypair; error: null }>('/api/ssh/keypair', {
    method: 'DELETE',
    token,
  });
}

// ── SSH command history ───────────────────────────────────────────────────────

export async function getSshHistory(token: string, serverId: string, page = 1) {
  return apiFetch<{ data: SshCommandLog[]; total: number; error: null }>(
    `/api/servers/${serverId}/ssh/history?page=${page}`,
    { token },
  );
}

// ── File listing / reading ───────────────────────────────────────────────────

export async function listFiles(token: string, serverId: string, path: string) {
  return apiFetch<{ data: SshFileEntry[]; error: null }>(
    `/api/servers/${serverId}/ssh/files`,
    { method: 'POST', body: JSON.stringify({ path }), token },
  );
}

export async function readFile(token: string, serverId: string, path: string) {
  return apiFetch<{ data: { content: string }; error: null }>(
    `/api/servers/${serverId}/ssh/files/read?path=${encodeURIComponent(path)}`,
    { token },
  );
}

// ── SSE streaming (POST-based) ────────────────────────────────────────────────

/**
 * Opens an SSE stream from a POST endpoint.
 * EventSource only supports GET, so we use fetch + ReadableStream.
 */
export function openSshStream(
  url: string,
  body: Record<string, unknown>,
  token: string,
  onEvent: (event: SshStreamEvent) => void,
): AbortController {
  const controller = new AbortController();

  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? '';

  (async () => {
    try {
      const res = await fetch(`${apiUrl}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        onEvent({ type: 'error', message: `HTTP ${res.status}: ${text}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE format: "data: {...}\n\n"
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(6)) as SshStreamEvent;
            onEvent(event);
          } catch {
            // ignore malformed events
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onEvent({ type: 'error', message: (err as Error).message });
      }
    }
  })();

  return controller;
}
