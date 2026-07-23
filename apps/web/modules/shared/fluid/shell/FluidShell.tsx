'use client';
import { spaceGrotesk, inter, materialSymbols } from '@/modules/shared/fluid/fonts';
import { FluidSidebar } from './FluidSidebar';
import { FluidTopbar } from './FluidTopbar';
import '@/modules/shared/fluid/fluid.css';

export function FluidShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`fluid-root ${spaceGrotesk.variable} ${inter.variable} ${materialSymbols.variable}`}
      style={{ minHeight: '100vh', background: 'var(--fl-body-gradient)', backgroundAttachment: 'fixed' }}
    >
      <FluidSidebar />
      <FluidTopbar />
      <main style={{ paddingTop: 88, paddingLeft: 104, paddingRight: 24, paddingBottom: 48, minHeight: '100vh' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto' }}>{children}</div>
      </main>
    </div>
  );
}
