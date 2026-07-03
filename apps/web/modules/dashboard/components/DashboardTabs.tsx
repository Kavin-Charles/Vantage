'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import type { DashboardSummary } from '../lib/dashboard-api';

interface Props {
  dashboards: DashboardSummary[];
  currentId: string;
  onRename?: (id: string, name: string) => void;
  onDuplicate?: (dashboard: DashboardSummary) => void;
  onDelete?: (dashboard: DashboardSummary) => void;
}

function DashboardTab({
  dashboard, active, onRename, onDuplicate, onDelete,
}: {
  dashboard: DashboardSummary;
  active: boolean;
  onRename?: (id: string, name: string) => void;
  onDuplicate?: (dashboard: DashboardSummary) => void;
  onDelete?: (dashboard: DashboardSummary) => void;
}) {
  const router = useRouter();
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(dashboard.name);
  const href = `/dashboard/${dashboard.id}`;

  const commitRename = () => {
    const v = value.trim();
    setRenaming(false);
    if (v && v !== dashboard.name) onRename?.(dashboard.id, v);
    else setValue(dashboard.name);
  };

  if (renaming) {
    return (
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commitRename}
        onKeyDown={e => {
          if (e.key === 'Enter') commitRename();
          if (e.key === 'Escape') { setValue(dashboard.name); setRenaming(false); }
        }}
        style={{
          padding: '8px 10px', fontSize: 13, borderRadius: 6,
          border: '1px solid var(--text)', background: 'var(--bg)', color: 'var(--text)',
          outline: 'none', width: 120, flexShrink: 0,
        }}
      />
    );
  }

  return (
    <>
      <Link
        href={href}
        onContextMenu={e => {
          const url = `${window.location.origin}${href}`;
          const items: ContextMenuItem[] = [
            { icon: 'open', label: 'Open', onClick: () => router.push(href) },
            { icon: 'open', label: 'Open in new tab', onClick: () => window.open(href, '_blank') },
            { icon: 'link', label: 'Copy URL', onClick: () => navigator.clipboard.writeText(url) },
            { type: 'separator' },
            ...(onRename ? [{ icon: 'edit', label: 'Rename', onClick: () => setRenaming(true) }] : []),
            { icon: 'duplicate', label: onDuplicate ? 'Duplicate' : 'Duplicate (coming soon)', disabled: !onDuplicate, onClick: () => onDuplicate?.(dashboard) },
            ...(onDelete ? [{ type: 'separator' as const }, { icon: 'trash', label: 'Delete', danger: true, onClick: () => onDelete(dashboard) }] : []),
          ];
          openMenu(e, items);
        }}
        style={{
          padding: '10px 14px',
          fontSize: 13,
          fontWeight: active ? 600 : 400,
          color: active ? 'var(--text)' : 'var(--text2)',
          borderBottom: active ? '2px solid var(--text)' : '2px solid transparent',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {dashboard.name}
      </Link>
      <ContextMenu menu={menu} onClose={closeMenu} />
    </>
  );
}

export function DashboardTabs({ dashboards, currentId, onRename, onDuplicate, onDelete }: Props) {
  if (dashboards.length <= 1) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 28px',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
      }}
    >
      {dashboards.map(d => (
        <DashboardTab
          key={d.id}
          dashboard={d}
          active={d.id === currentId}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
