'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/Button';
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

function fileIcon(contentType: string): string {
  if (contentType.startsWith('image/')) return '🖼';
  if (contentType === 'application/pdf') return '📄';
  if (contentType.startsWith('video/')) return '🎬';
  if (contentType.startsWith('audio/')) return '🎵';
  if (contentType.includes('zip') || contentType.includes('tar') || contentType.includes('gz')) return '🗜';
  if (contentType.startsWith('text/')) return '📝';
  return '📁';
}

const th: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text3)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  borderBottom: '1px solid var(--border)',
};

const td: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 13,
  color: 'var(--text)',
  borderBottom: '1px solid var(--border)',
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

        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Size</th>
                <th style={th}>Type</th>
                <th style={th}>Uploaded</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>Loading…</td></tr>
              ) : files.length === 0 ? (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>No files yet. Upload one to get started.</td></tr>
              ) : files.map((f, i) => (
                <tr
                  key={f.key}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={td}>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}
                    >
                      <span style={{ fontSize: 16 }}>{fileIcon(f.content_type)}</span>
                      {f.name}
                    </a>
                  </td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{fmtSize(f.size)}</td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{f.content_type}</td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{timeAgo(f.uploaded_at)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <Button onClick={() => window.open(f.url, '_blank')}>Download</Button>
                      <Button
                        variant="danger"
                        onClick={() => { if (confirm(`Delete "${f.name}"?`)) deleteMut.mutate(f.key); }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
