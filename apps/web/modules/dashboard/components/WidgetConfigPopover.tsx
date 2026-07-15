'use client';

import React, { useEffect } from 'react';
import type { WidgetConfig, WidgetFilterKey } from '@/modules/shared/lib/dashboard-registry';

interface Props {
  supportedFilters: WidgetFilterKey[];
  config: WidgetConfig;
  onConfigChange: (config: WidgetConfig) => void;
  onRemove?: () => void;
  onClose?: () => void;
}

export function WidgetConfigPopover({ supportedFilters, config, onConfigChange, onRemove, onClose }: Props) {
  const has = (f: WidgetFilterKey) => supportedFilters.includes(f);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 199 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'absolute', top: 36, right: 8, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 4px 12px var(--border)',
          width: 220, padding: '8px 0', fontSize: 13,
        }}
        onClick={e => e.stopPropagation()}
      >
        {has('timeRange') && (
          <Section label="Time Range">
            <PillGroup
              options={[
                { label: 'Today', value: '1d' },
                { label: '7 days', value: '7d' },
                { label: '30 days', value: '30d' },
              ]}
              value={config.timeRange ?? '7d'}
              onChange={v => onConfigChange({ ...config, timeRange: v as WidgetConfig['timeRange'] })}
            />
          </Section>
        )}
        {has('limit') && (
          <Section label="Show">
            <PillGroup
              options={[
                { label: '5', value: '5' },
                { label: '10', value: '10' },
                { label: '25', value: '25' },
              ]}
              value={String(config.limit ?? 10)}
              onChange={v => onConfigChange({ ...config, limit: Number(v) })}
            />
          </Section>
        )}
        {has('chartType') && (
          <Section label="Chart Type">
            <PillGroup
              options={[
                { label: 'Line', value: 'line' },
                { label: 'Bar', value: 'bar' },
                { label: 'Area', value: 'area' },
              ]}
              value={config.chartType ?? 'line'}
              onChange={v => onConfigChange({ ...config, chartType: v as WidgetConfig['chartType'] })}
            />
          </Section>
        )}
        {has('refreshInterval') && (
          <Section label="Refresh">
            <PillGroup
              options={[
                { label: 'Off', value: '0' },
                { label: '30s', value: '30000' },
                { label: '1m', value: '60000' },
                { label: '5m', value: '300000' },
              ]}
              value={String(config.refreshInterval ?? 0)}
              onChange={v => onConfigChange({ ...config, refreshInterval: Number(v) })}
            />
          </Section>
        )}
        {has('compactMode') && (
          <Section label="Compact">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.compactMode ?? false}
                onChange={e => onConfigChange({ ...config, compactMode: e.target.checked })}
              />
              Compact mode
            </label>
          </Section>
        )}
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
          <button
            onClick={onRemove}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 14px', background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--red)', fontSize: 13,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--red-bg)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            Remove widget
          </button>
        </div>
      </div>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '6px 14px 8px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function PillGroup({ options, value, onChange }: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)',
            background: value === o.value ? 'var(--text)' : 'transparent',
            color: value === o.value ? 'var(--surface)' : 'var(--text2)',
            cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
