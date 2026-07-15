'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { PulseDot } from '../PulseDot';
import type { InfraDatabase } from '@vencore/types';

const ENGINE_COLOR: Record<string, 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'gray'> = {
  postgres: 'blue', mysql: 'amber', redis: 'red', clickhouse: 'purple', mongo: 'green', other: 'gray',
};

const ENGINE_ICON: Record<string, string> = {
  postgres: 'PG', mysql: 'MY', redis: 'RE', clickhouse: 'CH', mongo: 'MG', other: 'DB',
};

export function DatabaseHeader({ database }: { database: InfraDatabase }) {
  const router = useRouter();

  return (
    <div style={{ marginBottom: 24 }}>
      <button
        onClick={() => router.push('/infra/databases')}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontSize: 12, color: 'var(--text3)', marginBottom: 8, display: 'block',
        }}
      >
        ← Databases
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          color: 'var(--text2)', fontFamily: 'var(--font-mono)',
        }}>
          {ENGINE_ICON[database.engine] ?? 'DB'}
        </div>

        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600,
          fontFamily: "'IBM Plex Serif', serif",
          color: 'var(--text)',
        }}>
          {database.name}
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <PulseDot status={database.status} />
          <Badge label={database.status} color={statusColor[database.status] ?? 'gray'} />
        </div>

        <Badge label={database.engine} color={ENGINE_COLOR[database.engine] ?? 'gray'} />

        {database.host && (
          <span style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
            {database.host}{database.port ? `:${database.port}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
