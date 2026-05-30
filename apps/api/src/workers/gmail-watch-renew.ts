// apps/api/src/workers/gmail-watch-renew.ts
import { google } from 'googleapis';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { apiEnvSchema } from '@vantage/config';
import { decryptSecret } from '../lib/mail-crypto';
import { logger } from '../lib/logger';

const apiEnv = apiEnvSchema.parse(process.env);

const WATCH_EXPIRY_BUFFER_MS = 24 * 60 * 60 * 1000; // renew 1 day before expiry

export async function registerGmailWatch(
  db: Kysely<Database>,
  accountId: string,
): Promise<void> {
  const topic = apiEnv.GOOGLE_PUBSUB_TOPIC;
  if (!topic) return; // not configured — skip silently

  const account = await db
    .selectFrom('email_accounts')
    .where('id', '=', accountId)
    .where('provider', '=', 'gmail')
    .selectAll()
    .executeTakeFirst();
  if (!account) return;
  if (!account.access_token) return;

  const auth = new google.auth.OAuth2(
    apiEnv.GOOGLE_CLIENT_ID,
    apiEnv.GOOGLE_CLIENT_SECRET,
    apiEnv.GOOGLE_REDIRECT_URI,
  );
  auth.setCredentials({
    access_token: decryptSecret(account.access_token),
    refresh_token: account.refresh_token ? decryptSecret(account.refresh_token) : undefined,
  });

  const gmail = google.gmail({ version: 'v1', auth });
  const watchRes = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: topic,
      labelIds: ['INBOX'],
    },
  });

  const expiryMs = Number(watchRes.data.expiration ?? 0);
  const expiryIso = expiryMs > 0 ? new Date(expiryMs).toISOString() : null;

  await db.updateTable('email_accounts')
    .set({ gmail_watch_expiry: expiryIso, updated_at: new Date().toISOString() })
    .where('id', '=', accountId)
    .execute();

  logger.info({ accountId, expiry: expiryIso }, 'mail: gmail watch registered');
}

let renewInterval: ReturnType<typeof setInterval> | null = null;

export function startGmailWatchRenew(db: Kysely<Database>): void {
  if (renewInterval) return;

  const run = async () => {
    const cutoff = new Date(Date.now() + WATCH_EXPIRY_BUFFER_MS).toISOString();
    try {
      const accounts = await db
        .selectFrom('email_accounts')
        .where('provider', '=', 'gmail')
        .where(eb => eb.or([
          eb('gmail_watch_expiry', 'is', null),
          eb('gmail_watch_expiry', '<', cutoff),
        ]))
        .select('id')
        .execute();

      for (const { id } of accounts) {
        void registerGmailWatch(db, id).catch(err =>
          logger.error({ err, id }, 'mail: gmail watch renewal failed'),
        );
      }
    } catch (err) {
      logger.error({ err }, 'mail: gmail watch renew scheduler error');
    }
  };

  // Run once on startup, then every 6 hours
  void run();
  renewInterval = setInterval(run, 6 * 60 * 60 * 1000);
  logger.info('mail: gmail watch renewal started (6-hour interval)');
}

export function stopGmailWatchRenew(): void {
  if (renewInterval) { clearInterval(renewInterval); renewInterval = null; }
}
