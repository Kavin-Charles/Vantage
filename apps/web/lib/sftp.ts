export interface SftpEntry {
  name: string;
  type: 'file' | 'dir' | 'link' | 'other';
  size: number;
  modified: string;
}

export interface SftpResponse<T = unknown> {
  id: string;
  ok: boolean;
  data?: T;
  error?: string;
}

type PendingCallback = (resp: SftpResponse) => void;

export class SftpClient {
  private ws: WebSocket;
  private pending = new Map<string, PendingCallback>();
  private seq = 0;
  private onCloseCallback: (() => void) | null = null;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.addEventListener('message', (e: MessageEvent) => {
      try {
        const resp = JSON.parse(e.data as string) as SftpResponse;
        const cb = this.pending.get(resp.id);
        if (cb) {
          this.pending.delete(resp.id);
          cb(resp);
        }
      } catch { /* ignore malformed */ }
    });
    this.ws.addEventListener('close', () => {
      this.onCloseCallback?.();
    });
  }

  onClose(cb: () => void) {
    this.onCloseCallback = cb;
  }

  private send<T>(op: string, extra: Record<string, unknown>): Promise<SftpResponse<T>> {
    const id = String(++this.seq);
    return new Promise((resolve) => {
      this.pending.set(id, resolve as PendingCallback);
      this.ws.send(JSON.stringify({ id, op, ...extra }));
    });
  }

  ls(path: string) {
    return this.send<{ entries: SftpEntry[] }>('ls', { path });
  }

  read(path: string) {
    return this.send<{ content: string }>('read', { path });
  }

  write(path: string, content: string) {
    return this.send('write', { path, content });
  }

  delete(path: string) {
    return this.send('delete', { path });
  }

  rename(src: string, dest: string) {
    return this.send('rename', { path: src, dest });
  }

  mkdir(path: string) {
    return this.send('mkdir', { path });
  }

  close() {
    this.ws.close();
  }
}

export function openSftpSession(serverId: string): SftpClient {
  const apiUrl = (process.env['NEXT_PUBLIC_API_URL'] ?? '').replace(/^http/, 'ws');
  const ws = new WebSocket(`${apiUrl}/api/servers/${serverId}/ssh/sftp`);
  return new SftpClient(ws);
}
