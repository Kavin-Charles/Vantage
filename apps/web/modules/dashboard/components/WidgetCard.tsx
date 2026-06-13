'use client';

import React from 'react';
import { ContextMenu, useContextMenu } from '@/modules/shared/components/ui/ContextMenu';

interface Props {
  widgetId: string;
  label: string;
  isEditMode: boolean;
  onRemove?: (widgetId: string) => void;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

class WidgetErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 13 }}>
          Widget unavailable
        </div>
      );
    }
    return this.props.children;
  }
}

export function WidgetCard({ widgetId, label, isEditMode, onRemove, children }: Props) {
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  return (
    <div
      onContextMenu={(e) => {
        const items = [
          { type: 'header' as const, label },
          { type: 'separator' as const },
          ...(onRemove ? [{ icon: 'trash', label: 'Remove widget', danger: true, onClick: () => onRemove(widgetId) }] : []),
        ];
        openMenu(e, items);
      }}
      style={{
        height: '100%',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {isEditMode && (
        <div
          className="drag-handle"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: 'var(--surface2)',
            borderBottom: '1px solid var(--border)',
            cursor: 'grab',
            userSelect: 'none',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
          {onRemove && (
            <button
              onClick={() => onRemove(widgetId)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text3)',
                fontSize: 16,
                lineHeight: 1,
                padding: '0 2px',
              }}
              aria-label="Remove widget"
            >
              ×
            </button>
          )}
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto', padding: isEditMode ? 12 : 16 }}>
        <React.Suspense
          fallback={
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading…</div>
          }
        >
          <WidgetErrorBoundary key={widgetId}>{children}</WidgetErrorBoundary>
        </React.Suspense>
      </div>
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
