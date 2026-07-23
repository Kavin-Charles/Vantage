import { SettingsNav } from '@/modules/settings/fluid/SettingsNav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 24 }}>
      <SettingsNav />
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
