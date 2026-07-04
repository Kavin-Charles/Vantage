import { Sidebar } from '@/modules/shared/components/Sidebar';
import { ServerMetricsProvider } from '@/modules/shared/contexts/ServerMetricsContext';
import { ModuleProvider } from '@/modules/shared/contexts/modules';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ServerMetricsProvider>
      <ModuleProvider>
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
          <Sidebar />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {children}
            </div>
          </div>
        </div>
      </ModuleProvider>
    </ServerMetricsProvider>
  );
}
