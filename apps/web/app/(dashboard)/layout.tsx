import { Sidebar } from '@/components/Sidebar';
import { AlertBar } from '@/components/AlertBar';
import { ServerMetricsProvider } from '@/contexts/ServerMetricsContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ServerMetricsProvider>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <AlertBar />
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {children}
          </div>
        </div>
      </div>
    </ServerMetricsProvider>
  );
}
