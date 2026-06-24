'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { apiFetch } from '@/modules/shared/lib/api';
import { ContextMenu, useContextMenu } from '@/modules/shared/components/ui/ContextMenu';

const CHANNELS = ['email', 'push'] as const;
const SEVERITIES = ['critical', 'warning', 'info'] as const;

type Channel = (typeof CHANNELS)[number];
type Severity = (typeof SEVERITIES)[number];

interface PrefItem {
  channel: Channel;
  severity: Severity;
  enabled: boolean;
}

const SEV_COLOR: Record<Severity, string> = {
  critical: 'var(--red)',
  warning: 'var(--amber)',
  info: 'var(--blue)',
};

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? 'var(--green)' : 'var(--border)',
        position: 'relative',
        transition: 'background .15s',
        padding: 0,
        outline: 'none',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .15s',
          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        }}
      />
    </button>
  );
}

export default function NotificationPreferencesPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const { data, isLoading } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () =>
      apiFetch<{ data: PrefItem[]; error: null }>('/api/settings/notifications', {
        token: await getToken(),
      }),
  });

  const saveMut = useMutation({
    mutationFn: async (prefs: PrefItem[]) =>
      apiFetch('/api/settings/notifications', {
        method: 'PATCH',
        token: await getToken(),
        body: JSON.stringify(prefs),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-preferences'] }),
  });

  const prefs: PrefItem[] = data?.data ?? [];

  function isEnabled(channel: Channel, severity: Severity) {
    return prefs.find(p => p.channel === channel && p.severity === severity)?.enabled ?? true;
  }

  function toggle(channel: Channel, severity: Severity) {
    const current = isEnabled(channel, severity);
    const updated: PrefItem[] = CHANNELS.flatMap(ch =>
      SEVERITIES.map(sev => ({
        channel: ch,
        severity: sev,
        enabled: ch === channel && sev === severity ? !current : isEnabled(ch, sev),
      })),
    );
    saveMut.mutate(updated);
  }

  return (
    <div style={{ maxWidth: 540 }}>
      <h2
        style={{
          fontSize: 15,
          fontWeight: 600,
          marginBottom: 4,
          marginTop: 0,
          color: 'var(--text)',
        }}
      >
        Notification Preferences
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, marginTop: 0 }}>
        Choose which alert severities trigger notifications per channel.
      </p>

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 80px',
              padding: '10px 18px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg)',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text3)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Severity
            </span>
            {CHANNELS.map(ch => (
              <span
                key={ch}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text3)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  textAlign: 'center',
                }}
              >
                {ch}
              </span>
            ))}
          </div>
          {SEVERITIES.map((sev, i) => (
            <div
              key={sev}
              onContextMenu={e => {
                if (!isAdmin) return;
                openMenu(e, [
                  { icon: 'copy', label: 'Copy setting name', onClick: () => navigator.clipboard.writeText(`${sev} notifications`) },
                  { type: 'separator' },
                  { icon: 'refresh', label: 'Reset to default (all on)', onClick: () => {
                    const updated: PrefItem[] = CHANNELS.flatMap(ch => SEVERITIES.map(s => ({ channel: ch, severity: s, enabled: s === sev ? true : isEnabled(ch, s) })));
                    saveMut.mutate(updated);
                  } },
                ]);
              }}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px',
                padding: '14px 18px',
                borderBottom: i < SEVERITIES.length - 1 ? '1px solid var(--border)' : 'none',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: SEV_COLOR[sev],
                  textTransform: 'capitalize',
                }}
              >
                {sev}
              </span>
              {CHANNELS.map(ch => (
                <div key={ch} style={{ display: 'flex', justifyContent: 'center' }}>
                  <Toggle
                    on={isEnabled(ch, sev)}
                    disabled={!isAdmin || saveMut.isPending}
                    onChange={() => toggle(ch, sev)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
