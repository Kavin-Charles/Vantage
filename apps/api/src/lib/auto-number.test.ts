import { describe, it, expect, vi } from 'vitest';
import { formatAutoNumber, generateRecordNumber } from './auto-number';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

describe('formatAutoNumber', () => {
  it('formats PREFIX-YY-NNN', () => {
    const result = formatAutoNumber('PREFIX-YY-NNN', 'ATP', 1, new Date('2024-03-15'));
    expect(result).toBe('ATP-24-001');
  });

  it('formats PREFIX-YYYY-NNNN', () => {
    const result = formatAutoNumber('PREFIX-YYYY-NNNN', 'JOB', 42, new Date('2024-03-15'));
    expect(result).toBe('JOB-2024-0042');
  });

  it('formats NNNNN zero-padded to 5', () => {
    const result = formatAutoNumber('PREFIX-NNNNN', 'Q', 7, new Date('2024-01-01'));
    expect(result).toBe('Q-00007');
  });

  it('pads sequence to length of token', () => {
    const result = formatAutoNumber('NNN', '', 999, new Date('2024-01-01'));
    expect(result).toBe('999');
  });

  it('handles sequence beyond padding width', () => {
    const result = formatAutoNumber('PREFIX-NNN', 'X', 1234, new Date('2024-01-01'));
    expect(result).toBe('X-1234');
  });
});

describe('generateRecordNumber', () => {
  function buildMockDb(updateResult: unknown) {
    const chain: Record<string, unknown> = {};
    for (const m of ['updateTable', 'set', 'where', 'returning', 'executeTakeFirst']) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain['executeTakeFirst'] = vi.fn().mockResolvedValue(updateResult);
    return { updateTable: vi.fn().mockReturnValue(chain) };
  }

  it('returns null when record type not found or auto_number_enabled=false', async () => {
    const db = buildMockDb(undefined);
    const result = await generateRecordNumber(db as unknown as Kysely<Database>, 'rt-1');
    expect(result).toBeNull();
  });

  it('returns formatted number when auto_number_enabled=true', async () => {
    const db = buildMockDb({
      auto_number_sequence: 1,
      auto_number_prefix: 'ATP',
      auto_number_format: 'PREFIX-YY-NNN',
    });
    const result = await generateRecordNumber(db as unknown as Kysely<Database>, 'rt-1');
    // Should be ATP-{current 2-digit year}-001
    expect(result).toMatch(/^ATP-\d{2}-001$/);
  });
});
