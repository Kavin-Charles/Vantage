'use client';

import { useRef, useState } from 'react';
import { Icon } from './Icon';

type Props = {
  label: string;
  hint?: string;
  accept?: string;
  value: string;
  onChange: (dataUrl: string) => void;
  onRemove?: () => void;
  previewHeight?: number;
};

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function Dropzone({ label, hint, accept = 'image/*', value, onChange, onRemove, previewHeight = 56 }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError('File is too large — max 2MB.');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = e => onChange(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: hint ? 2 : 6 }}>
        {label}
      </label>
      {hint && <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 6px' }}>{hint}</p>}

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          readFile(e.dataTransfer.files?.[0]);
        }}
        role="button"
        tabIndex={0}
        aria-label={`Upload ${label}`}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '12px 16px',
          border: `1.5px dashed ${dragOver ? 'var(--text)' : 'var(--border)'}`,
          borderRadius: 10,
          background: dragOver ? 'var(--surface2)' : 'var(--surface)',
          cursor: 'pointer',
          transition: 'border-color var(--motion-fast) var(--motion-ease), background var(--motion-fast) var(--motion-ease)',
        }}
      >
        {value ? (
          <img src={value} alt={`${label} preview`} style={{ height: previewHeight, maxWidth: 120, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)' }} />
        ) : (
          <div style={{
            width: previewHeight, height: previewHeight, borderRadius: 6,
            background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon name="upload" size={20} color="var(--text3)" />
          </div>
        )}

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
            {value ? 'Replace image' : 'Drag & drop or click to upload'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>PNG, JPG, SVG up to 2MB</div>
        </div>

        {value && onRemove && (
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={e => { e.stopPropagation(); onRemove(); }}
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6,
              cursor: 'pointer', color: 'var(--text2)', display: 'flex', padding: 6, flexShrink: 0,
            }}
          >
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={e => readFile(e.target.files?.[0])}
        style={{ display: 'none' }}
      />
      {error && <p style={{ fontSize: 12, color: 'var(--red)', margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}
