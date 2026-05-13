'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';
import { parseCSV, downloadCSV } from '@/lib/csv';

interface Props {
  /** e.g. 'contacts', 'companies', 'deals' */
  resource: string;
  /** Filename for downloaded CSV */
  filename: string;
  /** Extra query params appended to export URL, e.g. { pipeline_id: '...' } */
  exportParams?: Record<string, string>;
  /** Extra body fields sent with import POST, e.g. { pipeline_id, stage_id } */
  importExtra?: Record<string, string>;
  /** Called after successful import so parent can refetch */
  onImported?: (result: { created: number; errors: string[] }) => void;
  /** Template headers shown in the downloaded template CSV */
  templateHeaders: string[];
}

export function CsvImportExport({
  resource,
  filename,
  exportParams = {},
  importExtra = {},
  onImported,
  templateHeaders,
}: Props) {
  const getToken = useApiToken();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const token = await getToken();
      const qs = new URLSearchParams(exportParams).toString();
      const url = `${process.env['NEXT_PUBLIC_API_URL'] ?? ''}/api/${resource}/export${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const text = await res.text();
      downloadCSV(filename, text);
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_CSV_BYTES) {
      alert('File too large. Maximum CSV size is 5 MB.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) { alert('No rows found in CSV.'); return; }
      const token = await getToken();
      const result = await apiFetch<{ data: { created: number; errors: string[] }; error: null }>(
        `/api/${resource}/import`,
        { method: 'POST', body: JSON.stringify({ rows, ...importExtra }), token },
      );
      const { created, errors } = result.data;
      const msg = [`Imported ${created} record${created !== 1 ? 's' : ''}.`];
      if (errors.length > 0) msg.push(`${errors.length} error(s):\n${errors.slice(0, 5).join('\n')}`);
      alert(msg.join('\n'));
      onImported?.({ created, errors });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function downloadTemplate() {
    downloadCSV(`${resource}-template.csv`, templateHeaders.join(',') + '\n');
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
      <Button onClick={downloadTemplate}>Template</Button>
      <Button onClick={() => fileRef.current?.click()} disabled={importing}>
        {importing ? 'Importing…' : 'Import CSV'}
      </Button>
      <Button onClick={handleExport} disabled={exporting}>
        {exporting ? 'Exporting…' : 'Export CSV'}
      </Button>
    </div>
  );
}
