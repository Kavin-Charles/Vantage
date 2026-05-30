// apps/api/src/workers/imap-idle.ts
// Maintains long-lived IMAP IDLE connections per active IMAP account.
// On new-mail notification, triggers incremental sync.
// Falls back gracefully if IDLE is not supported by the server.
import { ImapFlow } from 'imapflow';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { decryptSecret } from '../lib/mail-crypto';
import { runIncrementalSync } from './mail-sync';
import { logger } from '../lib/logger';

interface IdleConnection {
  client: ImapFlow;
  accountId: string;
  retryDelay: number; // ms, doubles on each reconnect up to MAX_RETRY_MS
}

const connections = new Map<string, IdleConnection>();
const MAX_RETRY_MS = 60_000;

async function startIdleForAccount(
  db: Kysely<Database>,
  accountId: string,
): Promise<void> {
  const account = await db
    .selectFrom('email_accounts')
    .where('id', '=', accountId)
    .where('provider', '=', 'imap')
    .selectAll()
    .executeTakeFirst();
  if (!account) return;
  if (!account.imap_host || !account.imap_user || !account.imap_pass) return;

  const conn: IdleConnection = {
    accountId,
    retryDelay: 1000,
    client: new ImapFlow({
      host: account.imap_host,
      port: account.imap_port ?? 993,
      secure: account.use_ssl,
      auth: {
        user: account.imap_user,
        pass: decryptSecret(account.imap_pass),
      },
      logger: false,
    }),
  };

  connections.set(accountId, conn);

  const connect = async () => {
    try {
      await conn.client.connect();
      const mailbox = await conn.client.getMailboxLock('INBOX');

      try {
        conn.client.on('exists', () => {
          logger.info({ accountId }, 'imap-idle: new mail detected');
          void runIncrementalSync(db, accountId);
        });

        // idle() blocks until connection drops, server sends BYE, or timeout
        await conn.client.idle();
      } finally {
        mailbox.release();
      }
    } catch (err) {
      logger.error({ err, accountId }, 'imap-idle: connection error');
    }

    // Reconnect with exponential backoff if still tracked
    if (connections.has(accountId)) {
      const delay = conn.retryDelay;
      conn.retryDelay = Math.min(conn.retryDelay * 2, MAX_RETRY_MS);
      logger.info({ accountId, delay }, 'imap-idle: reconnecting after delay');
      setTimeout(() => void connect(), delay);
    }
  };

  void connect();
}

export async function startImapIdle(db: Kysely<Database>): Promise<void> {
  const accounts = await db
    .selectFrom('email_accounts')
    .where('provider', '=', 'imap')
    .select('id')
    .execute();

  for (const { id } of accounts) {
    void startIdleForAccount(db, id).catch(err =>
      logger.error({ err, id }, 'imap-idle: failed to start for account'),
    );
  }

  logger.info({ count: accounts.length }, 'imap-idle: started connections');
}

export async function stopImapIdle(): Promise<void> {
  const entries = Array.from(connections.entries());
  connections.clear();
  await Promise.allSettled(
    entries.map(async ([, conn]) => {
      try { await conn.client.logout(); } catch { /* ignore */ }
    }),
  );
}
