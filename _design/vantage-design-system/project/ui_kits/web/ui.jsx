/* UI primitives + icon set. Globally exposed for the other Babel scripts.
   Icons match assets/icons/* — 24×24 viewBox, 1.75 stroke, rounded caps/joins,
   currentColor only. Inlined here so React can tint them via stroke="currentColor". */

const ICON_STROKE = {
  // CRM
  pipeline: <>
    <rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="15" y="3" width="6" height="6" rx="1.5"/>
    <rect x="3" y="15" width="6" height="6" rx="1.5"/><rect x="15" y="15" width="6" height="6" rx="1.5"/>
    <path d="M9 6h6M9 18h6M6 9v6M18 9v6"/>
  </>,
  contacts: <><circle cx="12" cy="8" r="3.5"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/></>,
  companies: <>
    <path d="M4 21V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15"/>
    <path d="M12 9h7a1 1 0 0 1 1 1v11"/>
    <path d="M3 21h18"/>
    <path d="M7 9h.01M7 13h.01M7 17h.01M16 13h.01M16 17h.01"/>
  </>,
  tasks: <>
    <path d="M9 6h12M9 12h12M9 18h12"/>
    <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>
  </>,
  activity: <path d="M3 12h3l3-7 4 14 3-7h5"/>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
  // Infra
  servers: <>
    <rect x="3" y="4" width="18" height="6" rx="1.5"/>
    <rect x="3" y="14" width="18" height="6" rx="1.5"/>
    <circle cx="7" cy="7" r=".75" fill="currentColor"/><circle cx="7" cy="17" r=".75" fill="currentColor"/>
    <path d="M11 7h6M11 17h6"/>
  </>,
  databases: <>
    <ellipse cx="12" cy="5.5" rx="8" ry="2.5"/>
    <path d="M4 5.5v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-6"/>
    <path d="M4 11.5v7c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-7"/>
  </>,
  websites: <>
    <circle cx="12" cy="12" r="9"/>
    <path d="M3 12h18"/>
    <path d="M12 3a13.5 13.5 0 0 1 0 18"/>
    <path d="M12 3a13.5 13.5 0 0 0 0 18"/>
  </>,
  files: <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
    <path d="M14 3v6h6"/><path d="M8 13h8M8 17h6"/>
  </>,
  // General
  analytics: <>
    <path d="M4 20V4"/><path d="M4 20h16"/>
    <rect x="7" y="12" width="3.2" height="6" rx=".5"/>
    <rect x="12" y="8" width="3.2" height="10" rx=".5"/>
    <rect x="17" y="4" width="3.2" height="14" rx=".5"/>
  </>,
  alerts: <><path d="M12 3 2 21h20Z"/><path d="M12 10v5M12 18v.5"/></>,
  settings: <>
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
  </>,
  // Utility
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9Z"/><path d="M10.5 21a1.7 1.7 0 0 0 3 0"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  chevron: <path d="m6 9 6 6 6-6"/>,
  arrow: <><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></>,
  check: <path d="m5 12 5 5 9-11"/>,
  x: <><path d="M6 6l12 12"/><path d="M18 6 6 18"/></>,
  warning: <><path d="M12 3 2 21h20Z"/><path d="M12 10v5M12 18v.5"/></>,
  logout: <><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9z"/>,
  meeting: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/></>,
  note: <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
    <path d="M14 3v6h6"/><path d="M8 13h8M8 17h6"/>
  </>,
};

function Icon({ name, size = 18, color, strokeWidth = 1.75 }) {
  const path = ICON_STROKE[name];
  if (!path) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color ?? 'currentColor'} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

// ── Primitives ──────────────────────────────────────────────────────────────

const BTN_VARIANTS = {
  primary:   { background: 'var(--text)',    color: '#fff',           border: '1px solid var(--text)' },
  secondary: { background: 'var(--surface)', color: 'var(--text)',    border: '1px solid var(--border)' },
  danger:    { background: 'var(--red-bg)',  color: 'var(--red)',     border: '1px solid var(--red-bg)' },
  ghost:     { background: 'transparent',    color: 'var(--text2)',   border: '1px solid transparent' },
};

