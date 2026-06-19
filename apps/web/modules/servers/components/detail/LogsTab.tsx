'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/modules/shared/components/ui/Button';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { openSshStream } from '@/modules/servers/lib/ssh';

export function LogsTab({ serverId }: { serverId: string }) {
  const getToken = useApiToken();
  const [source, setSource] = useState<'journalctl' | 'file'>('journalctl');
  const [service, setService] = useState('');
  const [filePath, setFilePath] = useState('');
  const [lines, setLines] = useState(200);
  const [output, setOutput] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const ctrlRef = useRef<ReturnType<typeof openSshStream> | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sourceRef = useRef(source);
  const serviceRef = useRef(service);
  const filePathRef = useRef(filePath);
  const linesRef = useRef(lines);

  useEffect(() => {
    return () => { ctrlRef.current?.abort(); };
  }, []);

  useEffect(() => { sourceRef.current = source; }, [source]);
  useEffect(() => { serviceRef.current = service; }, [service]);
  useEffect(() => { filePathRef.current = filePath; }, [filePath]);
  useEffect(() => { linesRef.current = lines; }, [lines]);

  function fetchLogs() {
    ctrlRef.current?.abort();
    setLoading(true);
    setOutput([]);
    const body = sourceRef.current === 'journalctl'
      ? { source: 'journalctl', service: serviceRef.current || undefined, lines: linesRef.current }
      : { source: 'file', path: filePathRef.current, lines: linesRef.current };
    getToken().then(token => {
      ctrlRef.current = openSshStream(
        `/api/servers/${serverId}/ssh/logs`,
        body,
        token,
        (event) => {
          if (event.type === 'stdout') {
            setOutput(prev => [...prev, event.line]);
            setTimeout(() => outputRef.current?.scrollTo(0, outputRef.current.scrollHeight), 0);
          }
          if (event.type === 'exit' || event.type === 'error') setLoading(false);
        },
      );
    });
  }

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(fetchLogs, 10_000);
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={source} onChange={e => setSource(e.target.value as 'journalctl' | 'file')}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)' }}>
          <option value="journalctl">journalctl</option>
          <option value="file">File path</option>
        </select>
        {source === 'journalctl' ? (
          <input value={service} onChange={e => setService(e.target.value)} placeholder="Service (optional)"
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', width: 180 }} />
        ) : (
          <input value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="/var/log/app.log"
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', width: 240 }} />
        )}
        <select value={lines} onChange={e => setLines(Number(e.target.value))}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)' }}>
          {[50, 200, 500, 1000].map(n => <option key={n} value={n}>{n} lines</option>)}
        </select>
        <Button onClick={fetchLogs} disabled={loading}>{loading ? 'Loading…' : 'Fetch'}</Button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
          Auto-refresh (10s)
        </label>
      </div>
      <pre ref={outputRef}
        style={{ background: '#1a1814', color: '#f0ede6', borderRadius: 8, padding: 16, fontSize: 12, fontFamily: 'monospace', minHeight: 200, maxHeight: 500, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
        {output.join('\n')}
      </pre>
    </div>
  );
}
