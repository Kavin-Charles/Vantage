'use client';

import { useState, useRef, useEffect } from 'react';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';
import { openSftpSession, SftpClient } from '@/modules/servers/lib/sftp';
import type { SftpEntry } from '@/modules/servers/lib/sftp';

export function FilesTab({ serverId }: { serverId: string }) {
  const [connState, setConnState] = useState<'connecting' | 'ready' | 'error'>('connecting');
  const [connError, setConnError] = useState<string | null>(null);
  const [curPath, setCurPath] = useState('/');
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string; saved: string } | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const sftpRef = useRef<SftpClient | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const { ask: askConfirm, el: confirmEl } = useConfirm();

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;

    void openSftpSession(serverId).then(sftp => {
      if (cancelled) { sftp.close(); return; }
      sftpRef.current = sftp;
      ws = (sftp as unknown as { ws: WebSocket }).ws;

      function handleOpen() {
        setConnState('ready');
        void ls('/');
      }
      function handleError() {
        setConnState('error');
        setConnError('WebSocket connection failed.');
      }
      ws.addEventListener('open', handleOpen);
      ws.addEventListener('error', handleError);

      sftp.onClose(() => {
        setConnState('error');
        setConnError('Connection closed.');
      });

      if (ws.readyState === WebSocket.OPEN) handleOpen();
    });

    return () => {
      cancelled = true;
      if (ws) ws.removeEventListener('open', () => undefined);
      sftpRef.current?.close();
      sftpRef.current = null;
    };
  }, [serverId]); // eslint-disable-line react-hooks/exhaustive-deps

  function joinPath(base: string, name: string) {
    return (base === '/' ? '' : base.replace(/\/$/, '')) + '/' + name;
  }

  async function ls(dir: string) {
    const sftp = sftpRef.current;
    if (!sftp) return;
    setDirLoading(true);
    setOpError(null);
    try {
      const res = await sftp.ls(dir);
      if (res.ok && res.data) {
        setCurPath(dir);
        const sorted = [...res.data.entries].sort((a, b) => {
          if (a.type === 'dir' && b.type !== 'dir') return -1;
          if (a.type !== 'dir' && b.type === 'dir') return 1;
          return a.name.localeCompare(b.name);
        });
        setEntries(sorted);
      } else {
        setOpError(res.error ?? 'Failed to list directory.');
      }
    } catch (e) {
      setOpError((e as Error).message);
    } finally {
      setDirLoading(false);
    }
  }

  async function openFile(filePath: string) {
    const sftp = sftpRef.current;
    if (!sftp) return;
    setOpError(null);
    const res = await sftp.read(filePath);
    if (res.ok && res.data) {
      const content = res.data.content;
      setSelectedFile({ path: filePath, content, saved: content });
      setEditorContent(content);
    } else {
      const msg = res.error ?? 'Failed to read file.';
      if (msg.includes('SSH_CONNECT_FAILED') || msg.includes('NO_KEYPAIR')) {
        setConnState('error');
        setConnError(msg);
      } else {
        setOpError(msg);
      }
    }
  }

  async function saveFile() {
    const sftp = sftpRef.current;
    if (!sftp || !selectedFile) return;
    setSaving(true);
    setOpError(null);
    const res = await sftp.write(selectedFile.path, editorContent);
    if (res.ok) {
      setSelectedFile(f => f ? { ...f, content: editorContent, saved: editorContent } : null);
    } else {
      setOpError(res.error ?? 'Save failed.');
    }
    setSaving(false);
  }

  function deleteEntry(entryPath: string, isDir: boolean) {
    askConfirm({
      title: `Delete ${isDir ? 'directory' : 'file'}`,
      message: `Delete "${entryPath}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => void doDeleteEntry(entryPath, isDir),
    });
  }

  async function doDeleteEntry(entryPath: string, isDir: boolean) {
    const sftp = sftpRef.current;
    if (!sftp) return;
    void isDir;
    setOpError(null);
    const res = await sftp.delete(entryPath);
    if (res.ok) {
      if (selectedFile?.path === entryPath) { setSelectedFile(null); setEditorContent(''); }
      void ls(curPath);
    } else {
      setOpError(res.error ?? 'Delete failed.');
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const sftp = sftpRef.current;
    const file = e.target.files?.[0];
    if (!sftp || !file) return;
    setOpError(null);
    const text = await file.text();
    const destPath = joinPath(curPath, file.name);
    const res = await sftp.write(destPath, text);
    if (res.ok) {
      void ls(curPath);
    } else {
      setOpError(res.error ?? 'Upload failed.');
    }
    e.target.value = '';
  }

  function downloadFile() {
    if (!selectedFile) return;
    const blob = new Blob([editorContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.path.split('/').pop() ?? 'file.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  const parts = curPath.split('/').filter(Boolean);

  if (connState === 'connecting') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: 'var(--text3)', fontSize: 14, gap: 10 }}>
        <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid var(--border)', borderTopColor: 'var(--text2)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        Connecting…
      </div>
    );
  }

  if (connState === 'error') {
    const isKeypair = connError?.includes('NO_KEYPAIR') || connError?.includes('SSH_CONNECT_FAILED');
    return (
      <div style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 'var(--radius-lg)', padding: '20px 28px', maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontWeight: 600, color: 'var(--red)', marginBottom: 8 }}>Connection failed</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: isKeypair ? 12 : 0 }}>{connError}</div>
          {isKeypair && (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Add an SSH keypair in Settings → SSH to enable file browsing.</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 0, minHeight: 400, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', fontFamily: 'var(--font-sans)' }}>
      {confirmEl}
      <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', fontSize: 12, fontFamily: 'monospace', background: 'var(--surface2)' }}>
          <button onClick={() => void ls('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: '0 2px' }}>/</button>
          {parts.map((part, i) => {
            const target = '/' + parts.slice(0, i + 1).join('/');
            return (
              <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ color: 'var(--text3)' }}>/</span>
                <button onClick={() => void ls(target)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: '0 2px', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={part}>{part}</button>
              </span>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {curPath !== '/' && (
            <div
              onClick={() => {
                const parent = curPath.split('/').slice(0, -1).join('/') || '/';
                void ls(parent);
              }}
              style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'monospace', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <span>↑</span> ..
            </div>
          )}
          {dirLoading && <div style={{ padding: '12px', fontSize: 12, color: 'var(--text3)' }}>Loading…</div>}
          {!dirLoading && entries.map(entry => {
            const entryPath = joinPath(curPath, entry.name);
            const isSelected = selectedFile?.path === entryPath;
            return (
              <div
                key={entry.name}
                style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isSelected ? 'var(--surface2)' : '' }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface2)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = ''; }}
                onClick={() => {
                  if (entry.type === 'dir') void ls(entryPath);
                  else void openFile(entryPath);
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', color: 'var(--text)' }}>
                  <span>{entry.type === 'dir' ? '📁' : '📄'}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                </span>
                <button
                  onClick={e => { e.stopPropagation(); void deleteEntry(entryPath, entry.type === 'dir'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '0 2px', fontSize: 11, flexShrink: 0, opacity: 0 }}
                  title="Delete"
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--red)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text3)'; }}
                >✕</button>
              </div>
            );
          })}
          {!dirLoading && entries.length === 0 && (
            <div style={{ padding: '12px', fontSize: 12, color: 'var(--text3)' }}>Empty directory</div>
          )}
        </div>

        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <input ref={uploadRef} type="file" style={{ display: 'none' }} onChange={e => void handleUpload(e)} />
          <button
            onClick={() => uploadRef.current?.click()}
            style={{ width: '100%', padding: '6px 0', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text2)' }}
          >
            ↑ Upload file
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
        {opError && (
          <div style={{ padding: '8px 14px', background: 'var(--red-bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: 'var(--red)' }}>{opError}</span>
            <button onClick={() => setOpError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>✕</button>
          </div>
        )}
        {selectedFile ? (
          <>
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface2)', gap: 8 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFile.path}
              </span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => void saveFile()}
                  disabled={saving || editorContent === selectedFile.saved}
                  style={{ padding: '4px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: editorContent !== selectedFile.saved ? 'var(--green)' : 'var(--surface)', color: editorContent !== selectedFile.saved ? '#fff' : 'var(--text3)', cursor: editorContent !== selectedFile.saved ? 'pointer' : 'default', fontWeight: 500 }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={downloadFile}
                  style={{ padding: '4px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text2)' }}
                >
                  ↓ Download
                </button>
              </div>
            </div>
            <textarea
              value={editorContent}
              onChange={e => setEditorContent(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', fontFamily: 'monospace', fontSize: 12, padding: 16, background: '#1a1814', color: '#f0ede6', minHeight: 360, lineHeight: 1.6 }}
              spellCheck={false}
            />
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Select a file to view or edit
          </div>
        )}
      </div>
    </div>
  );
}
