import { google } from 'googleapis';
import type { MailProvider, FetchedEmail, SendEmailParams, SyncCursor } from './mail-provider';

interface GmailProviderOptions {
  accessToken: string;
  refreshToken: string;
  onTokenRefreshed?: (newAccessToken: string) => Promise<void>;
}

// Labels that map to a real user-visible folder
const SYNC_LABELS = ['INBOX', 'SENT', 'TRASH', 'SPAM', 'DRAFT'] as const;

function labelToFolder(labels: string[]): FetchedEmail['folder'] | null {
  if (labels.includes('TRASH')) return 'trash';
  if (labels.includes('SPAM')) return 'spam';
  if (labels.includes('SENT')) return 'sent';
  if (labels.includes('DRAFT')) return 'drafts';
  if (labels.includes('INBOX')) return 'inbox';
  // archived / all-mail only — skip, don't store
  return null;
}

function parseAddressList(header: string | null | undefined): string[] {
  if (!header) return [];
  return header.split(',').map(s => {
    const m = s.match(/<(.+?)>/);
    return m ? m[1]!.trim() : s.trim();
  }).filter(Boolean);
}

function parseFrom(from: string): { address: string; name: string | null } {
  const m = from.match(/^(.+?)\s*<(.+?)>$/);
  return m ? { name: m[1]!.trim() || null, address: m[2]!.trim() } : { name: null, address: from.trim() };
}

export function createGmailProvider(opts: GmailProviderOptions): MailProvider {
  const auth = new google.auth.OAuth2(
    process.env['GOOGLE_CLIENT_ID'],
    process.env['GOOGLE_CLIENT_SECRET'],
    process.env['GOOGLE_REDIRECT_URI'],
  );
  auth.setCredentials({ access_token: opts.accessToken, refresh_token: opts.refreshToken });

  if (opts.onTokenRefreshed) {
    auth.on('tokens', tokens => {
      if (tokens.access_token && opts.onTokenRefreshed) {
        void opts.onTokenRefreshed(tokens.access_token);
      }
    });
  }

  const gmail = google.gmail({ version: 'v1', auth });

  async function getMessage(id: string): Promise<FetchedEmail | null> {
    try {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'To', 'Cc', 'Bcc', 'Date'],
      });
      const headers = data.payload?.headers ?? [];
      const h = (name: string) => headers.find(x => x.name?.toLowerCase() === name)?.value ?? null;
      const { address: from_address, name: from_name } = parseFrom(h('from') ?? '');
      const labels = data.labelIds ?? [];
      const folder = labelToFolder(labels);
      if (!folder) return null; // archived / all-mail only — skip

      return {
        message_id: data.id!,
        thread_id: data.threadId ?? null,
        subject: h('subject'),
        from_address,
        from_name,
        to_addresses: parseAddressList(h('to')),
        cc_addresses: parseAddressList(h('cc')),
        bcc_addresses: parseAddressList(h('bcc')),
        snippet: data.snippet?.slice(0, 300) ?? null,
        folder,
        is_read: !labels.includes('UNREAD'),
        is_starred: labels.includes('STARRED'),
        sent_at: new Date(Number(data.internalDate)).toISOString(),
      };
    } catch {
      return null;
    }
  }

  return {
    async fetchAll(onBatch) {
      let pageToken: string | undefined;
      do {
        const list = await gmail.users.messages.list({ userId: 'me', maxResults: 100, pageToken });
        const ids = (list.data.messages ?? []).map(m => m.id!).filter(Boolean);
        const emails: FetchedEmail[] = [];
        for (const id of ids) {
          const e = await getMessage(id);
          if (e) emails.push(e);
        }
        if (emails.length) await onBatch(emails);
        pageToken = list.data.nextPageToken ?? undefined;
      } while (pageToken);

      const profile = await gmail.users.getProfile({ userId: 'me' });
      return { historyId: profile.data.historyId ?? undefined };
    },

    async fetchIncremental(cursor: SyncCursor) {
      if (!cursor.historyId) return { emails: [], newCursor: cursor };
      try {
        const history = await gmail.users.history.list({
          userId: 'me',
          startHistoryId: cursor.historyId,
        });
        const newHistoryId = history.data.historyId ?? cursor.historyId;
        const addedIds = new Set<string>();
        for (const record of history.data.history ?? []) {
          for (const a of record.messagesAdded ?? []) {
            if (a.message?.id) addedIds.add(a.message.id);
          }
        }
        const emails: FetchedEmail[] = [];
        for (const id of addedIds) {
          const e = await getMessage(id);
          if (e) emails.push(e);
        }
        return { emails, newCursor: { historyId: newHistoryId } };
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 404) throw new Error('HISTORY_EXPIRED');
        throw err;
      }
    },

    async fetchBody(messageId: string) {
      try {
        const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });

        let body_html: string | null = null;
        let body_text: string | null = null;

        function parseParts(parts: NonNullable<typeof data.payload>['parts']): void {
          if (!parts) return;
          for (const p of parts) {
            if (p.mimeType === 'text/html' && p.body?.data) {
              body_html ??= Buffer.from(p.body.data, 'base64url').toString('utf8');
            } else if (p.mimeType === 'text/plain' && p.body?.data) {
              body_text ??= Buffer.from(p.body.data, 'base64url').toString('utf8');
            }
            if (p.parts) parseParts(p.parts);
          }
        }

        if (data.payload?.body?.data) {
          const raw = Buffer.from(data.payload.body.data, 'base64url').toString('utf8');
          if (data.payload.mimeType === 'text/html') body_html = raw;
          else body_text = raw;
        } else {
          parseParts(data.payload?.parts);
        }

        return { body_html, body_text };
      } catch (err: unknown) {
        const code = (err as { code?: number }).code ?? (err as { status?: number }).status;
        if (code === 404) return { body_html: null, body_text: null };
        throw err;
      }
    },

    async sendEmail(params: SendEmailParams) {
      const lines = [
        `To: ${params.to.join(', ')}`,
        ...(params.cc?.length ? [`Cc: ${params.cc.join(', ')}`] : []),
        ...(params.bcc?.length ? [`Bcc: ${params.bcc.join(', ')}`] : []),
        `Subject: ${params.subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        params.body_html,
      ];
      const raw = Buffer.from(lines.join('\r\n')).toString('base64url');

      let threadId: string | undefined;
      if (params.reply_to_message_id) {
        try {
          const orig = await gmail.users.messages.get({ userId: 'me', id: params.reply_to_message_id });
          threadId = orig.data.threadId ?? undefined;
        } catch { /* ignore */ }
      }

      const sent = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw, threadId },
      });
      return { message_id: sent.data.id! };
    },

    async updateEmail(message_id: string, update: { is_read?: boolean; is_starred?: boolean; folder?: string }) {
      const add: string[] = [];
      const remove: string[] = [];
      if (update.is_read === true) remove.push('UNREAD');
      if (update.is_read === false) add.push('UNREAD');
      if (update.is_starred === true) add.push('STARRED');
      if (update.is_starred === false) remove.push('STARRED');
      if (update.folder === 'trash') add.push('TRASH');
      if (add.length || remove.length) {
        await gmail.users.messages.modify({
          userId: 'me',
          id: message_id,
          requestBody: { addLabelIds: add, removeLabelIds: remove },
        });
      }
    },
  };
}
