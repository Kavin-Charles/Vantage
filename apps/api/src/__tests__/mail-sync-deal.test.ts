import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/log-activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/mail-notifier', () => ({ mailNotifier: { broadcast: vi.fn() } }));

import { logActivity } from '../lib/log-activity';
import { mailNotifier } from '../lib/mail-notifier';
import { storeEmailsForTest } from '../workers/mail-sync';

const fakeEmail = {
  message_id: 'msg-1',
  thread_id: null,
  subject: 'Hello',
  from_address: 'sender@test.com',
  from_name: 'Sender',
  to_addresses: ['me@test.com'],
  cc_addresses: [],
  bcc_addresses: [],
  body_html: '<p>Hi</p>',
  body_text: 'Hi',
  snippet: 'Hi',
  folder: 'inbox' as const,
  is_read: false,
  is_starred: false,
  sent_at: new Date().toISOString(),
};

function makeDb(opts: {
  contactId: string | null;
  dealId: string | null;
  insertedRow?: Record<string, unknown> | undefined;
}) {
  // contacts lookup, deals lookup (skipped if no contact), emails insert
  const mock = vi.fn()
    .mockResolvedValueOnce(opts.contactId ? { id: opts.contactId } : undefined);

  if (opts.contactId) {
    // deal lookup only happens when contactId is non-null
    mock.mockResolvedValueOnce(opts.dealId ? { id: opts.dealId } : undefined);
  }

  // insert result — undefined means conflict (doNothing), object means inserted
  const insertedRow = 'insertedRow' in opts
    ? opts.insertedRow
    : { id: 'email-1', deal_id: opts.dealId };
  mock.mockResolvedValueOnce(insertedRow);

  const executeTakeFirst = mock;

  return {
    selectFrom: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflict: vi.fn().mockReturnThis(),
    columns: vi.fn().mockReturnThis(),
    doNothing: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    executeTakeFirst,
  } as any;
}

describe('storeEmailsForTest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs activity with deal_id when contact has open deal', async () => {
    const db = makeDb({ contactId: 'contact-1', dealId: 'deal-1' });
    await storeEmailsForTest(db, 'account-1', 'workspace-1', 'user-1', [fakeEmail]);
    expect(logActivity).toHaveBeenCalledWith(db, expect.objectContaining({
      type: 'email',
      deal_id: 'deal-1',
      contact_id: 'contact-1',
    }));
  });

  it('broadcasts new_email to user', async () => {
    const db = makeDb({ contactId: 'contact-1', dealId: 'deal-1' });
    await storeEmailsForTest(db, 'account-1', 'workspace-1', 'user-1', [fakeEmail]);
    expect(mailNotifier.broadcast).toHaveBeenCalledWith('user-1', expect.objectContaining({ type: 'new_email' }));
  });

  it('does not log activity on conflict (no inserted row)', async () => {
    const db = makeDb({ contactId: null, dealId: null, insertedRow: undefined });
    await storeEmailsForTest(db, 'account-1', 'workspace-1', 'user-1', [fakeEmail]);
    expect(logActivity).not.toHaveBeenCalled();
    expect(mailNotifier.broadcast).not.toHaveBeenCalled();
  });
});
