'use client';

import React, { useState } from 'react';
import { ContextMenu, useContextMenu } from '@/modules/shared/components/ui/ContextMenu';
import { WidgetConfigPopover } from './WidgetConfigPopover';
import { getDashboardWidgetById } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

interface Props {
  widgetId: string;
  label: string;
  isEditMode: boolean;
  config: WidgetConfig;
  onConfigChange?: (config: WidgetConfig) => void;
  onRemove?: (widgetId: string) => void;
  children: React.ReactNode;
}

interface State { hasError: boolean }

class WidgetErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
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

export function WidgetCard({ widgetId, label, isEditMode, config, onConfigChange, onRemove, children }: Props) {
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const [configOpen, setConfigOpen] = useState(false);
  const def = getDashboardWidgetById(widgetId);
  const hasFilters = (def?.supportedFilters?.length ?? 0) > 0;

  return (
    <div
      className="widget-card-enter"
      onContextMenu={e => {
        const items = [
          { type: 'header' as const, label },
          { type: 'separator' as const },
          ...(onRemove ? [{ icon: 'trash', label: 'Remove widget', danger: true, onClick: () => onRemove(widgetId) }] : []),
        ];
        openMenu(e, items);
      }}
      style={{
        height: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative',
      }}
    >
      {isEditMode && (
        <div
          className="drag-handle"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
            cursor: 'grab', userSelect: 'none',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {hasFilters && (
              <button
                onClick={() => setConfigOpen(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
                aria-label="Widget settings"
                title="Settings"
              >
                ⚙
              </button>
            )}
            {onRemove && (
              <button
                onClick={() => onRemove(widgetId)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                aria-label="Remove widget"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* Gear icon in view mode — appears on hover, only when widget has configurable filters */}
      {!isEditMode && hasFilters && (
        <button
          onClick={() => setConfigOpen(v => !v)}
          className="widget-gear"
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 10,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 6, cursor: 'pointer', color: 'var(--text3)',
            fontSize: 13, lineHeight: 1, padding: '3px 6px',
            opacity: 0, transition: 'opacity 0.15s',
          }}
          aria-label="Widget settings"
        >
          ⚙
        </button>
      )}

      <div
        style={{ flex: 1, overflow: 'auto', padding: isEditMode ? 12 : 16, position: 'relative' }}
        onMouseEnter={e => {
          const gear = e.currentTarget.parentElement?.querySelector<HTMLButtonElement>('.widget-gear');
          if (gear) gear.style.opacity = '1';
        }}
        onMouseLeave={e => {
          const gear = e.currentTarget.parentElement?.querySelector<HTMLButtonElement>('.widget-gear');
          if (gear) gear.style.opacity = '0';
        }}
      >
        <React.Suspense fallback={<div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading…</div>}>
          <WidgetErrorBoundary key={widgetId}>{children}</WidgetErrorBoundary>
        </React.Suspense>
      </div>

      {configOpen && (
        <WidgetConfigPopover
          supportedFilters={def?.supportedFilters ?? []}
          config={config}
          onConfigChange={cfg => { onConfigChange?.(cfg); }}
          onRemove={() => { setConfigOpen(false); onRemove?.(widgetId); }}
          onClose={() => setConfigOpen(false)}
        />
      )}

      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
