'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

type HookState = 'provider_required' | 'available' | 'enabled' | 'disabled' | 'unavailable';

interface CompatibleProvider {
  id: string;
  name: string;
  installed: boolean;
}

interface InstalledProvider {
  id: string;
  provider_id: string;
  name: string;
}

interface HookFeatureResponse {
  id: string;
  name: string;
  description: string;
  compatible_providers: CompatibleProvider[];
  installed_providers: InstalledProvider[];
  state: HookState;
  selected_provider_id: string | null;
  selected_provider_name: string | null;
  enabled: boolean;
}

const STATE_CONFIG: Record<HookState, { label: string; color: string; bg: string }> = {
  enabled:           { label: 'Enabled',           color: 'var(--green)',  bg: 'var(--green-bg)' },
  available:         { label: 'Available',          color: 'var(--blue)',   bg: 'var(--blue-bg)' },
  disabled:          { label: 'Disabled',           color: 'var(--text3)',  bg: 'var(--surface2)' },
  provider_required: { label: 'Provider Required',  color: 'var(--amber)',  bg: 'var(--amber-bg)' },
  unavailable:       { label: 'Unavailable',        color: 'var(--red)',    bg: 'var(--red-bg)' },
};

function StateBadge({ state }: { state: HookState }) {
  const cfg = STATE_CONFIG[state];
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
      color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

function FeatureCard({ feature, moduleId }: { feature: HookFeatureResponse; moduleId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  const uninstalled = feature.compatible_providers.filter(p => !p.installed);
  const canToggle = feature.state !== 'provider_required' && feature.state !== 'unavailable';

  const patchMut = useMutation({
    mutationFn: async (payload: { enabled: boolean; provider_id?: string }) => {
      const token = await getToken();
      return apiFetch(`/api/settings/hooks/${moduleId}/${feature.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
        token,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hooks', moduleId] }),
  });

  function handleToggle() {
    if (!canToggle) return;
    const nextEnabled = !feature.enabled;
    const providerId = feature.selected_provider_id ?? feature.installed_providers[0]?.id ?? undefined;
    patchMut.mutate({ enabled: nextEnabled, provider_id: providerId });
  }

  function handleProviderChange(e: React.ChangeEvent<HTMLSelectElement>) {
    patchMut.mutate({ enabled: feature.enabled, provider_id: e.target.value || undefined });
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{feature.name}</span>
            <StateBadge state={feature.state} />
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
            {feature.description}
          </p>
        </div>

        {/* Toggle */}
        <button
          disabled={!canToggle || patchMut.isPending}
          onClick={handleToggle}
          style={{
            position: 'relative', width: 44, height: 24, borderRadius: 999, flexShrink: 0,
            background: feature.enabled ? 'var(--green)' : 'var(--border)',
            border: 'none', cursor: canToggle ? 'pointer' : 'not-allowed',
            transition: 'background .2s', opacity: (!canToggle || patchMut.isPending) ? 0.5 : 1,
          }}
          aria-label={`${feature.enabled ? 'Disable' : 'Enable'} ${feature.name}`}
        >
          <span style={{
            position: 'absolute', top: 3, left: feature.enabled ? 23 : 3,
            width: 18, height: 18, borderRadius: '50%', background: '#fff',
            transition: 'left .2s',
          }} />
        </button>
      </div>

      {/* Provider selector */}
      {feature.installed_providers.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }}>Provider</span>
          <select
            value={feature.selected_provider_id ?? ''}
            onChange={handleProviderChange}
            disabled={patchMut.isPending}
            style={{
              fontSize: 12, padding: '5px 10px', border: '1px solid var(--border)',
              borderRadius: 7, background: 'var(--surface)', color: 'var(--text)',
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            {!feature.selected_provider_id && <option value="">— select —</option>}
            {feature.installed_providers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Uninstalled providers */}
      {uninstalled.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowAll(v => !v)}
            style={{
              fontSize: 11, color: 'var(--text3)', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            {showAll ? '▾' : '▸'} Also works with: {uninstalled.map(p => p.name).join(', ')}
          </button>
          {showAll && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {uninstalled.map(p => (
                <Link
                  key={p.id}
                  href="/settings/plugins"
                  style={{
                    fontSize: 11, color: 'var(--blue)', background: 'var(--blue-bg)',
                    borderRadius: 5, padding: '2px 8px', textDecoration: 'none',
                  }}
                >
                  {p.name} →
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Provider required hint */}
      {feature.state === 'provider_required' && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--amber)' }}>
          Install one of the compatible providers above to enable this feature.
        </div>
      )}

      {/* Unavailable hint */}
      {feature.state === 'unavailable' && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--red)' }}>
          The previously selected provider was removed. Select a new one to re-enable.
        </div>
      )}
    </div>
  );
}

interface Props {
  moduleId: string;
  moduleName: string;
}

export default function HooksPage({ moduleId, moduleName }: Props) {
  const getToken = useApiToken();

  const { data, isLoading } = useQuery({
    queryKey: ['hooks', moduleId],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: HookFeatureResponse[] }>(`/api/settings/hooks/${moduleId}`, { token });
    },
  });

  const features = data?.data ?? [];

  return (
    <div style={{ maxWidth: 680 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, marginTop: 0, color: 'var(--text)' }}>
        {moduleName} — Hooks
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24, marginTop: 0 }}>
        Optional features that activate when a compatible provider is installed. Disabling a hook never affects core module functionality.
      </p>

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : features.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>No hook features for this module.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {features.map(f => (
            <FeatureCard key={f.id} feature={f} moduleId={moduleId} />
          ))}
        </div>
      )}
    </div>
  );
}
