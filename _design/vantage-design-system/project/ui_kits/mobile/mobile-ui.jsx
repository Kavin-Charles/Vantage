/* Mobile UI primitives — Vantage on a phone.
   These build on var(--bg)/var(--surface)/etc which are scoped per-frame
   so the same components serve light and dark variants.  */

// ── Theme context ────────────────────────────────────────────────────────────
const ThemeCtx = React.createContext({ accent: '#1652F0', dark: false, platform: 'ios' });
function useTheme() { return React.useContext(ThemeCtx); }

// ── Header — left back button (optional), title, right action ────────────────
function MobileHeader({ title, onBack, right, large, eyebrow }) {
  const { platform } = useTheme();
  // iOS centers small titles; Android left-aligns. We chose iOS-style centered.
  return (
    <div style={{
      flexShrink: 0,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '6px 6px 10px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', minHeight: 44,
      }}>
        <div style={{ width: 64, display: 'flex', alignItems: 'center' }}>
          {onBack && (
            <button onClick={onBack} className="vt-press"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 10px', color: 'var(--text)',
                display: 'inline-flex', alignItems: 'center', gap: 2,
                fontFamily: 'inherit', fontSize: 15, fontWeight: 400,
              }}>
              <Icon name="back" size={20} />
              <span style={{ marginLeft: -2 }}>{platform === 'ios' ? 'Back' : ''}</span>
            </button>
          )}
        </div>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          {!large && (
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600,
              letterSpacing: '-0.3px', color: 'var(--text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{title}</div>
          )}
        </div>
        <div style={{ width: 64, display: 'flex', justifyContent: 'flex-end', paddingRight: 6 }}>
          {right}
        </div>
      </div>
      {large && (
        <div style={{ padding: '4px 18px 6px' }}>
          {eyebrow && (
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4,
            }}>{eyebrow}</div>
          )}
          <div className="vt-display" style={{
            fontSize: 28, lineHeight: 1.05, color: 'var(--text)',
            letterSpacing: '-0.6px',
          }}>{title}</div>
        </div>
      )}
    </div>
  );
}

