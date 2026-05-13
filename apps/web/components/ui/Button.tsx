type Variant = 'primary' | 'secondary' | 'danger';

const variants: Record<Variant, React.CSSProperties> = {
  primary: { background: 'var(--text)', color: '#fff', border: '1px solid var(--text)' },
  secondary: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
  danger: { background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-bg)' },
};

export function Button({
  children,
  variant = 'secondary',
  onClick,
  type = 'button',
  disabled,
  style,
}: {
  children: React.ReactNode;
  variant?: Variant;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 14px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all .15s',
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}
