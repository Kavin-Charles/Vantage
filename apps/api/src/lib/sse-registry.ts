import type { Response } from 'express';

export class SseRegistry {
  private subs = new Map<string, Set<Response>>();

  subscribe(workspaceId: string, res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    if (!this.subs.has(workspaceId)) {
      this.subs.set(workspaceId, new Set());
    }
    this.subs.get(workspaceId)!.add(res);

    // Keep alive through proxies that close idle HTTP connections
    const heartbeat = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(heartbeat);
        return;
      }
      res.write(': heartbeat\n\n');
    }, 15_000);

    res.on('close', () => {
      clearInterval(heartbeat);
      this.unsubscribe(workspaceId, res);
    });
  }

  unsubscribe(workspaceId: string, res: Response): void {
    const set = this.subs.get(workspaceId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) this.subs.delete(workspaceId);
  }

  broadcast(workspaceId: string, event: string, data: unknown): void {
    const set = this.subs.get(workspaceId);
    if (!set || set.size === 0) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
      if (!res.writableEnded) res.write(payload);
    }
  }
}

// Singleton shared across the process
export const sseRegistry = new SseRegistry();
