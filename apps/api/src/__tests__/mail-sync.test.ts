import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeEmailsForTest } from '../workers/mail-sync';

const insertMock = vi.fn();

function makeDb() {
  return {
    insertInto: (_table: string) => ({
      values: (vals: unknown) => {
        insertMock(vals);
        return {
          onConflict: () => ({
            returningAll: () => ({
              executeTakeFirst: vi.fn().mockResolvedValue(null),
            }),
          }),
        };
      },
    }),
    selectFrom: (_table: string) => ({
      innerJoin: () => ({
        where: () => ({
          where: () => ({
            where: () => ({
              where: () => ({
                where: () => ({
                  orderBy: () => ({
                    select: () => ({ executeTakeFirst: vi.fn().mockResolvedValue(null) }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
      where: () => ({
        where: () => ({
          where: () => ({
            select: () => ({ executeTakeFirst: vi.fn().mockResolvedValue(null) }),
            selectAll: () => ({ executeTakeFirst: vi.fn().mockResolvedValue(null) }),
          }),
          select: () => ({ executeTakeFirst: vi.fn().mockResolvedValue(null) }),
          selectAll: () => ({ executeTakeFirst: vi.fn().mockResolvedValue(null) }),
        }),
      }),
    }),
  } as any;
}

describe('storeEmails JSONB', () => {
  beforeEach(() => insertMock.mockClear());

  it('JSON.stringifies address arrays for JSONB columns', async () => {
    await storeEmailsForTest(makeDb(), 'acc-1', 'ws-1', 'user-1', [{
      message_id: 'msg-1',
      thread_id: null,
      subject: 'Test',
      from_address: 'a@example.com',
      from_name: null,
      to_addresses: ['b@example.com', 'c@example.com'],
      cc_addresses: [],
      bcc_addresses: [],
      snippet: null,
      folder: 'inbox' as const,
      is_read: false,
      is_starred: false,
      sent_at: new Date().toISOString(),
    }]);

    const vals = insertMock.mock.calls[0]?.[0];
    expect(vals.to_addresses).toBe('["b@example.com","c@example.com"]');
    expect(vals.cc_addresses).toBe('[]');
    expect(vals.bcc_addresses).toBe('[]');
    // body_html and body_text should NOT be in the insert
    expect('body_html' in vals).toBe(false);
    expect('body_text' in vals).toBe(false);
  });
});
