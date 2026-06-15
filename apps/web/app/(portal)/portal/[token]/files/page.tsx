'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface PortalFile {
  id: string;
  task_id: string;
  task_title: string;
  filename: string;
  url: string;
  size_bytes: number | null;
  uploaded_at: string;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PortalFilesPage() {
  const { token } = useParams<{ token: string }>();
  const [files, setFiles] = useState<PortalFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/portal/${token}/files`, { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (json.error) { setError(json.error.message); return; }
        setFiles(json.data ?? []);
      })
      .catch(() => setError('Failed to load files'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--text3, #9e998f)' }}>Loading…</p>;
  if (error)   return <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--red, #991b1b)' }}>{error}</p>;

  if (files.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text3, #9e998f)', fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}>
        No deliverable files have been shared yet.
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--text, #1a1814)', marginBottom: 16 }}>
        Files
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {files.map(file => (
          <div
            key={file.id}
            style={{
              background: 'var(--surface, #fff)',
              border: '1px solid var(--border, #e4e0d8)',
              borderRadius: 10,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            {/* File icon */}
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'var(--surface2, #f0ede6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 16,
            }}>
              📄
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text, #1a1814)',
                marginBottom: 3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {file.filename}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3, #9e998f)' }}>
                {file.task_title}
                {file.size_bytes !== null && ` · ${formatBytes(file.size_bytes)}`}
                {' · '}
                {new Date(file.uploaded_at).toLocaleDateString()}
              </div>
            </div>

            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              download={file.filename}
              style={{
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 7,
                background: 'var(--surface2, #f0ede6)',
                color: 'var(--text, #1a1814)',
                textDecoration: 'none',
                border: '1px solid var(--border, #e4e0d8)',
                flexShrink: 0,
              }}
            >
              Download
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
