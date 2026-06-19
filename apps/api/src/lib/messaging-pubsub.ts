import type { WebSocket } from 'ws';
import type { WsServerEvent } from '@vencore/types';

// Per-workspace WS registry: workspaceId → Set of connected sockets
const registry = new Map<string, Set<WebSocket>>();

// Subscriptions per socket: ws → Set of channel ids it has subscribed to
const subscriptions = new Map<WebSocket, Set<string>>();

export function registerSocket(workspaceId: string, ws: WebSocket): void {
  if (!registry.has(workspaceId)) registry.set(workspaceId, new Set());
  registry.get(workspaceId)!.add(ws);
  subscriptions.set(ws, new Set());

  ws.on('close', () => {
    registry.get(workspaceId)?.delete(ws);
    if (registry.get(workspaceId)?.size === 0) registry.delete(workspaceId);
    subscriptions.delete(ws);
  });
}

export function subscribeToChannels(ws: WebSocket, channelIds: string[]): void {
  const subs = subscriptions.get(ws);
  if (!subs) return;
  for (const id of channelIds) subs.add(id);
}

/** Push a WS event to all sockets in the workspace that are subscribed to the channel. */
export function broadcastToChannel(workspaceId: string, channelId: string, event: WsServerEvent): void {
  const sockets = registry.get(workspaceId);
  if (!sockets) return;

  const payload = JSON.stringify(event);
  for (const ws of sockets) {
    if (ws.readyState !== ws.OPEN) {
      sockets.delete(ws);
      subscriptions.delete(ws);
      continue;
    }
    const subs = subscriptions.get(ws);
    if (subs?.has(channelId)) {
      ws.send(payload);
    }
  }
}

/** Push an event to ALL sockets in the workspace (presence, member events). */
export function broadcastToWorkspace(workspaceId: string, event: WsServerEvent): void {
  const sockets = registry.get(workspaceId);
  if (!sockets) return;

  const payload = JSON.stringify(event);
  for (const ws of sockets) {
    if (ws.readyState !== ws.OPEN) {
      sockets.delete(ws);
      subscriptions.delete(ws);
      continue;
    }
    ws.send(payload);
  }
}

// ── Redis pub/sub fanout ────────────────────────────────────────────────────
// When REDIS_URL is set, messages are also fanned out via Redis so that
// multiple API replicas all receive and forward to their local clients.
let redisPublisher: import('ioredis').Redis | null = null;
let redisSubscriber: import('ioredis').Redis | null = null;

export function initRedisMessaging(redisUrl: string): void {
  // Dynamically import ioredis so the app still boots without Redis
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Redis = require('ioredis') as typeof import('ioredis').default;

  redisPublisher = new Redis(redisUrl, { lazyConnect: true });
  redisSubscriber = new Redis(redisUrl, { lazyConnect: true });

  redisSubscriber.subscribe('messaging', (err) => {
    if (err) console.error('[messaging-pubsub] Redis subscribe error:', err);
  });

  redisSubscriber.on('message', (_channel, raw) => {
    try {
      const { workspaceId, channelId, event } = JSON.parse(raw) as {
        workspaceId: string;
        channelId: string;
        event: WsServerEvent;
      };
      // Fan out to local WS clients on this process
      broadcastToChannel(workspaceId, channelId, event);
    } catch { /* ignore malformed */ }
  });
}

/** Called by REST routes after saving a message to DB — publishes to Redis for cross-process fanout. */
export async function publishMessageEvent(
  workspaceId: string,
  channelId: string,
  event: WsServerEvent,
): Promise<void> {
  if (redisPublisher) {
    await redisPublisher.publish('messaging', JSON.stringify({ workspaceId, channelId, event }));
  } else {
    // No Redis — direct local broadcast (single-process dev mode)
    broadcastToChannel(workspaceId, channelId, event);
  }
}
