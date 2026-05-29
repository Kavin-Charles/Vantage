import type { WebSocket } from 'ws';

export class MailNotifier {
  private subs = new Map<string, Set<WebSocket>>();

  subscribe(userId: string, ws: WebSocket): void {
    if (!this.subs.has(userId)) {
      this.subs.set(userId, new Set());
    }
    this.subs.get(userId)!.add(ws);
  }

  unsubscribe(userId: string, ws: WebSocket): void {
    const set = this.subs.get(userId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) this.subs.delete(userId);
  }

  broadcast(userId: string, payload: unknown): void {
    const set = this.subs.get(userId);
    if (!set || set.size === 0) return;
    const msg = JSON.stringify(payload);
    for (const ws of set) {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(msg);
      } else {
        set.delete(ws);
      }
    }
  }
}

// Singleton shared across the process
export const mailNotifier = new MailNotifier();
