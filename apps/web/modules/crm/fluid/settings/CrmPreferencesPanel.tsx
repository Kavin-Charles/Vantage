'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GlassCard, FluidSelect, FluidInput, FluidButton, FluidChip, PageHeader, MSIcon } from '@/modules/shared/fluid/ui';
import { apiFetch } from '@/modules/shared/lib/api';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listPipelines } from '@/modules/crm/pipeline/lib/pipelines';

const SETTINGS_QUERY_KEY = ['crm-preferences'];
const SETTINGS_PATH = '/api/settings/crm';

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

interface CrmPreferencesResponse {
  data: CrmPreferences;
  error: null;
}

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontFamily: 'var(--fl-font-body)',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--fl-on-surface-variant)',
};

/**
 * Minimal CRM preferences panel registered into the Foundation settings
 * registry (workspace scope, admin-gated). Takes no props — the Settings
 * module (a later plan) mounts registered entries by looking them up via
 * getSettingsEntries('workspace') and rendering `component` directly.
 */
export function CrmPreferencesPanel() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<CrmPreferences>(DEFAULT_PREFS);
  const [pageSizeInput, setPageSizeInput] = useState(() => String(DEFAULT_PREFS.defaultPageSize));
  const [saved, setSaved] = useState(false);

  const { data: storedPrefs } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiFetch<CrmPreferencesResponse>(SETTINGS_PATH, {
        token: await getToken(),
      });
      return res.data;
    },
  });

  // Sync local editable state once the server value loads, without
  // clobbering in-flight edits on background refetches.
  useEffect(() => {
    if (!storedPrefs) return;
    setPrefs(storedPrefs);
    setPageSizeInput(String(storedPrefs.defaultPageSize));
  }, [storedPrefs]);

  const { data: pipelines } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });

  const pipelineOptions = [
    { label: 'Workspace default', value: '' },
    ...(pipelines ?? []).map(p => ({ label: p.name, value: p.id })),
  ];

  const saveMutation = useMutation({
    mutationFn: async (next: CrmPreferences) => {
      const res = await apiFetch<CrmPreferencesResponse>(SETTINGS_PATH, {
        method: 'PUT',
        body: JSON.stringify(next),
        token: await getToken(),
      });
      return res.data;
    },
    onSuccess: next => {
      setPrefs(next);
      void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  function handleSave() {
    const parsedSize = Number.parseInt(pageSizeInput, 10);
    const next: CrmPreferences = {
      ...prefs,
      defaultPageSize: Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : DEFAULT_PREFS.defaultPageSize,
    };
    saveMutation.mutate(next);
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
          <FluidButton onClick={handleSave} icon="save" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save preferences'}
          </FluidButton>
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
