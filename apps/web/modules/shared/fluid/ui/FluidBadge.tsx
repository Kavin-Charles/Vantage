type Tone = 'blue' | 'gold' | 'green' | 'red' | 'neutral';

const TONE: Record<Tone, { fg: string; bg: string }> = {
  blue:    { fg: 'var(--fl-primary)', bg: 'rgba(0,72,206,0.10)' },
  gold:    { fg: 'var(--fl-on-secondary-container)', bg: 'rgba(243,227,76,0.20)' },
  green:   { fg: '#1b5e20', bg: 'rgba(46,125,50,0.12)' },
  red:     { fg: 'var(--fl-on-error-container)', bg: 'var(--fl-error-container)' },
  neutral: { fg: 'var(--fl-on-surface-variant)', bg: 'var(--fl-surface-container-high)' },
};

export function FluidBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 'var(--fl-radius-pill)',
      fontFamily: 'var(--fl-font-body)', fontSize: 11, fontWeight: 600,
      letterSpacing: '0.02em', color: t.fg, background: t.bg, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}
