'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';

interface FileObject {
  key: string;
  name: string;
  size: number;
  content_type: string;
  uploaded_at: string;
  url: string;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fileIconName(contentType: string): string {
  if (contentType.startsWith('image/')) return 'files';
  if (contentType === 'application/pdf') return 'files';
  if (contentType.startsWith('video/')) return 'files';
  if (contentType.startsWith('audio/')) return 'files';
  if (contentType.startsWith('text/')) return 'note';
  return 'files';
}

const COLS = 'minmax(220px,2.4fr) .7fr 1fr .8fr auto';

const eyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1.4,
};

export default function FilesPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['files'],
    queryFn: async () => apiFetch<{ data: FileObject[]; error: null }>('/api/files', { token: await getToken() }),
  });

  const deleteMut = useMutation({
    mutationFn: async (key: string) =>
      apiFetch(`/api/files/${encodeURIComponent(key)}`, { method: 'DELETE', token: await getToken() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', file);
      await fetch(`${process.env['NEXT_PUBLIC_API_URL'] ?? ''}/api/files`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      qc.invalidateQueries({ queryKey: ['files'] });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const files: FileObject[] = data?.data ?? [];

  return (
    <>
      <Topbar
        action={
          <>
            <input ref={fileInput} type="file" style={{ display: 'none' }} onChange={handleUpload} />
            <Button variant="primary" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : '+ Upload file'}
            </Button>
          </>
        }
      />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>{files.length} files</div>

        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '11px 18px', borderBottom: '1px solid var(--border)', gap: 14, alignItems: 'center' }}>
            {['Name', 'Size', 'Type', 'Uploaded'].map(h => (
              <span key={h} style={eyebrow}>{h}</span>
            ))}
            <span />
          </div>

          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
          ) : files.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No files yet. Upload one to get started.</div>
          ) : files.map((f, i) => (
            <FileRow
              key={f.key}
              file={f}
              last={i === files.length - 1}
              onDelete={() => { if (confirm(`Delete "${f.name}"?`)) deleteMut.mutate(f.key); }}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function FileRow({ file: f, last, onDelete }: {
  file: FileObject; last: boolean; onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: COLS,
        gap: 14, alignItems: 'center',
        padding: '12px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s', fontSize: 13,
      }}
    >
      <a
        href={f.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text2)', flexShrink: 0,
        }}>
          <Icon name={fileIconName(f.content_type)} size={15} />
        </div>
        {f.name}
      </a>
      <span style={{ color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{fmtSize(f.size)}</span>
      <span style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{f.content_type}</span>
      <span style={{ color: 'var(--text2)' }}>{timeAgo(f.uploaded_at)}</span>
      <span style={{ display: 'flex', gap: 6 }}>
        <Button onClick={() => window.open(f.url, '_blank')} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12 }}>Download</Button>
        <Button variant="danger" onClick={onDelete} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12 }}>Delete</Button>
      </span>
    </div>
  );
}
