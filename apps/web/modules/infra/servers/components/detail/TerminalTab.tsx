'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/modules/shared/components/ui/Button';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { openSshStream, getSshHistory } from '@/modules/infra/servers/lib/ssh';
import type { SshCommandLog } from '@vencore/types';

export function TerminalTab({ serverId }: { serverId: string }) {
  const getToken = useApiToken();
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState<Array<{ type: string; text: string }>>([]);
  const [running, setRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [history, setHistory] = useState<SshCommandLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const streamRef = useRef<AbortController | null>(null);

  async function fetchHistory() {
    const token = await getToken();
    const result = await getSshHistory(token, serverId);
    setHistory(result.data);
  }

  useEffect(() => {
    return () => { streamRef.current?.abort(); };
  }, []);

  async function runCmd() {
    if (!command.trim() || running) return;
    streamRef.current?.abort();
    setRunning(true);
    setOutput([]);
    setExitCode(null);
    const token = await getToken();

    streamRef.current = openSshStream(
      `/api/servers/${serverId}/ssh/exec`,
      { command },
      token,
      (event) => {
        if (event.type === 'stdout' || event.type === 'stderr') {
          setOutput(prev => [...prev, { type: event.type, text: event.line }]);
          setTimeout(() => outputRef.current?.scrollTo(0, outputRef.current.scrollHeight), 0);
        } else if (event.type === 'exit') {
          setExitCode(event.code);
          setRunning(false);
          void fetchHistory();
        } else if (event.type === 'error') {
          setOutput(prev => [...prev, { type: 'error', text: event.message }]);
          setRunning(false);
        }
      },
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={command}
          onChange={e => setCommand(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void runCmd(); }}
          placeholder="Enter command…"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'monospace', background: 'var(--bg)' }}
        />
        <Button onClick={() => void runCmd()} disabled={running} variant="primary">
          {running ? 'Running…' : 'Run'}
        </Button>
      </div>

      <pre
        ref={outputRef}
        style={{ background: '#1a1814', color: '#f0ede6', borderRadius: 8, padding: 16, fontSize: 12, fontFamily: 'monospace', minHeight: 200, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}
      >
        {output.map((line, i) => (
          <span key={i} style={{ color: line.type === 'stderr' || line.type === 'error' ? '#f87171' : '#f0ede6' }}>
            {line.text}{'\n'}
          </span>
        ))}
        {exitCode !== null && (
          <span style={{ color: exitCode === 0 ? '#4ade80' : '#f87171' }}>
            {'\n'}[exit {exitCode}]
          </span>
        )}
      </pre>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={() => { setShowHistory(h => !h); if (!showHistory) void fetchHistory(); }}
          style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', padding: 0 }}
        >
          {showHistory ? '▾' : '▸'} History ({history.length})
        </button>
        {showHistory && (
          <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Command', 'Exit', 'When'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text3)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map(row => (
                <tr key={row.id} onClick={() => setCommand(row.command)} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: 'var(--text)' }}>{row.command}</td>
                  <td style={{ padding: '6px 8px', color: row.exit_code === 0 ? 'var(--green)' : 'var(--red)' }}>{row.exit_code ?? '—'}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text3)' }}>{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