function Button({ children, variant = 'secondary', onClick, type = 'button', disabled, style }) {
  const [hover, setHover] = React.useState(false);
  const base = BTN_VARIANTS[variant];
  const hoverBg = variant === 'primary' ? '#1a2244'
    : variant === 'secondary' ? 'var(--surface2)'
    : variant === 'danger'    ? '#fed7d7'
    : 'var(--surface2)';
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 12,
        fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all .15s',
        whiteSpace: 'nowrap',
        ...base,
        ...(hover && !disabled ? { background: hoverBg } : {}),
        ...style,
      }}>
      {children}
    </button>
  );
}

const BADGE_COLORS = {
  green:  { background: 'var(--green-bg)',  color: 'var(--green)'  },
  amber:  { background: 'var(--amber-bg)',  color: 'var(--amber)'  },
  red:    { background: 'var(--red-bg)',    color: 'var(--red)'    },
  blue:   { background: 'var(--blue-bg)',   color: 'var(--blue)'   },
  purple: { background: 'var(--purple-bg)', color: 'var(--purple)' },
  gray:   { background: 'var(--surface2)',  color: 'var(--text2)'  },
};

function Badge({ label, color = 'gray', style }) {
  return (
    <span style={{
      ...BADGE_COLORS[color],
      fontSize: 11, fontWeight: 600, padding: '2px 9px',
      borderRadius: 999, display: 'inline-block', whiteSpace: 'nowrap',
      ...style,
    }}>{label}</span>
  );
}

const STATUS_COLOR = {
  prospect: 'blue', customer: 'green', cold: 'gray', churned: 'red',
  lead: 'gray', qualifying: 'blue', proposal: 'amber', closing: 'purple',
  won: 'green', lost: 'red',
  todo: 'amber', done: 'green',
  online: 'green', degraded: 'amber', offline: 'red', stopped: 'gray',
  healthy: 'green',
};

function Avatar({ name, size = 30, dark = true }) {
  const initial = (name || '?')[0].toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: dark ? 'var(--text)' : 'var(--surface2)',
      color: dark ? '#fff' : 'var(--text2)',
      border: dark ? 'none' : '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size <= 30 ? 12 : 14, fontWeight: 600, flexShrink: 0,
    }}>{initial}</div>
  );
}

function FormField({ label, children, error }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{label}</label>
      {children}
      {error && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{error}</p>}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontSize: 13, color: 'var(--text)', fontFamily: 'inherit', outline: 'none',
  transition: 'border-color .15s, box-shadow .15s, background .15s',
};

function Input(p) {
  const [focus, setFocus] = React.useState(false);
  return <input {...p}
    onFocus={(e) => { setFocus(true); p.onFocus?.(e); }}
    onBlur={(e) => { setFocus(false); p.onBlur?.(e); }}
    style={{
      ...inputStyle,
      ...(focus ? { borderColor: 'var(--text2)', background: 'var(--surface)', boxShadow: '0 0 0 3px rgba(11,19,48,0.06)' } : {}),
      ...p.style,
    }}/>;
}
function Select(p) {
  return <select {...p} style={{ ...inputStyle, ...p.style }}>{p.children}</select>;
}
function Textarea(p) {
  const [focus, setFocus] = React.useState(false);
  return <textarea {...p}
    onFocus={(e) => { setFocus(true); p.onFocus?.(e); }}
    onBlur={(e) => { setFocus(false); p.onBlur?.(e); }}
    style={{
      ...inputStyle, minHeight: 80, resize: 'vertical',
      ...(focus ? { borderColor: 'var(--text2)', background: 'var(--surface)', boxShadow: '0 0 0 3px rgba(11,19,48,0.06)' } : {}),
      ...p.style,
    }}/>;
}

function Modal({ title, onClose, children }) {
  React.useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', borderRadius: 20,
          border: '1px solid var(--border)', width: 460, maxWidth: '90vw',
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{title}</span>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function Eyebrow({ children, style }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, color: 'var(--text3)',
      textTransform: 'uppercase', letterSpacing: 1.4, ...style,
    }}>{children}</span>
  );
}

function fmtCurrency(v) {
  if (v == null) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}
function fmtCurrencyShort(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

Object.assign(window, {
  Icon, Button, Badge, BADGE_COLORS, STATUS_COLOR, Avatar,
  FormField, Input, Select, Textarea, Modal, Eyebrow,
  fmtCurrency, fmtCurrencyShort,
});
