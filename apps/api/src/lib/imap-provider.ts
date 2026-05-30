import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import type { MailProvider, FetchedEmail, SendEmailParams, SyncCursor } from './mail-provider';

interface ImapProviderOptions {
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_pass: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  use_ssl: boolean;
}

type EmailFolder = FetchedEmail['folder'];

const MAILBOX_MAP: Record<string, EmailFolder> = {
  INBOX: 'inbox',
  Sent: 'sent',
  'Sent Items': 'sent',
  'Sent Messages': 'sent',
  Drafts: 'drafts',
  Trash: 'trash',
  Deleted: 'trash',
  'Deleted Items': 'trash',
  Spam: 'spam',
  Junk: 'spam',
  'Junk Email': 'spam',
};

function makeClient(opts: ImapProviderOptions): ImapFlow {
  return new ImapFlow({
    host: opts.imap_host,
    port: opts.imap_port,
    secure: opts.use_ssl,
    auth: { user: opts.imap_user, pass: opts.imap_pass },
    logger: false,
  });
}

export function createImapProvider(opts: ImapProviderOptions): MailProvider {
  return {
    async fetchAll(onBatch) {
      const client = makeClient(opts);
      await client.connect();
      let uidvalidity = 0;
      let uidnext = 1;

      try {
        for (const [mailboxName, folder] of Object.entries(MAILBOX_MAP)) {
          try {
            const mailbox = await client.mailboxOpen(mailboxName);
            uidvalidity = Number(mailbox.uidValidity);
            uidnext = Number(mailbox.uidNext);
            const emails: FetchedEmail[] = [];

            for await (const msg of client.fetch('1:*', { envelope: true })) {
              const env = msg.envelope;
              if (!env) continue;

              emails.push({
                message_id: env.messageId ?? `imap-${mailboxName}-${msg.uid}`,
                thread_id: null,
                subject: env.subject ?? null,
                from_address: env.from?.[0]?.address ?? '',
                from_name: env.from?.[0]?.name ?? null,
                to_addresses: (env.to ?? []).map(a => a.address).filter((a): a is string => Boolean(a)),
                cc_addresses: (env.cc ?? []).map(a => a.address).filter((a): a is string => Boolean(a)),
                bcc_addresses: (env.bcc ?? []).map(a => a.address).filter((a): a is string => Boolean(a)),
                snippet: null,
                folder,
                is_read: msg.flags?.has('\\Seen') ?? false,
                is_starred: msg.flags?.has('\\Flagged') ?? false,
                sent_at: env.date?.toISOString() ?? new Date().toISOString(),
              });

              if (emails.length >= 50) {
                await onBatch([...emails]);
                emails.length = 0;
              }
            }

            if (emails.length) await onBatch(emails);
          } catch { /* mailbox doesn't exist — skip */ }
        }
      } finally {
        await client.logout();
      }

      return { uidvalidity, uidnext };
    },

    async fetchIncremental(cursor: SyncCursor) {
      if (!cursor.uidnext || !cursor.uidvalidity) return { emails: [], newCursor: cursor };

      const client = makeClient(opts);
      await client.connect();
      const emails: FetchedEmail[] = [];

      try {
        const mailbox = await client.mailboxOpen('INBOX');
        if (Number(mailbox.uidValidity) !== cursor.uidvalidity) throw new Error('UIDVALIDITY_CHANGED');

        const newUidnext = Number(mailbox.uidNext);
        if (newUidnext > (cursor.uidnext ?? 1)) {
          for await (const msg of client.fetch(`${cursor.uidnext}:*`, { envelope: true }, { uid: true })) {
            const env = msg.envelope;
            if (!env) continue;

            emails.push({
              message_id: env.messageId ?? `imap-inbox-${msg.uid}`,
              thread_id: null,
              subject: env.subject ?? null,
              from_address: env.from?.[0]?.address ?? '',
              from_name: env.from?.[0]?.name ?? null,
              to_addresses: (env.to ?? []).map(a => a.address).filter((a): a is string => Boolean(a)),
              cc_addresses: (env.cc ?? []).map(a => a.address).filter((a): a is string => Boolean(a)),
              bcc_addresses: (env.bcc ?? []).map(a => a.address).filter((a): a is string => Boolean(a)),
              snippet: null,
              folder: 'inbox',
              is_read: msg.flags?.has('\\Seen') ?? false,
              is_starred: msg.flags?.has('\\Flagged') ?? false,
              sent_at: env.date?.toISOString() ?? new Date().toISOString(),
            });
          }
        }

        return { emails, newCursor: { uidnext: newUidnext, uidvalidity: cursor.uidvalidity } };
      } finally {
        await client.logout();
      }
    },

    async fetchBody(messageId: string) {
      const client = makeClient(opts);
      try {
        await client.connect();
        let sourceStr: string | null = null;

        // Synthetic IDs from our sync: imap-{MAILBOXNAME}-{UID}
        const syntheticMatch = messageId.match(/^imap-(.+)-(\d+)$/);

        if (syntheticMatch) {
          const mailboxName = syntheticMatch[1]!;
          const uid = Number(syntheticMatch[2]);
          try {
            await client.mailboxOpen(mailboxName);
            for await (const msg of client.fetch([uid], { source: true }, { uid: true })) {
              sourceStr = msg.source?.toString('utf8') ?? null;
              break;
            }
          } catch {
            return { body_html: null, body_text: null };
          }
        } else {
          // Real Message-ID: search across common mailboxes
          for (const mailboxName of ['INBOX', 'Sent', 'Sent Items', 'Sent Messages']) {
            try {
              await client.mailboxOpen(mailboxName);
              const uids = await client.search({ header: { 'Message-Id': messageId } }, { uid: true });
              if (uids && uids.length > 0) {
                for await (const msg of client.fetch([(uids as number[])[0]!], { source: true }, { uid: true })) {
                  sourceStr = msg.source?.toString('utf8') ?? null;
                  break;
                }
                if (sourceStr) break;
              }
            } catch { /* mailbox might not exist, try next */ }
          }
        }

        if (!sourceStr) return { body_html: null, body_text: null };

        const parsed = await simpleParser(sourceStr);
        return {
          body_html: parsed.html || null,
          body_text: parsed.text || null,
        };
      } finally {
        try { await client.logout(); } catch { /* ignore */ }
      }
    },

    async sendEmail(params: SendEmailParams) {
      const transporter = nodemailer.createTransport({
        host: opts.smtp_host,
        port: opts.smtp_port,
        secure: opts.use_ssl,
        auth: { user: opts.smtp_user, pass: opts.smtp_pass },
      });
      try {
        const info = await transporter.sendMail({
          from: opts.smtp_user,
          to: params.to.join(', '),
          cc: params.cc?.join(', '),
          bcc: params.bcc?.join(', '),
          subject: params.subject,
          html: params.body_html,
        });
        return { message_id: info.messageId };
      } finally {
        transporter.close();
      }
    },

    async updateEmail(message_id: string, update: { is_read?: boolean; is_starred?: boolean; folder?: string }) {
      const client = makeClient(opts);
      await client.connect();
      try {
        await client.mailboxOpen('INBOX');
        const uids = await client.search({ header: { 'Message-ID': message_id } }, { uid: true });
        if (!uids || !uids.length) return;
        const uid = (uids as number[])[0]!;
        if (update.is_read === true) await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
        if (update.is_read === false) await client.messageFlagsRemove({ uid }, ['\\Seen'], { uid: true });
        if (update.is_starred === true) await client.messageFlagsAdd({ uid }, ['\\Flagged'], { uid: true });
        if (update.is_starred === false) await client.messageFlagsRemove({ uid }, ['\\Flagged'], { uid: true });
        if (update.folder === 'trash') await client.messageMove({ uid }, 'Trash', { uid: true });
      } finally {
        await client.logout();
      }
    },
  };
}
