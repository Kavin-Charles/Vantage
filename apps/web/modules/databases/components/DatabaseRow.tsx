'use client';

import React, { useState } from 'react';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { PulseDot } from './PulseDot';
import type { InfraDatabase } from '@vencore/types';

const ENGINE_COLOR: Record<string, 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'gray'> = {
  postgres: 'blue', mysql: 'amber', redis: 'red', clickhouse: 'purple', mongo: 'green', other: 'gray',
};

export const DB_TABLE_COLS = 'minmax(160px,1.4fr) .8fr 1.6fr .6fr .8fr 1.2fr 80px';

interface DatabaseRowProps {
  db: InfraDatabase;
  last: boolean;
  index: number;
  onClick: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function DatabaseRow({ db, last, index, onClick, onDelete, onContextMenu }: DatabaseRowProps) {
  const [hover, setHover] = useState(false);

  return (
    <>
      <style>{`
        @keyframes db-row-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={{
          display: 'grid',
          gridTemplateColumns: DB_TABLE_COLS,
          gap: 14,
          alignItems: 'center',
          padding: '12px 18px',
          borderBottom: last ? 'none' : '1px solid var(--border)',
          background: hover ? 'var(--surface2)' : 'transparent',
          transition: 'background .12s',
          cursor: 'pointer',
          fontSize: 13,
          animation: 'db-row-in 150ms ease-out both',
          animationDelay: `${index * 30}ms`,
        }}
      >
        <span style={{ fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
          {db.name}
        </span>
        <span><Badge label={db.engine} color={ENGINE_COLOR[db.engine] ?? 'gray'} /></span>
        <span style={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{db.host ?? '—'}</span>
        <span style={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{db.port ?? '—'}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <PulseDot status={db.status} />
          <Badge label={db.status} color={statusColor[db.status] ?? 'gray'} />
        </span>
        <span style={{ color: 'var(--text2)' }}>
          {db.last_checked_at ? new Date(db.last_checked_at).toLocaleString() : 'never'}
        </span>
        <span
          onClick={e => e.stopPropagation()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            opacity: hover ? 1 : 0,
            transition: 'opacity .12s',
          }}
        >
          <button
            title="Remove"
            onClick={onDelete}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--text2)',
            }}
          >
            Remove
          </button>
        </span>
      </div>
    </>
  );
}
