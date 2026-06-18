'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { apiFetch } from '@/modules/shared/lib/api';

interface ModuleEventSetting {
  module_id: string;
  name: string;
  emits_activity: boolean;
  emits_alerts: boolean;
  activity_on: boolean;
  alerts_on: boolean;
}

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      disabled={disabled}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? 'var(--green)' : 'var(--border)',
        position: 'relative',
        transition: 'background .15s',
        padding: 0,
        outline: 'none',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .15s',
          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        }}
      />
    </button>
  );
}

export default function ActivitySettingsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data, isLoading } = useQuery({
    queryKey: ['module-event-settings'],
    queryFn: async () =>
      apiFetch<{ data: ModuleEventSetting[]; error: null }>('/api/settings/module-events', {
        token: await getToken(),
      }),
  });

  const toggleMut = useMutation({
    mutationFn: async ({
      moduleId,
      field,
      value,
    }: {
      moduleId: string;
      field: 'activity_on' | 'alerts_on';
      value: boolean;
    }) =>
      apiFetch(`/api/settings/module-events/${moduleId}`, {
        method: 'PATCH',
        token: await getToken(),
        body: JSON.stringify({ [field]: value }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['module-event-settings'] }),
  });

  const settings: ModuleEventSetting[] = data?.data ?? [];

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
        Activity &amp; Alerts
      </h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Choose which modules log to the activity feed and trigger alerts.
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
              Module
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text3)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                textAlign: 'center',
              }}
            >
              Activity
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text3)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                textAlign: 'center',
              }}
            >
              Alerts
            </span>
          </div>

          {settings.map((s, i) => (
            <div
              key={s.module_id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px',
                padding: '14px 18px',
                borderBottom: i < settings.length - 1 ? '1px solid var(--border)' : 'none',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                {s.name}
              </span>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                {s.emits_activity ? (
                  <Toggle
                    on={s.activity_on}
                    disabled={!isAdmin || toggleMut.isPending}
                    onChange={v =>
                      toggleMut.mutate({ moduleId: s.module_id, field: 'activity_on', value: v })
                    }
                  />
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                {s.emits_alerts ? (
                  <Toggle
                    on={s.alerts_on}
                    disabled={!isAdmin || toggleMut.isPending}
                    onChange={v =>
                      toggleMut.mutate({ moduleId: s.module_id, field: 'alerts_on', value: v })
                    }
                  />
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>
                )}
              </div>
            </div>
          ))}

          {settings.length === 0 && (
            <div
              style={{
                padding: '40px 18px',
                textAlign: 'center',
                color: 'var(--text3)',
                fontSize: 13,
              }}
            >
              No modules emit activities or alerts.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
