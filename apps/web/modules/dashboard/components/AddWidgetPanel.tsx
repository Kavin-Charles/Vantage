'use client';

import { getDashboardWidgets, type DashboardWidgetDef } from '@/modules/shared/lib/dashboard-registry';
import '@/modules/crm/tasks/components/TasksWidget';

interface Props {
  open: boolean;
  onClose: () => void;
  currentWidgetIds: Set<string>;
  pluginWidgets: Map<string, DashboardWidgetDef>;
  onAdd: (def: DashboardWidgetDef) => void;
}

export function AddWidgetPanel({ open, onClose, currentWidgetIds, pluginWidgets, onAdd }: Props) {
  if (!open) return null;

  const moduleWidgets = getDashboardWidgets().filter(d => !currentWidgetIds.has(d.id));
  const pluginList = [...pluginWidgets.values()].filter(d => !currentWidgetIds.has(d.id));
  const available = [...moduleWidgets, ...pluginList];

  return (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: 320,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15 }}>Add Widget</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)' }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {available.length === 0 && (
          <p style={{ padding: '20px', color: 'var(--text3)', fontSize: 13 }}>
            All available widgets are already on the dashboard.
          </p>
        )}
        {available.map(def => (
          <button
            key={def.id}
            onClick={() => onAdd(def)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{def.label}</div>
            {def.description && (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{def.description}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
