import { Sidebar } from '@/modules/shared/components/Sidebar';
import { ServerMetricsProvider } from '@/modules/shared/contexts/ServerMetricsContext';
import { ModuleProvider } from '@/modules/shared/contexts/modules';
import { PendingProviderBanner } from '@/modules/shared/components/PendingProviderBanner';
import { ToastProvider } from '@/modules/shared/components/ui/Toast';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ServerMetricsProvider>
      <ModuleProvider>
        <ToastProvider>
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
          <Sidebar />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <PendingProviderBanner />
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {children}
            </div>
          </div>
        </div>
        </ToastProvider>
      </ModuleProvider>
    </ServerMetricsProvider>
  );
}
