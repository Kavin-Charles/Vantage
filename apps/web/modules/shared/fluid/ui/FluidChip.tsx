'use client';
export function FluidChip({
  children, active = false, onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 20px', borderRadius: 'var(--fl-radius-pill)',
        fontFamily: 'var(--fl-font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        transition: 'background .2s, color .2s',
        color: active ? 'var(--fl-on-primary-container)' : 'var(--fl-on-surface-variant)',
        background: active ? 'var(--fl-primary-container)' : 'var(--fl-surface-container-lowest)',
        border: active ? '1px solid transparent' : '1px solid var(--fl-outline-variant)',
      }}
    >
      {children}
    </button>
  );
}
