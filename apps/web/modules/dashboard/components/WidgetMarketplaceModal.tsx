'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getDashboardWidgets, type DashboardWidgetDef, type WidgetCategory } from '@/modules/shared/lib/dashboard-registry';
import { Icon } from '@/modules/shared/components/ui/Icon';

const CATEGORY_LABELS: Record<WidgetCategory | 'all', string> = {
  all: 'All',
  sales: 'Sales',
  projects: 'Projects',
  infra: 'Infrastructure',
  communication: 'Communication',
  insights: 'Insights',
};

const CATEGORY_ORDER: (WidgetCategory | 'all')[] = ['all', 'sales', 'projects', 'infra', 'communication', 'insights'];

interface Props {
  open: boolean;
  onClose: () => void;
  currentWidgetIds: Set<string>;
  pluginWidgets: Map<string, DashboardWidgetDef>;
  onAdd: (def: DashboardWidgetDef) => void;
}

export function WidgetMarketplaceModal({ open, onClose, currentWidgetIds, pluginWidgets, onAdd }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<WidgetCategory | 'all'>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setSearch(''); setCategory('all'); setTimeout(() => searchRef.current?.focus(), 50); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const allWidgets = [
    ...getDashboardWidgets(),
    ...[...pluginWidgets.values()],
  ];

  const q = search.toLowerCase();
  const filtered = allWidgets.filter(d => {
    const matchesSearch = !q || d.label.toLowerCase().includes(q) || d.description.toLowerCase().includes(q);
    const matchesCategory = category === 'all' || d.category === category;
    return matchesSearch && matchesCategory;
  });

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          zIndex: 301, width: 860, maxWidth: 'calc(100vw - 32px)', maxHeight: '80vh',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
          boxShadow: '0 24px 80px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Add Widget</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              ref={searchRef}
              value={search}
              onChange={e => { setSearch(e.target.value); if (e.target.value) setCategory('all'); }}
              placeholder="Search widgets…"
              style={{
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface2)', fontSize: 13, width: 200, outline: 'none',
                fontFamily: 'DM Sans, sans-serif',
              }}
            />
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)' }}>×</button>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{ width: 160, borderRight: '1px solid var(--border)', padding: '12px 0', flexShrink: 0, overflowY: 'auto' }}>
            {CATEGORY_ORDER.map(cat => (
              <button
                key={cat}
                onClick={() => { setCategory(cat); setSearch(''); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 16px', background: category === cat ? 'var(--surface2)' : 'none',
                  border: 'none', cursor: 'pointer', fontSize: 13,
                  fontWeight: category === cat ? 600 : 400,
                  color: category === cat ? 'var(--text)' : 'var(--text2)',
                  borderLeft: category === cat ? '2px solid var(--text)' : '2px solid transparent',
                }}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Widget grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text3)', paddingTop: 40, fontSize: 14 }}>
                No widgets found
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {filtered.map(def => {
                  const added = currentWidgetIds.has(def.id);
                  return (
                    <div
                      key={def.id}
                      style={{
                        padding: 14, borderRadius: 10, border: '1px solid var(--border)',
                        background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, background: 'var(--surface2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <Icon name={def.icon} size={16} color="var(--text2)" />
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{def.label}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0, lineHeight: 1.4, flex: 1 }}>{def.description}</p>
                      <button
                        onClick={() => { if (!added) { onAdd(def); onClose(); } }}
                        disabled={added}
                        style={{
                          padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          cursor: added ? 'default' : 'pointer',
                          background: added ? 'var(--surface2)' : 'var(--text)',
                          color: added ? 'var(--text3)' : 'var(--surface)',
                          border: 'none', alignSelf: 'flex-start',
                        }}
                      >
                        {added ? '✓ Added' : '+ Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
