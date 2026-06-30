'use client';

export type PasswordRule = { id: string; label: string; test: (pw: string) => boolean };

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: pw => pw.length >= 8 },
  { id: 'case',   label: 'Upper & lowercase letters', test: pw => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  { id: 'number', label: 'At least one number', test: pw => /\d/.test(pw) },
];

export function scorePassword(pw: string): number {
  if (!pw) return 0;
  let score = PASSWORD_RULES.filter(r => r.test(pw)).length;
  if (pw.length >= 12) score += 1;
  return Math.min(score, 4);
}

const LEVELS = [
  { label: 'Weak',   color: 'var(--red)' },
  { label: 'Weak',   color: 'var(--red)' },
  { label: 'Fair',   color: 'var(--amber)' },
  { label: 'Good',   color: 'var(--blue)' },
  { label: 'Strong', color: 'var(--green)' },
];

export function PasswordStrengthMeter({ password }: { password: string }) {
  const score = scorePassword(password);
  const level = LEVELS[score];

  if (!password) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i < score ? level.color : 'var(--border)',
              transition: 'background var(--motion-fast) var(--motion-ease)',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: level.color }}>{level.label}</span>
      </div>
      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {PASSWORD_RULES.map(rule => {
          const passed = rule.test(password);
          return (
            <li key={rule.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, color: passed ? 'var(--green)' : 'var(--text3)',
              transition: 'color var(--motion-fast) var(--motion-ease)',
            }}>
              <span style={{ width: 14, textAlign: 'center', fontWeight: 700 }}>{passed ? '✓' : '○'}</span>
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
