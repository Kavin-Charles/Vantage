'use client';

import { ChannelSidebar } from './ChannelSidebar';

export function MessagingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <ChannelSidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}
