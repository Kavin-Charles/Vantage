'use client';

import React, { useState } from 'react';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { PulseDot } from './PulseDot';
import type { InfraDatabase } from '@vencore/types';

const ENGINE_COLOR: Record<string, 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'gray'> = {
  postgres: 'blue', mysql: 'amber', redis: 'red', clickhouse: 'purple', mongo: 'green', other: 'gray',
};

interface DatabaseCardProps {
  db: InfraDatabase;
  index: number;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function DatabaseCard({ db, index, onClick, onContextMenu }: DatabaseCardProps) {
  const [hover, setHover] = useState(false);

  return (
    <>
      <style>{`
        @keyframes db-card-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={{
          background: hover ? 'var(--surface2)' : 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 18px',
          cursor: 'pointer',
          transition: 'background .12s, box-shadow .12s',
          boxShadow: hover ? '0 2px 8px rgba(0,0,0,.06)' : 'none',
          animation: 'db-card-in 150ms ease-out both',
          animationDelay: `${index * 30}ms`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Badge label={db.engine} color={ENGINE_COLOR[db.engine] ?? 'gray'} />
          <PulseDot status={db.status} />
          <Badge label={db.status} color={statusColor[db.status] ?? 'gray'} />
        </div>

        <div style={{
          fontFamily: "'IBM Plex Serif', serif",
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 4,
        }}>
          {db.name}
        </div>

        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text3)',
          marginBottom: 12,
        }}>
          {db.host ? `${db.host}${db.port ? `:${db.port}` : ''}` : 'no host configured'}
        </div>

        <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          {[
            { label: 'Storage', value: db.storage_gb !== null ? `${db.storage_gb.toFixed(1)} GB` : '—' },
            { label: 'Conns', value: db.connection_count !== null ? String(db.connection_count) : '—' },
            { label: 'Lag', value: db.replication_lag_s !== null ? `${db.replication_lag_s}s` : '—' },
          ].map(stat => (
            <div key={stat.label} style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.2 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
