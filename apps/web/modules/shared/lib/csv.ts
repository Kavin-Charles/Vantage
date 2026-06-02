/**
 * Minimal RFC 4180-compliant CSV parser.
 * Returns array of objects keyed by header row.
 */
export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = splitCSVRows(lines);
  if (rows.length < 2) return [];
  const headers = parseCSVRow(rows[0]!);
  const result: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!.trim();
    if (!row) continue;
    const values = parseCSVRow(row);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h.trim()] = values[idx] ?? ''; });
    result.push(obj);
  }
  return result;
}

function splitCSVRows(text: string): string[] {
  const rows: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === '\n' && !inQuotes) {
      rows.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) rows.push(current);
  return rows;
}

function parseCSVRow(row: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!;
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** Trigger a CSV file download in the browser from a Blob URL. */
export function downloadCSV(filename: string, csvText: string): void {
  const blob = new Blob([csvText], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
