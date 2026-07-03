'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';

const NAV = [
  { href: 'tasks',      label: 'Tasks'      },
  { href: 'roadmap',    label: 'Roadmap'    },
  { href: 'milestones', label: 'Milestones' },
  { href: 'members',    label: 'Members'    },
  { href: 'sprints',    label: 'Sprints'    },
  { href: 'analytics',  label: 'Analytics'  },
  { href: 'crm',        label: 'CRM'        },
  { href: 'portal',     label: 'Portal'     },
  { href: 'docs',       label: 'Docs'       },
  { href: 'automation', label: 'Automation' },
  { href: 'settings',   label: 'Settings'   },
];

function NavTab({ id, href, label, active }: { id: string; href: string; label: string; active: boolean }) {
  const router = useRouter();
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const fullPath = `/projects/${id}/${href}`;

  return (
    <>
      <Link
        href={fullPath}
        onContextMenu={e => {
          const url = `${window.location.origin}${fullPath}`;
          const items: ContextMenuItem[] = [
            { icon: 'open', label: 'Open', onClick: () => router.push(fullPath) },
            { icon: 'open', label: 'Open in new tab', onClick: () => window.open(fullPath, '_blank') },
            { icon: 'link', label: 'Copy URL', onClick: () => navigator.clipboard.writeText(url) },
            { type: 'separator' },
            { icon: 'refresh', label: 'Refresh', onClick: () => router.refresh() },
          ];
          openMenu(e, items);
        }}
        style={{
          fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
          padding: '8px 14px', textDecoration: 'none', display: 'inline-block',
          color: active ? 'var(--text)' : 'var(--text2)',
          borderBottom: `2px solid ${active ? 'var(--text)' : 'transparent'}`,
          transition: 'color 0.15s ease, border-color 0.15s ease',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Link>
      <ContextMenu menu={menu} onClose={closeMenu} />
    </>
  );
}

export function ProjectNav({ id }: { id: string }) {
  const pathname = usePathname();

  return (
    <div style={{ display: 'flex', gap: 0, alignItems: 'center', overflowX: 'auto' }}>
      {NAV.map(n => {
        const active = pathname.includes(`/projects/${id}/${n.href}`);
        return <NavTab key={n.href} id={id} href={n.href} label={n.label} active={active} />;
      })}
    </div>
  );
}
