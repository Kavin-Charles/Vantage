// WebSocket handler for real-time messaging.
// Auth pattern mirrors ssh-terminal.ts (cookie JWT).
import type { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import type { WebSocket } from 'ws';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { WsClientEvent } from '@vencore/types';
import { logger } from '../lib/logger';
import {
  registerSocket,
  subscribeToChannels,
  broadcastToWorkspace,
} from '../lib/messaging-pubsub';

interface JwtPayload {
  sub: string;
  workspaceId: string;
}

export async function handleMessagingUpgrade(
  ws: WebSocket,
  request: IncomingMessage,
  db: Kysely<Database>,
  jwtSecret: string,
): Promise<void> {
  // Buffer messages that arrive before async setup completes
  const earlyMessages: Buffer[] = [];
  const earlyHandler = (raw: Buffer) => earlyMessages.push(raw);
  ws.on('message', earlyHandler);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieHeader = request.headers.cookie ?? '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const idx = c.indexOf('=');
      if (idx < 0) return [c.trim(), ''];
      return [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
    }),
  );
  // Also accept ?token= query param (for clients that can't set cookies on WS)
  const urlToken = new URL(request.url ?? '/', 'http://x').searchParams.get('token');
  const token = cookies['vencore_token'] ?? urlToken ?? null;

  if (!token) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, jwtSecret) as JwtPayload;
  } catch {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const user = await db
    .selectFrom('users')
    .where('id', '=', payload.sub)
    .select(['id', 'workspace_id', 'role', 'name'])
    .executeTakeFirst();

  if (!user) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const workspace = await db
    .selectFrom('workspaces')
    .where('id', '=', user.workspace_id)
    .select('id')
    .executeTakeFirst();

  if (!workspace) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const userId = user.id;
  const userName = user.name;
  const workspaceId = workspace.id;

  // ── Check messaging module enabled ────────────────────────────────────────
  const moduleRow = await db
    .selectFrom('workspace_modules')
    .where('workspace_id', '=', workspaceId)
    .where('module_id', '=', 'messaging')
    .select('enabled')
    .executeTakeFirst();

  if (moduleRow && !moduleRow.enabled) {
    ws.close(4003, 'Messaging module disabled');
    return;
  }

  // ── Register in WS registry + broadcast presence ──────────────────────────
  registerSocket(workspaceId, ws);

  broadcastToWorkspace(workspaceId, {
    type: 'user.presence',
    user_id: userId,
    status: 'online',
  });

  ws.on('close', () => {
    broadcastToWorkspace(workspaceId, {
      type: 'user.presence',
      user_id: userId,
      status: 'offline',
    });
  });

  // ── Handle client → server events ─────────────────────────────────────────
  ws.off('message', earlyHandler);

  function handleEvent(raw: Buffer) {
    let event: WsClientEvent;
    try {
      event = JSON.parse(raw.toString()) as WsClientEvent;
    } catch {
      return;
    }

    switch (event.type) {
      case 'subscribe':
        subscribeToChannels(ws, event.channel_ids);
        break;

      case 'typing.start':
        broadcastToWorkspace(workspaceId, {
          type: 'user.typing',
          channel_id: event.channel_id,
          user_id: userId,
          name: userName,
        });
        break;

      case 'typing.stop':
        // Client stops typing — no explicit broadcast needed; typing indicator
        // times out on clients after 3 seconds of no typing events
        break;

      case 'mark_read':
        // Update DB asynchronously
        db.insertInto('channel_read_state')
          .values({
            channel_id: event.channel_id,
            user_id: userId,
            last_read_message_id: event.message_id,
          })
          .onConflict(oc =>
            oc.columns(['channel_id', 'user_id']).doUpdateSet({
              last_read_message_id: event.message_id,
            }),
          )
          .execute()
          .catch((err: unknown) => logger.error({ err }, '[messaging-ws] mark_read failed'));
        break;

      default:
        break;
    }
  }

  ws.on('message', handleEvent);

  // Drain early-buffered messages
  for (const raw of earlyMessages) handleEvent(raw);

  ws.on('error', (err) => {
    logger.error({ err, userId }, '[messaging-ws] socket error');
  });
}
