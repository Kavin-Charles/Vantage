/* Shell — sidebar (with cloud-mark wordmark) + topbar + alert card. */

const NAV_GROUPS = [
  {
    label: 'CRM',
    items: [
      { id: 'pipeline',  label: 'Pipeline',  icon: 'pipeline'  },
      { id: 'contacts',  label: 'Contacts',  icon: 'contacts'  },
      { id: 'companies', label: 'Companies', icon: 'companies' },
      { id: 'tasks',     label: 'Tasks',     icon: 'tasks'     },
      { id: 'activity',  label: 'Activity',  icon: 'activity'  },
      { id: 'mail',      label: 'Mail',      icon: 'mail'      },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { id: 'servers',   label: 'Servers',   icon: 'servers'   },
      { id: 'databases', label: 'Databases', icon: 'databases' },
      { id: 'websites',  label: 'Websites',  icon: 'websites'  },
      { id: 'files',     label: 'Files',     icon: 'files'     },
    ],
  },
  {
    label: 'General',
    items: [
      { id: 'analytics', label: 'Analytics', icon: 'analytics' },
      { id: 'alerts',    label: 'Alerts',    icon: 'alerts', dot: true },
      { id: 'settings',  label: 'Settings',  icon: 'settings'  },
    ],
  },
];

const PAGE_TITLES = {
  pipeline: 'Pipeline', contacts: 'Contacts', companies: 'Companies',
  tasks: 'Tasks', activity: 'Activity', mail: 'Mail',
  servers: 'Servers', databases: 'Databases', websites: 'Websites', files: 'Files',
  analytics: 'Analytics', alerts: 'Alerts', settings: 'Settings',
};

function Sidebar({ active, onNavigate }) {
  return (
    <div style={{
      width: 220, background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100%',
      overflowY: 'auto',
    }}>
      {/* Logo lockup */}
      <div style={{
        padding: '16px 18px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          <img src="../../assets/logo-cloud-trimmed.png" alt="Vantage" style={{ width: 30, height: 30, objectFit: 'contain' }} />
        </div>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 19,
          fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.4px',
        }}>Vantage</span>
      </div>

      {NAV_GROUPS.map(group => (
        <div key={group.label} style={{ padding: '12px 12px 4px' }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: 1.4, padding: '0 10px', marginBottom: 6,
          }}>{group.label}</div>
          {group.items.map(item => (
            <NavLink key={item.id} item={item} active={active === item.id} onClick={() => onNavigate(item.id)} />
          ))}
        </div>
      ))}

      <div style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12 }}>
          <Avatar name="Nina" size={30} dark={false} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Nina Park</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'capitalize' }}>admin</div>
          </div>
          <button title="Sign out"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
            <Icon name="logout" size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function NavLink({ item, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  const bg = active ? 'var(--text)' : (hover ? 'var(--surface2)' : 'transparent');
  const fg = active ? '#fff' : (hover ? 'var(--text)' : 'var(--text2)');
  return (
    <a onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 12, cursor: 'pointer',
        color: fg, background: bg,
        fontWeight: active ? 500 : 400, fontSize: 13.5,
        marginBottom: 2, userSelect: 'none',
        transition: 'all .15s',
        position: 'relative',
      }}>
      <span style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: active ? 1 : (hover ? 1 : 0.75) }}>
        <Icon name={item.icon} size={16} />
      </span>
      {item.label}
      {item.dot && <PulseDot />}
    </a>
  );
}

function PulseDot() {
  return (
    <span style={{
      position: 'relative', width: 7, height: 7, borderRadius: 999,
      background: 'var(--red)', marginLeft: 'auto', flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', inset: -3, borderRadius: 999,
        background: 'var(--red)', opacity: 0.35,
        animation: 'vt-pulse 1.6s ease-out infinite',
      }} />
    </span>
  );
}

function Topbar({ active, action, left }) {
  return (
    <div style={{
      height: 56, background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 24px',
      gap: 16, flexShrink: 0,
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        {left ?? (
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 20,
            fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.4px',
          }}>{PAGE_TITLES[active] ?? 'Vantage'}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '6px 12px', width: 240,
        }}>
          <span style={{ color: 'var(--text3)', display: 'inline-flex', flexShrink: 0 }}><Icon name="search" size={15} /></span>
          <input placeholder="Search..."
            style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', fontFamily: 'inherit', width: '100%' }}/>
        </div>
        <button style={{
          background: 'none', border: '1px solid transparent',
          width: 34, height: 34, borderRadius: 10, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text2)',
        }}><Icon name="bell" size={16} /></button>
        {action}
      </div>
    </div>
  );
}

function AlertCard({ count, severity, message, onDismiss }) {
  return (
    <div style={{
      margin: '12px 24px 0',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 16px',
        background: 'linear-gradient(180deg,#fff7ed 0%,#fef3c7 100%)',
      }}>
        <span style={{ position: 'relative', width: 8, height: 8, borderRadius: 999, background: 'var(--amber)', flexShrink: 0 }}>
          <span style={{ position: 'absolute', inset: -4, borderRadius: 999, background: 'var(--amber)', opacity: 0.3, animation: 'vt-pulse 1.6s ease-out infinite' }}/>
        </span>
        <span style={{ font: '600 13px var(--font-sans)', color: 'var(--amber)' }}>{count} active alert{count > 1 ? 's' : ''}</span>
        <span style={{ font: '13px var(--font-sans)', color: 'var(--text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Highest severity · <strong style={{ fontWeight: 600 }}>{message}</strong>
        </span>
        <a href="#" style={{
          font: '500 12px var(--font-sans)', color: 'var(--amber)',
          textDecoration: 'none', whiteSpace: 'nowrap',
          padding: '5px 10px', borderRadius: 8, background: 'rgba(146,64,14,0.08)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>Open <Icon name="arrow" size={12} /></a>
        <button onClick={onDismiss}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)', display: 'flex', padding: 2 }}>
          <Icon name="x" size={14} />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', padding: '10px 12px', gap: 6, borderTop: '1px solid var(--border)' }}>
        {[
          ['critical', 'var(--red)',    '#fee2e2', severity.critical],
          ['warning',  'var(--amber)',  '#fef3c7', severity.warning],
          ['info',     'var(--blue)',   '#dbeafe', severity.info],
        ].map(([sev, fg, bg, n]) => (
          <div key={sev} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: bg, borderRadius: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: fg }} />
            <span style={{ font: '600 11px var(--font-sans)', color: fg, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sev}</span>
            <span style={{ marginLeft: 'auto', font: '600 16px var(--font-display)', color: fg, letterSpacing: '-0.3px' }}>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar, AlertCard, PAGE_TITLES });
