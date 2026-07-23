import { GlassCard } from '@/modules/shared/fluid/ui';

export function FluidWidgetCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassCard style={{ height: '100%' }}>
      <p style={{ margin: '0 0 12px', fontFamily: 'var(--fl-font-display)', fontWeight: 600, fontSize: 16 }}>{title}</p>
      {children}
    </GlassCard>
  );
}
