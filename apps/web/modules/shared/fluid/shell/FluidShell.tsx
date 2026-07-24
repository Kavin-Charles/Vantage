'use client';
import { spaceGrotesk, inter, materialSymbols } from '@/modules/shared/fluid/fonts';
import { ServerMetricsProvider } from '@/modules/shared/contexts/ServerMetricsContext';
import { ModuleProvider } from '@/modules/shared/contexts/modules';
import { ToastProvider } from '@/modules/shared/components/ui/Toast';
import { FluidDock } from './FluidDock';
import '@/modules/shared/fluid/fluid.css';

export function FluidShell({ children }: { children: React.ReactNode }) {
  // Auth/Theme/react-query come from the root layout. ModuleProvider,
  // ServerMetricsProvider and ToastProvider live in the (dashboard) layout, not
  // root — the (fluid) shell needs its own copies for useModules/metrics/toasts.
  return (
    <ServerMetricsProvider>
      <ModuleProvider>
        <ToastProvider>
          <div
            className={`fluid-root ${spaceGrotesk.variable} ${inter.variable} ${materialSymbols.variable}`}
            style={{ minHeight: '100vh', background: 'var(--fl-body-gradient)', backgroundAttachment: 'fixed' }}
          >
            <FluidDock />
            <main style={{ paddingTop: 32, paddingLeft: 104, paddingRight: 32, paddingBottom: 48, minHeight: '100vh' }}>
              <div style={{ maxWidth: 1600, margin: '0 auto' }}>{children}</div>
            </main>
          </div>
        </ToastProvider>
      </ModuleProvider>
    </ServerMetricsProvider>
  );
}
