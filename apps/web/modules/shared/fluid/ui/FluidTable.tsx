'use client';

export interface FluidColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  width?: number | string;
}

export function FluidTable<T>({
  columns, rows, rowKey, onRowClick,
}: {
  columns: FluidColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}) {
  return (
    <div className="glass-card" style={{ padding: 8, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--fl-font-body)' }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} style={{
                textAlign: 'left', padding: '14px 16px', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fl-outline)',
                width: c.width,
              }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ cursor: onRowClick ? 'pointer' : 'default', transition: 'background .2s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--fl-surface-container-low)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {columns.map(c => (
                <td key={c.key} style={{ padding: '16px', fontSize: 14, color: 'var(--fl-on-surface)', borderTop: '1px solid var(--fl-outline-variant)' }}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
