export function MSIcon({
  name, size = 24, fill = false, weight = 400, style, className,
}: {
  name: string;
  size?: number;
  fill?: boolean;
  weight?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        fontFamily: 'var(--fluid-font-icon), "Material Symbols Outlined"',
        fontWeight: 'normal',
        fontStyle: 'normal',
        fontSize: size,
        lineHeight: 1,
        letterSpacing: 'normal',
        whiteSpace: 'nowrap',
        display: 'inline-block',
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
        userSelect: 'none',
        ...style,
      }}
    >
      {name}
    </span>
  );
}
