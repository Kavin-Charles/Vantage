'use client';
export function FluidSelect({
  value, onChange, options, testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  testId?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      data-testid={testId}
      style={{
        padding: '12px 16px', borderRadius: 'var(--fl-radius-input)',
        fontFamily: 'var(--fl-font-body)', fontSize: 15, color: 'var(--fl-on-surface)',
        background: 'var(--fl-surface-container-lowest)', border: '1px solid var(--fl-outline-variant)',
        outline: 'none', cursor: 'pointer',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
