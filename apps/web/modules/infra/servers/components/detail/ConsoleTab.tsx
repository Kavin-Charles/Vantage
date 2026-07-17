'use client';

import { SshTerminal } from '@/modules/infra/servers/components/SshTerminal';

export function ConsoleTab({ serverId }: { serverId: string }) {
  return (
    <div style={{ height: 'calc(100vh - 220px)', minHeight: 400, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <SshTerminal serverId={serverId} />
    </div>
  );
}
