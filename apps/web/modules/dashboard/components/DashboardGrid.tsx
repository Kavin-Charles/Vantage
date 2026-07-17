'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout';
import type { LayoutItem, ResponsiveLayouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { WidgetCard } from './WidgetCard';
import { getDashboardWidgetById, type DashboardWidgetDef, type WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import type { LayoutWidget } from '../lib/dashboard-api';
import { Icon } from '@/modules/shared/components/ui/Icon';

interface Props {
  layoutRows: LayoutWidget[];
  isEditMode: boolean;
  pluginWidgets: Map<string, DashboardWidgetDef>;
  onLayoutChange?: (widgets: LayoutWidget[]) => void;
  onConfigChange?: (widgetId: string, config: WidgetConfig) => void;
  onRemoveWidget?: (widgetId: string) => void;
}

function resolveWidget(widgetId: string, pluginWidgets: Map<string, DashboardWidgetDef>): DashboardWidgetDef | undefined {
  return getDashboardWidgetById(widgetId) ?? pluginWidgets.get(widgetId);
}

function toLayoutItems(rows: LayoutWidget[]): LayoutItem[] {
  return rows.map(r => ({
    i: r.widget_id, x: r.x, y: r.y, w: r.w, h: r.h,
    minW: r.min_w ?? 2, minH: r.min_h ?? 2,
  }));
}

export function DashboardGrid({ layoutRows, isEditMode, pluginWidgets, onLayoutChange, onConfigChange, onRemoveWidget }: Props) {
  const { width, containerRef, mounted } = useContainerWidth();
  const [layouts, setLayouts] = useState<ResponsiveLayouts>(() => ({ lg: toLayoutItems(layoutRows) }));
  const currentBreakpointRef = useRef<string>('lg');
  const isProgrammaticRef = useRef(false);

  useEffect(() => {
    isProgrammaticRef.current = true;
    setLayouts({ lg: toLayoutItems(layoutRows) });
  }, [layoutRows]);

  function handleLayoutChange(layout: readonly LayoutItem[], allLayouts: ResponsiveLayouts) {
    if (!isEditMode) return;
    if (isProgrammaticRef.current) { isProgrammaticRef.current = false; return; }
    if (allLayouts.lg) setLayouts(prev => ({ ...prev, lg: allLayouts.lg }));
    if (currentBreakpointRef.current !== 'lg' || !onLayoutChange) return;
    const updated: LayoutWidget[] = (allLayouts.lg ?? (layout as LayoutItem[])).map(l => {
      const original = layoutRows.find(r => r.widget_id === l.i);
      return {
        id: original?.id ?? '', dashboard_id: original?.dashboard_id ?? '',
        widget_id: l.i, x: l.x, y: l.y, w: l.w, h: l.h,
        min_w: l.minW ?? null, min_h: l.minH ?? null,
        permission_key: original?.permission_key ?? null,
        config: original?.config ?? {},
      };
    });
    onLayoutChange(updated);
  }

  if (layoutRows.length === 0 && !isEditMode) {
    return (
      <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '80px 0', color: 'var(--text3)', fontSize: 14 }}>
        <Icon name="dashboard" size={28} color="var(--text3)" />
        No widgets on this dashboard.
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100%', minHeight: isEditMode ? 400 : undefined }}>
      {mounted && (
        <ResponsiveGridLayout
          width={width}
          layouts={layouts}
          containerPadding={[0, 0]}
          breakpoints={{ lg: 1200, md: 996, sm: 768 }}
          cols={{ lg: 12, md: 10, sm: 6 }}
          rowHeight={80}
          dragConfig={{ enabled: isEditMode, handle: '.drag-handle', threshold: 3, bounded: false }}
          resizeConfig={{ enabled: isEditMode, handles: ['se'] }}
          onBreakpointChange={bp => { currentBreakpointRef.current = bp; }}
          onLayoutChange={handleLayoutChange}
        >
          {layoutRows.map(row => {
            const def = resolveWidget(row.widget_id, pluginWidgets);
            if (!def) {
              return (
                <div key={row.widget_id}>
                  <WidgetCard
                    widgetId={row.widget_id}
                    label="Unknown widget"
                    isEditMode={isEditMode}
                    config={{}}
                    onRemove={onRemoveWidget}
                  >
                    <span style={{ fontSize: 13, color: 'var(--text3)' }}>Plugin not installed</span>
                  </WidgetCard>
                </div>
              );
            }
            return (
              <div key={row.widget_id}>
                <WidgetCard
                  widgetId={row.widget_id}
                  label={def.label}
                  isEditMode={isEditMode}
                  config={row.config ?? {}}
                  onConfigChange={cfg => onConfigChange?.(row.widget_id, cfg)}
                  onRemove={onRemoveWidget}
                >
                  <def.component config={row.config ?? {}} />
                </WidgetCard>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
