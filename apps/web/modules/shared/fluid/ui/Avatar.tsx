function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} width={size} height={size} style={{ borderRadius: 'var(--fl-radius-pill)', objectFit: 'cover' }} />;
  }
  return (
    <span style={{
      width: size, height: size, borderRadius: 'var(--fl-radius-pill)', display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', background: 'var(--fl-surface-container-high)',
      color: 'var(--fl-on-surface-variant)', fontFamily: 'var(--fl-font-body)',
      fontWeight: 700, fontSize: size * 0.36,
    }}>
      {initials(name)}
    </span>
  );
}
