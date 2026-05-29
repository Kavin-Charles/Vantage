// apps/api/src/ws/mail-ws.ts
// WebSocket handler for real-time mail delivery.
// Auth via 'vantage_token' cookie (same pattern as ssh-terminal.ts).
import type { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import type { WebSocket } from 'ws';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { mailNotifier } from '../lib/mail-notifier';
import { logger } from '../lib/logger';

interface JwtPayload {
  sub: string;
  workspaceId: string;
}

function parseCookies(header: string): Record<string, string> {
  return Object.fromEntries(
    header.split(';').map(c => {
      const idx = c.indexOf('=');
      if (idx < 0) return [c.trim(), ''];
      return [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
    }),
  );
}

export async function handleMailWsUpgrade(
  ws: WebSocket,
  request: IncomingMessage,
  db: Kysely<Database>,
  jwtSecret: string,
): Promise<void> {
  const cookies = parseCookies(request.headers.cookie ?? '');
  const token = cookies['vantage_token'];

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
    .select(['id'])
    .executeTakeFirst();

  if (!user) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  mailNotifier.subscribe(user.id, ws);
  logger.info({ userId: user.id }, 'mail-ws: client connected');

  // Keep-alive ping every 30 s
  const heartbeat = setInterval(() => {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify({ type: 'ping' }));
    } else {
      clearInterval(heartbeat);
    }
  }, 30_000);

  ws.on('close', () => {
    clearInterval(heartbeat);
    mailNotifier.unsubscribe(user.id, ws);
    logger.info({ userId: user.id }, 'mail-ws: client disconnected');
  });
}
