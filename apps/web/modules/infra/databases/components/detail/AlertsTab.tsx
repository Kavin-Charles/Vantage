'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { Button } from '@/modules/shared/components/ui/Button';
import { Badge } from '@/modules/shared/components/ui/Badge';
import {
  listInfraDatabaseAlerts,
  getInfraDatabaseThresholds,
  setInfraDatabaseThresholds,
  clearInfraDatabaseThresholds,
  type DbThresholdValues,
} from '@/modules/infra/databases/lib/infra-databases';

const eyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 12,
};

const sevColor = (s: string) => s === 'critical' ? 'red' : s === 'warning' ? 'amber' : 'blue';

function ThresholdField({
  label, value, unit, onChange,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (n: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          min={0}
          value={String(value)}
          onChange={e => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
          style={{
            width: 80, padding: '6px 8px', border: '1px solid var(--border)',
            borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{unit}</span>
      </div>
    </div>
  );
}

export function DatabaseAlertsTab({ databaseId }: { databaseId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('databases:edit');
  const [showResolved, setShowResolved] = useState(false);
  const [draft, setDraft] = useState<DbThresholdValues | null>(null);

  const alertsQ = useQuery({
    queryKey: ['db-alerts', databaseId, showResolved],
    queryFn: async () => listInfraDatabaseAlerts(await getToken(), databaseId, showResolved),
    refetchInterval: 30_000,
  });

  const thresholdsQ = useQuery({
    queryKey: ['db-thresholds', databaseId],
    queryFn: async () => getInfraDatabaseThresholds(await getToken(), databaseId),
  });

  useEffect(() => {
    if (thresholdsQ.data) setDraft(thresholdsQ.data.data.effective);
  }, [thresholdsQ.data]);

  const saveMut = useMutation({
    mutationFn: async (body: DbThresholdValues) => setInfraDatabaseThresholds(await getToken(), databaseId, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['db-thresholds', databaseId] }),
  });

  const clearMut = useMutation({
    mutationFn: async () => clearInfraDatabaseThresholds(await getToken(), databaseId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['db-thresholds', databaseId] }),
  });

  const alerts = alertsQ.data?.data ?? [];
  const hasOverride = thresholdsQ.data?.data.override != null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
      {/* Alert history */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={eyebrow}>Alert history</div>
          <button
            onClick={() => setShowResolved(v => !v)}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--text2)',
            }}
          >
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </button>
        </div>
        {alertsQ.isLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
        ) : alerts.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No alerts for this database.
          </div>
        ) : alerts.map((a, i) => (
          <div
            key={a.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderBottom: i < alerts.length - 1 ? '1px solid var(--border)' : 'none',
              opacity: a.resolved ? 0.5 : 1,
            }}
          >
            <Badge label={a.severity} color={sevColor(a.severity) as 'red' | 'amber' | 'blue'} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{a.message}</span>
            <span style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
              {new Date(a.created_at).toLocaleString()}
            </span>
            {a.resolved
              ? <Badge label="resolved" color="gray" />
              : canEdit && (
                <button
                  onClick={async () => {
                    const token = await getToken();
                    await fetch(`/api/alerts/${a.id}/resolve`, {
                      method: 'PATCH',
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    void qc.invalidateQueries({ queryKey: ['db-alerts', databaseId] });
                  }}
                  style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                    padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text2)',
                  }}
                >
                  Resolve
                </button>
              )
            }
          </div>
        ))}
      </div>

      {/* Threshold panel */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
        <div style={eyebrow}>Alert thresholds</div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 0, marginBottom: 16 }}>
          {hasOverride
            ? 'This database uses a custom override.'
            : 'Using workspace default. Saving creates a per-database override.'}
        </p>
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ThresholdField
              label="Max connections"
              value={draft.connection_count_max}
              unit="conns"
              onChange={n => setDraft(d => d && { ...d, connection_count_max: n })}
            />
            <ThresholdField
              label="Max replication lag"
              value={draft.replication_lag_s_max}
              unit="s"
              onChange={n => setDraft(d => d && { ...d, replication_lag_s_max: n })}
            />
            <ThresholdField
              label="Max storage"
              value={draft.storage_gb_max}
              unit="GB"
              onChange={n => setDraft(d => d && { ...d, storage_gb_max: n })}
            />
            {canEdit && (
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Button
                  variant="primary"
                  onClick={() => draft && saveMut.mutate(draft)}
                  disabled={saveMut.isPending}
                >
                  {saveMut.isPending ? 'Saving…' : 'Save override'}
                </Button>
                {hasOverride && (
                  <Button onClick={() => clearMut.mutate()} disabled={clearMut.isPending}>
                    Reset
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
