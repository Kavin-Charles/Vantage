'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GlassCard, FluidSelect, FluidInput, FluidButton, FluidChip, PageHeader, MSIcon } from '@/modules/shared/fluid/ui';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listPipelines } from '@/modules/crm/pipeline/lib/pipelines';

const STORAGE_KEY = 'crm-preferences';

interface CrmPreferences {
  defaultPipelineId: string;
  defaultPageSize: number;
  showCompanyColumn: boolean;
  showOwnerColumn: boolean;
}

const DEFAULT_PREFS: CrmPreferences = {
  defaultPipelineId: '',
  defaultPageSize: 25,
  showCompanyColumn: true,
  showOwnerColumn: true,
};

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontFamily: 'var(--fl-font-body)',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--fl-on-surface-variant)',
};

/**
 * Persistence stub: there is no generic workspace/user preferences endpoint
 * in this codebase yet. The only existing preferences route,
 * /api/settings/notifications, is a dedicated schema for notification
 * channel/severity toggles and doesn't fit arbitrary CRM defaults. Until a
 * proper settings endpoint exists, these preferences are held in
 * localStorage (namespaced under `crm-preferences`) as a minimal functional
 * stub. Swap `loadPrefs`/`savePrefs` for real API calls once one lands.
 */
function loadPrefs(): CrmPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<CrmPreferences>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: CrmPreferences): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/**
 * Minimal CRM preferences panel registered into the Foundation settings
 * registry (workspace scope, admin-gated). Takes no props — the Settings
 * module (a later plan) mounts registered entries by looking them up via
 * getSettingsEntries('workspace') and rendering `component` directly.
 */
export function CrmPreferencesPanel() {
  const getToken = useApiToken();
  // Lazy initializers (not an effect) so the persisted value is read once on
  // mount without triggering a second, cascading render.
  const [prefs, setPrefs] = useState<CrmPreferences>(() => loadPrefs());
  const [pageSizeInput, setPageSizeInput] = useState(() => String(loadPrefs().defaultPageSize));
  const [saved, setSaved] = useState(false);

  const { data: pipelines } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });

  const pipelineOptions = [
    { label: 'Workspace default', value: '' },
    ...(pipelines ?? []).map(p => ({ label: p.name, value: p.id })),
  ];

  function handleSave() {
    const parsedSize = Number.parseInt(pageSizeInput, 10);
    const next: CrmPreferences = {
      ...prefs,
      defaultPageSize: Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : DEFAULT_PREFS.defaultPageSize,
    };
    setPrefs(next);
    savePrefs(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <GlassCard>
      <PageHeader title="CRM Preferences" subtitle="Defaults applied across pipelines, contacts, and tasks." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 420 }}>
        <div>
          <label style={LABEL_STYLE}>Default pipeline</label>
          <FluidSelect
            value={prefs.defaultPipelineId}
            onChange={v => setPrefs(p => ({ ...p, defaultPipelineId: v }))}
            options={pipelineOptions}
          />
        </div>

        <div>
          <label style={LABEL_STYLE}>Default page size</label>
          <FluidInput
            type="number"
            value={pageSizeInput}
            onChange={setPageSizeInput}
            icon="format_list_numbered"
            placeholder="25"
          />
        </div>

        <div>
          <label style={LABEL_STYLE}>Visible columns</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <FluidChip
              active={prefs.showCompanyColumn}
              onClick={() => setPrefs(p => ({ ...p, showCompanyColumn: !p.showCompanyColumn }))}
            >
              Company
            </FluidChip>
            <FluidChip
              active={prefs.showOwnerColumn}
              onClick={() => setPrefs(p => ({ ...p, showOwnerColumn: !p.showOwnerColumn }))}
            >
              Owner
            </FluidChip>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FluidButton onClick={handleSave} icon="save">Save preferences</FluidButton>
          {saved ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--fl-font-body)', fontSize: 13, color: 'var(--fl-primary)' }}>
              <MSIcon name="check_circle" size={16} /> Saved
            </span>
          ) : null}
        </div>
      </div>
    </GlassCard>
  );
}
