import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

/**
 * Format a record number from a format string.
 * Tokens: PREFIX, YY, YYYY, NNN, NNNN, NNNNN
 */
export function formatAutoNumber(
  format: string,
  prefix: string,
  sequence: number,
  date: Date = new Date(),
): string {
  const yy = String(date.getFullYear()).slice(-2);
  const yyyy = String(date.getFullYear());

  return format
    .replaceAll('PREFIX', prefix)
    .replaceAll('YYYY', yyyy)
    .replaceAll('YY', yy)
    .replaceAll('NNNNN', String(sequence).padStart(5, '0'))
    .replaceAll('NNNN', String(sequence).padStart(4, '0'))
    .replaceAll('NNN', String(sequence).padStart(3, '0'));
}

/**
 * Atomically increment sequence and return formatted record number.
 * Returns null if auto_number_enabled is false.
 */
export async function generateRecordNumber(
  db: Kysely<Database>,
  recordTypeId: string,
): Promise<string | null> {
  const updated = await db
    .updateTable('record_types')
    .set(eb => ({ auto_number_sequence: eb('auto_number_sequence', '+', 1) }))
    .where('id', '=', recordTypeId)
    .where('auto_number_enabled', '=', true)
    .returning(['auto_number_sequence', 'auto_number_prefix', 'auto_number_format'])
    .executeTakeFirst();

  if (!updated) return null;

  return formatAutoNumber(
    updated.auto_number_format,
    updated.auto_number_prefix,
    updated.auto_number_sequence,
  );
}
