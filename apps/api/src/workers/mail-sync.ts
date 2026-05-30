import type { Kysely } from 'kysely';
import type { Database, EmailAccount } from '@vantage/db';
import { decryptSecret, encryptSecret } from '../lib/mail-crypto';
import { createGmailProvider } from '../lib/gmail-provider';
import { createImapProvider } from '../lib/imap-provider';
import type { FetchedEmail, MailProvider } from '../lib/mail-provider';
import { logger } from '../lib/logger';
import { logActivity } from '../lib/log-activity';
import { mailNotifier } from '../lib/mail-notifier';

export function buildProvider(
  account: EmailAccount,
  onTokenRefreshed?: (token: string) => Promise<void>,
): MailProvider {
  if (account.provider === 'gmail') {
    return createGmailProvider({
      accessToken: decryptSecret(account.access_token!),
      refreshToken: decryptSecret(account.refresh_token!),
      onTokenRefreshed,
    });
  }
  return createImapProvider({
    imap_host: account.imap_host!,
    imap_port: account.imap_port!,
    imap_user: account.imap_user!,
    imap_pass: decryptSecret(account.imap_pass!),
    smtp_host: account.smtp_host!,
    smtp_port: account.smtp_port!,
    smtp_user: account.smtp_user!,
    smtp_pass: decryptSecret(account.smtp_pass!),
    use_ssl: account.use_ssl,
  });
}

async function autoLinkContact(
  db: Kysely<Database>,
  workspaceId: string,
  addresses: string[],
): Promise<string | null> {
  for (const addr of addresses) {
    if (!addr) continue;
    const contact = await db
      .selectFrom('contacts')
      .where('workspace_id', '=', workspaceId)
      .where('email', '=', addr.toLowerCase())
      .where('deleted_at', 'is', null)
      .select('id')
      .executeTakeFirst();
    if (contact) return contact.id;
  }
  return null;
}

async function autoLinkDeal(
  db: Kysely<Database>,
  workspaceId: string,
  contactId: string | null,
): Promise<string | null> {
  if (!contactId) return null;
  const deal = await db
    .selectFrom('deals')
    .innerJoin('pipeline_stages', 'pipeline_stages.id', 'deals.stage_id')
    .where('deals.workspace_id', '=', workspaceId)
    .where('deals.contact_id', '=', contactId)
    .where('deals.deleted_at', 'is', null)
    .where('pipeline_stages.is_won', '=', false)
    .where('pipeline_stages.is_lost', '=', false)
    .orderBy('deals.updated_at', 'desc')
    .select('deals.id')
    .executeTakeFirst();
  return deal?.id ?? null;
}

export async function storeEmailsForTest(
  db: Kysely<Database>,
  accountId: string,
  workspaceId: string,
  userId: string,
  emails: FetchedEmail[],
): Promise<void> {
  return storeEmails(db, accountId, workspaceId, userId, emails);
}

