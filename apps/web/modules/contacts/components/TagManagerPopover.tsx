'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { createContactTag, deleteContactTag } from '@/modules/contacts/lib/contacts';
import { Icon } from '@/modules/shared/components/ui/Icon';
import type { ContactTag } from '@vencore/types';

const SWATCHES = ['var(--blue)', 'var(--green)', 'var(--amber)', 'var(--red)', 'var(--purple)', 'var(--text2)'];

interface Props {
  tags: ContactTag[];
  onClose: () => void;
  onChanged: () => void;
}

export function TagManagerPopover({ tags, onClose, onChanged }: Props) {
  const getToken = useApiToken();
  const ref = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]!);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const createMut = useMutation({
    mutationFn: async () => createContactTag(await getToken(), { name: name.trim(), color }),
    onSuccess: () => {
      setName('');
      setError(null);
      onChanged();
    },
    onError: (err: unknown) => {
      const e = err as Record<string, unknown>;
      const apiErr = (e?.['error'] as Record<string, unknown>) ?? {};
      setError(apiErr['code'] === 'DUPLICATE_TAG' ? 'A tag with this name already exists.' : 'Could not create tag.');
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteContactTag(await getToken(), id),
    onSuccess: onChanged,
  });

  function handleCreate() {
    if (!name.trim()) return;
    createMut.mutate();
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Manage tags"
      style={{
        position: 'absolute', top: 'calc(100% + 6px)', left: 0,
        width: 260, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        zIndex: 500, padding: 12,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        Tags
      </div>

      {tags.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>No tags yet.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, maxHeight: 160, overflowY: 'auto' }}>
        {tags.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 2px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.name}
            </span>
            <button
              onClick={() => deleteMut.mutate(t.id)}
              aria-label={`Delete tag ${t.name}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 2 }}
            >
              <Icon name="trash" size={13} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
        <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
          {SWATCHES.map(s => (
            <button
              key={s}
              onClick={() => setColor(s)}
              aria-label={`Color ${s}`}
              aria-pressed={color === s}
              style={{
                width: 16, height: 16, borderRadius: '50%', background: s, cursor: 'pointer',
                border: color === s ? '2px solid var(--text)' : '2px solid transparent',
                padding: 0,
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="New tag name…"
            aria-label="New tag name"
            style={{
              flex: 1, padding: '6px 9px', fontSize: 13, borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', outline: 'none',
            }}
          />
          <button
            onClick={handleCreate}
            disabled={!name.trim() || createMut.isPending}
            style={{
              padding: '6px 10px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
              border: 'none', background: 'var(--text)', color: 'var(--surface)',
              opacity: !name.trim() || createMut.isPending ? 0.5 : 1,
            }}
          >
            Add
          </button>
        </div>
        {error && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{error}</p>}
      </div>
    </div>
  );
}
