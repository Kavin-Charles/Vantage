'use client';

type Features = { crm: boolean; infra: boolean; alerts: boolean; analytics: boolean; files: boolean };

type Props = {
  value: Features;
  onChange: (v: Features) => void;
  onNext: () => void;
  onBack: () => void;
};

const FEATURE_LABELS: { key: keyof Features; label: string; desc: string }[] = [
  { key: 'crm', label: 'CRM', desc: 'Contacts, companies, deals, tasks, activity' },
  { key: 'infra', label: 'Infrastructure', desc: 'Server monitoring, databases, websites' },
  { key: 'alerts', label: 'Alerts', desc: 'Threshold alerts and notifications' },
  { key: 'analytics', label: 'Analytics', desc: 'Revenue charts, pipeline stats, rep leaderboard' },
  { key: 'files', label: 'Files', desc: 'File storage and management' },
];

export function StepFeatures({ value, onChange, onNext, onBack }: Props) {
  const toggle = (key: keyof Features) =>
    onChange({ ...value, [key]: !value[key] });

  const btnBase: React.CSSProperties = {
    padding: '8px 20px',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif',
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
        Features
      </h2>
      <p style={{ margin: '0 0 24px', color: 'var(--text2)', fontSize: 14 }}>
        Enable the modules you need.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {FEATURE_LABELS.map(({ key, label, desc }) => (
          <label
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
              background: value[key] ? 'var(--surface2)' : 'var(--surface)',
            }}
          >
            <input
              type="checkbox"
              checked={value[key]}
              onChange={() => toggle(key)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{desc}</div>
            </div>
          </label>
        ))}
      </div>

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ ...btnBase, background: 'var(--surface2)', color: 'var(--text)' }}>
          Back
        </button>
        <button onClick={onNext} style={{ ...btnBase, background: 'var(--text)', color: '#fff' }}>
          Next
        </button>
      </div>
    </div>
  );
}
