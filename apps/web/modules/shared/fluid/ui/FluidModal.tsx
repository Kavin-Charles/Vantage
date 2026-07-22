'use client';
import { MSIcon } from './MSIcon';

export function FluidModal({
  open, onClose, title, subtitle, children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,20,30,0.4)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 640, background: 'var(--fl-surface-container-lowest)',
        borderRadius: 'var(--fl-radius-card)', boxShadow: '0 24px 64px rgba(0,0,0,0.24)', overflow: 'hidden',
      }}>
        <div style={{ padding: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <h3 style={{ margin: 0, fontFamily: 'var(--fl-font-display)', fontWeight: 600, fontSize: 24, color: 'var(--fl-on-surface)' }}>{title}</h3>
              {subtitle ? <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--fl-on-surface-variant)' }}>{subtitle}</p> : null}
            </div>
            <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--fl-on-surface-variant)', padding: 8, borderRadius: 'var(--fl-radius-pill)' }}>
              <MSIcon name="close" size={22} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
