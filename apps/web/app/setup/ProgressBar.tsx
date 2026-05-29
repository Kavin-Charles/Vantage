const STEPS = ['Branding', 'Features', 'SMTP', 'Admin Account', 'Review'];

export function ProgressBar({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {STEPS.map((label, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          return (
            <div key={step} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: done ? 'var(--green)' : active ? 'var(--text)' : 'var(--border)',
                  color: done || active ? '#fff' : 'var(--text3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  flexShrink: 0,
                }}>
                  {done ? '✓' : step}
                </div>
                <span style={{
                  fontSize: 11,
                  color: active ? 'var(--text)' : 'var(--text3)',
                  fontWeight: active ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  height: 2,
                  flex: 1,
                  background: done ? 'var(--green)' : 'var(--border)',
                  marginBottom: 20,
                  marginLeft: -4,
                  marginRight: -4,
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
