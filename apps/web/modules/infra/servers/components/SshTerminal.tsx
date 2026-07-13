'use client';

import { useEffect, useRef, useCallback } from 'react';
import '@xterm/xterm/css/xterm.css';

import { getWsUrl } from '@/modules/shared/lib/api';

interface Props {
  serverId: string;
}

export function SshTerminal({ serverId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);

  const disconnect = useCallback(() => {
    resizeObsRef.current?.disconnect();
    wsRef.current?.close();
    termRef.current?.dispose();
    resizeObsRef.current = null;
    wsRef.current = null;
    termRef.current = null;
    fitRef.current = null;
  }, []);

  const connect = useCallback(() => {
    if (!containerRef.current) return;

    disconnect();

    void (async () => {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');

      if (!containerRef.current) return; // unmounted while importing

      const term = new Terminal({
        cursorBlink: true,
        fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
        fontSize: 13,
        lineHeight: 1.2,
        theme: {
          background: '#1a1814',
          foreground: '#f0ede6',
          cursor: '#f0ede6',
          selectionBackground: 'rgba(240,237,230,0.2)',
          black: '#1a1814',
          red: '#f87171',
          green: '#4ade80',
          yellow: '#fbbf24',
          blue: '#60a5fa',
          magenta: '#c084fc',
          cyan: '#34d399',
          white: '#f0ede6',
          brightBlack: '#6b665c',
          brightRed: '#fca5a5',
          brightGreen: '#86efac',
          brightYellow: '#fde68a',
          brightBlue: '#93c5fd',
          brightMagenta: '#d8b4fe',
          brightCyan: '#6ee7b7',
          brightWhite: '#ffffff',
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      termRef.current = term;
      fitRef.current = fitAddon;

      containerRef.current.innerHTML = '';
      term.open(containerRef.current);
      fitAddon.fit();

      const cols = term.cols;
      const rows = term.rows;

      const wsUrl = getWsUrl(
        `/api/servers/${serverId}/ssh/terminal?cols=${cols}&rows=${rows}`,
      );
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      term.writeln('\x1b[2mConnecting…\x1b[0m');

      ws.onopen = () => {
        term.write('\x1b[2K\r'); // clear "Connecting…" line
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data) as { type: string; message?: string };
            if (msg.type === 'error') {
              term.writeln(`\r\n\x1b[31mSSH error: ${msg.message ?? 'unknown'}\x1b[0m`);
            } else if (msg.type === 'close') {
              term.writeln('\r\n\x1b[2m[Connection closed]\x1b[0m');
            }
          } catch { /* ignore */ }
        } else {
          term.write(new Uint8Array(event.data as ArrayBuffer));
        }
      };

      ws.onclose = (ev) => {
        if (ev.code !== 1000 && ev.code !== 1001) {
          term.writeln(`\r\n\x1b[31m[Disconnected${ev.reason ? ': ' + ev.reason : ''}]\x1b[0m`);
        }
      };

      ws.onerror = () => {
        term.writeln('\r\n\x1b[31m[Connection error — is the API running?]\x1b[0m');
      };

      // Keystrokes → WebSocket as binary so backend routes to stream.write()
      // (string messages are JSON-parsed as control frames; raw text would be dropped)
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(new TextEncoder().encode(data));
        }
      });

      // Resize observer → terminal fit + server resize
      const obs = new ResizeObserver(() => {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      });
      obs.observe(containerRef.current!);
      resizeObsRef.current = obs;
    })();
  }, [serverId, disconnect]);

  useEffect(() => {
    connect();
    return () => { disconnect(); };
  }, [connect, disconnect]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', background: '#2a2520',
        borderBottom: '1px solid #3a3530', flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: '#9e998f', fontFamily: 'monospace', flex: 1 }}>
          SSH Terminal
        </span>
        <button
          onClick={connect}
          style={{
            padding: '3px 10px', fontSize: 11,
            border: '1px solid #3a3530', borderRadius: 4,
            background: '#1a1814', color: '#9e998f',
            cursor: 'pointer',
          }}
        >
          Reconnect
        </button>
      </div>

      {/* xterm container */}
      <div
        ref={containerRef}
        style={{ flex: 1, background: '#1a1814', padding: '4px', overflow: 'hidden', minHeight: 0 }}
      />
    </div>
  );
}
