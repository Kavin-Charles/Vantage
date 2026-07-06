'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type AutomationLog } from '@/modules/projects/lib/api';

interface Props {
  projectId: string;
}

export function AutomationLogViewer({ projectId }: Props) {
  const getToken = useApiToken();

  const { data, isLoading } = useQuery({
    queryKey: ['automation-logs', projectId],
    queryFn: async () => pmApi.listAutomationLogs(await getToken(), projectId),
  });
  const logs: AutomationLog[] = data?.data ?? [];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginTop: 20 }}>
      <p style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 14px' }}>
        Recent Runs
      </p>

      {isLoading && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', margin: 0 }}>Loading…</p>
      )}

      {!isLoading && logs.length === 0 && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', margin: 0, fontStyle: 'italic' }}>
          No automation runs yet.
        </p>
      )}

      {logs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map(log => (
            <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{
                fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, marginTop: 2,
                background: log.success ? 'var(--green-bg)' : 'var(--red-bg)',
                color: log.success ? 'var(--green)' : 'var(--red)',
              }}>
                {log.success ? 'OK' : 'Failed'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{log.rule_name}</span>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                    {new Date(log.triggered_at).toLocaleString()}
                  </span>
                </div>
                {log.detail && (
                  <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: '2px 0 0' }}>{log.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
