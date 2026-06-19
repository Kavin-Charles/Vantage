'use client';

import React from 'react';

export function SkeletonRow({ cols }: { cols: string }) {
  const colCount = cols.split(' ').length;
  return (
    <>
      <style>{`
        @keyframes db-shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .db-skeleton-cell {
          height: 14px;
          border-radius: 4px;
          background: linear-gradient(90deg, var(--border) 25%, var(--surface2) 50%, var(--border) 75%);
          background-size: 800px 100%;
          animation: db-shimmer 1.4s infinite;
        }
      `}</style>
      <div style={{
        display: 'grid',
        gridTemplateColumns: cols,
        gap: 14,
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        alignItems: 'center',
      }}>
        {Array.from({ length: colCount }).map((_, i) => (
          <div key={i} className="db-skeleton-cell" style={{ width: i === colCount - 1 ? 40 : '70%' }} />
        ))}
      </div>
    </>
  );
}