// ── Tab bar — bottom 5-tab nav (iOS: light glass / Android: filled) ─────────
function TabBar({ tabs, active, onTab }) {
  const { accent, platform } = useTheme();
  return (
    <div style={{
      flexShrink: 0,
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      padding: platform === 'ios' ? '6px 4px 4px' : '8px 4px 8px',
      display: 'flex', alignItems: 'stretch',
    }}>
      {tabs.map(t => {
        const on = active === t.id;
        return (
          <button key={t.id} onClick={() => onTab(t.id)}
            style={{
              flex: 1, background: 'none', border: 'none', cursor: 'pointer',
              padding: '6px 0 4px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 3,
              color: on ? accent : 'var(--text3)',
              fontFamily: 'inherit',
            }}>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon name={t.icon} size={22} strokeWidth={on ? 2 : 1.6} />
              {t.dot && (
                <span style={{
                  position: 'absolute', top: -1, right: -3,
                  width: 7, height: 7, borderRadius: 999, background: 'var(--red)',
                  border: '1.5px solid var(--surface)',
                }}/>
              )}
            </span>
            <span style={{ fontSize: 10, fontWeight: on ? 600 : 500, letterSpacing: 0.1 }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Screen scroll body ──────────────────────────────────────────────────────
function ScreenBody({ children, pad = true, style }) {
  return (
    <div className="vt-scroll" style={{
      flex: 1, minHeight: 0, padding: pad ? '14px 16px 24px' : 0, background: 'var(--bg)',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Card — generic surface ──────────────────────────────────────────────────
function Card({ children, pad = 16, style, onClick }) {
  return (
    <div onClick={onClick}
      className={onClick ? 'vt-press' : ''}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: pad,
        ...style,
      }}>{children}</div>
  );
}

// ── Section block — eyebrow + content ───────────────────────────────────────
function Section({ eyebrow, action, children, style }) {
  return (
    <div style={{ marginBottom: 18, ...style }}>
      {(eyebrow || action) && (
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          padding: '0 4px 8px',
        }}>
          {eyebrow && (
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: 1.2,
            }}>{eyebrow}</div>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── ListGroup — grouped iOS-style rows inside a card ────────────────────────
function ListGroup({ children, style }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 16, overflow: 'hidden', ...style,
    }}>{children}</div>
  );
}

function ListRow({ icon, iconBg, title, subtitle, right, onClick, last, danger }) {
  return (
    <div onClick={onClick}
      className={onClick ? 'vt-press' : ''}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        minHeight: 52, boxSizing: 'border-box',
      }}>
      {icon && (
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: iconBg ?? 'var(--surface2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: danger ? 'var(--red)' : 'var(--text2)',
          flexShrink: 0,
        }}>
          {typeof icon === 'string' ? <Icon name={icon} size={16} /> : icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 500,
          color: danger ? 'var(--red)' : 'var(--text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{title}</div>
        {subtitle && (
          <div style={{
            fontSize: 12, color: 'var(--text3)', marginTop: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{subtitle}</div>
        )}
      </div>
      {right !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text3)' }}>
          {right}
          {onClick && <Icon name="chevronRight" size={16} />}
        </div>
      )}
      {right === undefined && onClick && <Icon name="chevronRight" size={16} color="var(--text3)" />}
    </div>
  );
}

// ── Badge — color pair ──────────────────────────────────────────────────────
const BADGE_COLORS = {
  green:  { background: 'var(--green-bg)',  color: 'var(--green)'  },
  amber:  { background: 'var(--amber-bg)',  color: 'var(--amber)'  },
  red:    { background: 'var(--red-bg)',    color: 'var(--red)'    },
  blue:   { background: 'var(--blue-bg)',   color: 'var(--blue)'   },
  purple: { background: 'var(--purple-bg)', color: 'var(--purple)' },
  gray:   { background: 'var(--surface2)',  color: 'var(--text2)'  },
};

function Badge({ label, color = 'gray', size = 'sm', style }) {
  return (
    <span style={{
      ...BADGE_COLORS[color],
      fontSize: size === 'sm' ? 10 : 11, fontWeight: 600,
      padding: size === 'sm' ? '2px 8px' : '3px 10px',
      borderRadius: 999, whiteSpace: 'nowrap',
      display: 'inline-block',
      letterSpacing: 0.2,
      ...style,
    }}>{label}</span>
  );
}

// ── Avatar — initial circle ─────────────────────────────────────────────────
function Avatar({ name, size = 32, tone = 'paper' }) {
  const initial = (name || '?')[0].toUpperCase();
  const palette = {
    paper: { bg: 'var(--surface2)', fg: 'var(--text2)', border: '1px solid var(--border)' },
    ink:   { bg: 'var(--text)',     fg: '#fff',         border: 'none' },
  };
  const p = palette[tone] ?? palette.paper;
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: p.bg, color: p.fg, border: p.border,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size <= 28 ? 11 : 13, fontWeight: 600,
      flexShrink: 0,
    }}>{initial}</div>
  );
}

// ── Primary button — accent-filled, full-width-by-default mobile shape ─────
function Btn({ children, onClick, variant = 'primary', leading, style, disabled }) {
  const { accent } = useTheme();
  const variants = {
    primary:   { background: 'var(--text)', color: '#fff', border: '1px solid var(--text)' },
    accent:    { background: accent, color: '#fff', border: `1px solid ${accent}` },
    secondary: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
    ghost:     { background: 'transparent', color: 'var(--text2)', border: '1px solid transparent' },
    danger:    { background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid transparent' },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '11px 16px', borderRadius: 12,
        fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        ...variants[variant],
        ...style,
      }}>
      {leading && <Icon name={leading} size={16} />}
      {children}
    </button>
  );
}

// ── KPI tile — for Home + Analytics ─────────────────────────────────────────
function KpiTile({ label, value, delta, deltaTone = 'green', sparkline }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: 14,
      display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 600, color: 'var(--text3)',
        textTransform: 'uppercase', letterSpacing: 1.1,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</div>
      <div className="vt-display" style={{
        fontSize: 22, lineHeight: 1, color: 'var(--text)',
        letterSpacing: '-0.5px',
      }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
        {delta != null && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: deltaTone === 'green' ? 'var(--green)' : deltaTone === 'red' ? 'var(--red)' : 'var(--text3)',
          }}>{delta}</span>
        )}
        {sparkline && (
          <div className="vt-spark" style={{ color: 'var(--text3)', marginLeft: 'auto' }}>
            {sparkline}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sparkline — tiny SVG line, given an array of values ────────────────────
function Sparkline({ data, width = 60, height = 22, fill = true }) {
  if (!data?.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * (height - 2) - 1).toFixed(1)}`);
  const linePath = `M ${pts.join(' L ')}`;
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {fill && <path d={areaPath} className="fill" />}
      <path d={linePath} />
    </svg>
  );
}

// ── Status dot — colored pulse ──────────────────────────────────────────────
function StatusDot({ color = 'var(--green)', pulse = false }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 8, height: 8 }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: color }} />
      {pulse && (
        <span style={{
          position: 'absolute', inset: -4, borderRadius: 999, background: color,
          opacity: 0.3, animation: 'vt-pulse 1.6s ease-out infinite',
        }} />
      )}
    </span>
  );
}

// ── Segmented control — for tabs inside a screen ────────────────────────────
function Segmented({ value, onChange, options }) {
  return (
    <div style={{
      display: 'inline-flex', background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 3, gap: 0, width: '100%',
    }}>
      {options.map(opt => {
        const on = value === opt.id;
        return (
          <button key={opt.id} onClick={() => onChange(opt.id)}
            style={{
              flex: 1, padding: '6px 8px', borderRadius: 8, border: 'none',
              background: on ? 'var(--surface)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--text2)',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
              boxShadow: on ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              transition: 'all .15s',
            }}>
            {opt.icon && <Icon name={opt.icon} size={13} />}
            {opt.label}
            {opt.count != null && (
              <span style={{ opacity: 0.6, fontWeight: 600 }}>{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Bottom sheet — slides up from below ────────────────────────────────────
function BottomSheet({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 80,
      background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%',
        background: 'var(--surface)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        boxShadow: '0 -8px 32px rgba(0,0,0,.18)',
        animation: 'vt-sheet .22s ease',
        paddingBottom: 28,
      }}>
        <div style={{
          width: 36, height: 4, background: 'var(--border2)', borderRadius: 2,
          margin: '10px auto 6px',
        }} />
        {title && (
          <div style={{
            padding: '6px 18px 14px', borderBottom: '1px solid var(--border)',
            fontWeight: 600, fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font-display)',
          }}>{title}</div>
        )}
        <div style={{ padding: '14px 16px 4px' }}>{children}</div>
      </div>
      <style>{`@keyframes vt-sheet { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}

// ── Inline mini-logo (cloud mark) ──────────────────────────────────────────
function LogoMark({ size = 24 }) {
  return (
    <img src="../../assets/logo-cloud-trimmed.png" alt="Vantage"
      style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />
  );
}

// ── Money / number helpers ─────────────────────────────────────────────────
function fmtMoney(v) {
  if (v == null) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}
function fmtMoneyShort(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

Object.assign(window, {
  ThemeCtx, useTheme,
  MobileHeader, TabBar, ScreenBody,
  Card, Section, ListGroup, ListRow,
  Badge, BADGE_COLORS, Avatar,
  Btn, KpiTile, Sparkline, StatusDot, Segmented,
  BottomSheet, LogoMark,
  fmtMoney, fmtMoneyShort,
});