async function storeEmails(
  db: Kysely<Database>,
  accountId: string,
  workspaceId: string,
  userId: string,
  emails: FetchedEmail[],
): Promise<void> {
  for (const email of emails) {
    const allAddresses = [email.from_address, ...email.to_addresses, ...email.cc_addresses]
      .map(a => a.toLowerCase());
    const contactId = await autoLinkContact(db, workspaceId, allAddresses);
    const dealId = await autoLinkDeal(db, workspaceId, contactId);

    const inserted = await db
      .insertInto('emails')
      .values({
        account_id: accountId,
        workspace_id: workspaceId,
        user_id: userId,
        message_id: email.message_id,
        thread_id: email.thread_id,
        subject: email.subject,
        from_address: email.from_address,
        from_name: email.from_name,
        to_addresses: JSON.stringify(email.to_addresses) as unknown as string[],
        cc_addresses: JSON.stringify(email.cc_addresses) as unknown as string[],
        bcc_addresses: JSON.stringify(email.bcc_addresses) as unknown as string[],
        snippet: email.snippet,
        folder: email.folder,
        is_read: email.is_read,
        is_starred: email.is_starred,
        sent_at: email.sent_at,
        contact_id: contactId,
        deal_id: dealId,
      })
      .onConflict(oc => oc.columns(['account_id', 'message_id']).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (inserted) {
      void logActivity(db, {
        workspace_id: workspaceId,
        user_id: userId,
        type: 'email',
        body: email.subject ?? '(no subject)',
        contact_id: contactId ?? undefined,
        deal_id: dealId ?? undefined,
        meta: {
          email_id: inserted.id,
          direction: 'inbound',
          snippet: email.snippet ?? undefined,
        },
      });
      mailNotifier.broadcast(userId, { type: 'new_email', email: inserted });
    }
  }
}

export async function runFullSync(db: Kysely<Database>, accountId: string): Promise<void> {
  const account = await db
    .selectFrom('email_accounts')
    .where('id', '=', accountId)
    .selectAll()
    .executeTakeFirst();
  if (!account) return;

  await db.updateTable('email_accounts')
    .set({ sync_status: 'syncing', sync_error: null, updated_at: new Date().toISOString() })
    .where('id', '=', accountId)
    .execute();

  try {
    const provider = buildProvider(account, async (newToken) => {
      await db.updateTable('email_accounts')
        .set({ access_token: encryptSecret(newToken), updated_at: new Date().toISOString() })
        .where('id', '=', accountId)
        .execute();
    });

    const cursor = await provider.fetchAll(async (emails) => {
      await storeEmails(db, accountId, account.workspace_id, account.user_id, emails);
    });

    await db.updateTable('email_accounts')
      .set({
        sync_status: 'idle',
        last_synced_at: new Date().toISOString(),
        gmail_history_id: cursor.historyId ?? account.gmail_history_id,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', accountId)
      .execute();
  } catch (err) {
    logger.error({ err, accountId }, 'mail: full sync failed');
    await db.updateTable('email_accounts')
      .set({
        sync_status: 'error',
        sync_error: err instanceof Error ? err.message : String(err),
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', accountId)
      .execute();
  }
}

export async function runIncrementalSync(db: Kysely<Database>, accountId: string): Promise<void> {
  const account = await db
    .selectFrom('email_accounts')
    .where('id', '=', accountId)
    .selectAll()
    .executeTakeFirst();
  if (!account || account.sync_status === 'syncing') return;

  try {
    const provider = buildProvider(account);
    const cursor = { historyId: account.gmail_history_id ?? undefined };

    let result: Awaited<ReturnType<typeof provider.fetchIncremental>>;
    try {
      result = await provider.fetchIncremental(cursor);
    } catch (err) {
      if (err instanceof Error && (err.message === 'HISTORY_EXPIRED' || err.message === 'UIDVALIDITY_CHANGED')) {
        void runFullSync(db, accountId);
        return;
      }
      throw err;
    }

    if (result.emails.length) {
      await storeEmails(db, accountId, account.workspace_id, account.user_id, result.emails);
    }

    await db.updateTable('email_accounts')
      .set({
        last_synced_at: new Date().toISOString(),
        gmail_history_id: result.newCursor.historyId ?? account.gmail_history_id,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', accountId)
      .execute();
  } catch (err) {
    logger.error({ err, accountId }, 'mail: incremental sync failed');
    await db.updateTable('email_accounts')
      .set({
        sync_status: 'error',
        sync_error: err instanceof Error ? err.message : String(err),
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', accountId)
      .execute();
  }
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startMailSync(db: Kysely<Database>): void {
  if (syncInterval) return;
  syncInterval = setInterval(async () => {
    try {
      const accounts = await db
        .selectFrom('email_accounts')
        .where('sync_status', '!=', 'syncing')
        .select('id')
        .execute();
      for (const { id } of accounts) void runIncrementalSync(db, id);
    } catch (err) {
      logger.error({ err }, 'mail: sync scheduler error');
    }
  }, 5 * 60 * 1000);
  logger.info('mail: sync worker started (5-min polling)');
}

export function stopMailSync(): void {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
}
