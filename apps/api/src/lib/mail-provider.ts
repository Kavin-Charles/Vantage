export interface FetchedEmail {
  message_id: string;
  thread_id: string | null;
  subject: string | null;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  snippet: string | null;
  folder: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam';
  is_read: boolean;
  is_starred: boolean;
  sent_at: string; // ISO timestamp
}

export interface SyncCursor {
  historyId?: string;    // Gmail incremental sync
  uidnext?: number;      // IMAP incremental sync
  uidvalidity?: number;  // IMAP — if this changes, full re-sync needed
}

export interface SendEmailParams {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body_html: string;
  reply_to_message_id?: string;
}

export interface MailProvider {
  /** Full sync. Calls onBatch per page. Returns cursor for future incremental syncs. */
  fetchAll(onBatch: (emails: FetchedEmail[]) => Promise<void>): Promise<SyncCursor>;

  /**
   * Incremental sync since cursor.
   * Throws Error('HISTORY_EXPIRED') or Error('UIDVALIDITY_CHANGED') if full re-sync needed.
   */
  fetchIncremental(cursor: SyncCursor): Promise<{ emails: FetchedEmail[]; newCursor: SyncCursor }>;

  /**
   * Fetch the full body of a single message by its provider message_id.
   * Returns null fields if the message cannot be found or body is unavailable.
   * Bodies are NEVER stored in the DB — this is a live fetch only.
   */
  fetchBody(messageId: string): Promise<{ body_html: string | null; body_text: string | null }>;

  /** Send an email. Returns provider's message_id. */
  sendEmail(params: SendEmailParams): Promise<{ message_id: string }>;

  /** Mirror a flag/folder change to the provider. */
  updateEmail(
    message_id: string,
    update: { is_read?: boolean; is_starred?: boolean; folder?: string },
  ): Promise<void>;
}
