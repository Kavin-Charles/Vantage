'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { Button } from '@/modules/shared/components/ui/Button';

interface Candidate {
  id: string;
  name: string;
  builtin: boolean;
  record_count: number;
}

interface ProviderGroup {
  group: string;
  label: string;
  contracts: { required: string[]; optional: string[] };
  status: 'active' | 'pending_selection';
  active_provider: Candidate;
  pending_candidate: Candidate | null;
  candidates: Candidate[];
}

/**
 * Provider selection, rendered inside Settings → Integrations. Renders nothing
 * unless at least one group actually has a plugin provider available (a
 * non-builtin candidate) or a pending selection — so with no provider plugin
 * installed there is nothing to show. Everything is data-driven: group labels,
 * provider names, and candidates all come from the API.
 */
export function DataProvidersSection() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ group: ProviderGroup; candidate: Candidate } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['hub-providers'],
    queryFn: async () => {
      const res = await apiFetch<{ data: ProviderGroup[]; error: null }>(
        '/api/settings/hub-providers',
        { token: await getToken() },
      );
      return res.data ?? [];
    },
  });

  // Only surface groups that actually have a choice to make: a plugin provider
  // is installed (non-builtin candidate), or a selection is pending.
  const groups = (data ?? []).filter(
    (g) => g.status === 'pending_selection' || g.candidates.some((c) => !c.builtin),
  );
  if (groups.length === 0) return null;

  async function selectProvider(group: ProviderGroup, candidate: Candidate) {
    setSwitching(group.group);
    setError(null);
    try {
      await apiFetch(`/api/settings/hub-providers/${group.group}`, {
        method: 'PUT',
        body: JSON.stringify({ provider_id: candidate.id }),
        token: await getToken(),
      });
      await queryClient.invalidateQueries({ queryKey: ['hub-providers'] });
      await queryClient.invalidateQueries({ queryKey: ['hooks'] });
    } catch {
      setError('Could not switch provider. Please try again.');
    } finally {
      setSwitching(null);
      setConfirm(null);
    }
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{
        fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--text3)',
        textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px',
      }}>
        Data providers
      </p>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.55 }}>
        Each data category is powered by one provider at a time. Hooks, plugins, and cross-module
        features read from the active provider. Switching keeps the other provider&apos;s data — nothing is deleted.
      </p>

      {error && (
        <div style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.group} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{g.label}</p>
            {g.status === 'pending_selection' && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'var(--amber-bg)', color: 'var(--amber)' }}>
                Selection needed
              </span>
            )}
          </div>

          {g.status === 'pending_selection' && g.pending_candidate && (
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text2)', background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', lineHeight: 1.5 }}>
              <b>{g.pending_candidate.name}</b> was installed and can power {g.label} data.
              Consumers keep using <b>{g.active_provider.name}</b> until you choose.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {g.candidates.map((c) => {
              const isActive = g.status === 'active' && g.active_provider.id === c.id;
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    border: `1px solid ${isActive ? 'var(--green)' : 'var(--border)'}`,
                    borderRadius: 10, padding: '10px 14px',
                    background: isActive ? 'var(--green-bg)' : 'var(--surface)',
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
                      {c.name}
                      {c.builtin && <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>Built-in</span>}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text3)' }}>
                      {c.record_count.toLocaleString()} records
                    </p>
                  </div>
                  {isActive ? (
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>Active</span>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => setConfirm({ group: g, candidate: c })}
                      disabled={switching === g.group}
                    >
                      {switching === g.group ? 'Switching…' : 'Use this provider'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 420 }}>
            <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, margin: '0 0 6px' }}>
              Switch {confirm.group.label} provider?
            </p>
            <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.55, margin: '0 0 18px' }}>
              Hooks, plugins, and cross-module features will read {confirm.group.label} data from{' '}
              <b>{confirm.candidate.name}</b>. Data from {confirm.group.active_provider.name} stays
              stored and comes back if you switch again.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => void selectProvider(confirm.group, confirm.candidate)}>
                Switch to {confirm.candidate.name}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
