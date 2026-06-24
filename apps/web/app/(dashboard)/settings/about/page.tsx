'use client';

import webPackageJson from '../../../../package.json';
import { ContextMenu, useContextMenu } from '@/modules/shared/components/ui/ContextMenu';
import { settingRowMenu } from '@/modules/shared/lib/settingsMenu';

export default function AboutPage() {
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
  };

  const links = [
    { label: 'Documentation', href: 'https://github.com/Kavin-Charles/Vencore#readme' },
    { label: 'Report an issue', href: 'https://github.com/Kavin-Charles/Vencore/issues' },
  ];

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>About</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Version and resources.</p>

      <div style={card}>
        <div
          onContextMenu={e => openMenu(e, settingRowMenu({ label: 'Version', value: webPackageJson.version }))}
          style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}
        >
          <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>Version</span>
          <span style={{ fontSize: 13, color: 'var(--text)' }}>{webPackageJson.version}</span>
        </div>
        {links.map(link => (
          <div
            key={link.label}
            onContextMenu={e => openMenu(e, settingRowMenu({ label: link.label, value: link.href, href: link.href }))}
            style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}
          >
            <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{link.label}</span>
            <a href={link.href} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--text)', textDecoration: 'underline' }}>
              {link.href.replace('https://', '')}
            </a>
          </div>
        ))}
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 16, marginBottom: 0 }}>
          Vencore — One Platform to Run Your Entire Business.
        </p>
      </div>
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
