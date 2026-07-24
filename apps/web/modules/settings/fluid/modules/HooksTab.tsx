'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { HookFeatureCard, type HookFeature, type HookState } from '@/modules/shared/fluid/host/HookFeatureCard';
import { EmptyState } from '@/modules/shared/fluid/ui';

/**
 * Response shape of GET /api/settings/hooks/:moduleId
 * (apps/api/src/routes/hooks.ts). Only the fields HookFeatureCard needs are
 * declared here — the endpoint also returns powered_by/compatible_providers/
 * etc. used by the legacy (non-fluid) HooksPage, which we don't render.
 */
interface HookFeatureResponse {
  id: string;
  name: string;
  description: string;
  state: HookState;
  enabled: boolean;
}

interface Props {
  moduleId: string;
}

/**
 * Dynamic Hooks tab for a module's Fluid settings page. Fetches whatever
 * hook features the backend declares for this moduleId — for 'crm' that
 * includes the 'crm-analytics' feature declared in
 * apps/api/src/lib/crm-hook-features.ts and merged in by
 * apps/api/src/routes/hooks.ts's getHookFeaturesForModule.
 */
export function HooksTab({ moduleId }: Props) {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['hooks', moduleId],
    queryFn: async () =>
      apiFetch<{ data: HookFeatureResponse[] }>(`/api/settings/hooks/${moduleId}`, { token: await getToken() }),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ featureId, enabled }: { featureId: string; enabled: boolean }) => {
      const token = await getToken();
      return apiFetch(`/api/settings/hooks/${moduleId}/${featureId}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
        token,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hooks', moduleId] }),
  });

  if (isLoading) {
    return <EmptyState icon="hourglass_empty" title="Loading…" />;
  }

  if (isError) {
    return <EmptyState icon="error" title="Could not load hooks" message="Please try again." />;
  }

  const features: HookFeature[] = (data?.data ?? []).map(f => ({
    id: f.id,
    name: f.name,
    description: f.description,
    state: f.state,
    enabled: f.enabled,
  }));

  if (features.length === 0) {
    return (
      <EmptyState
        icon="hub"
        title="No hook features"
        message="This module doesn't declare any optional hook features."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {features.map(feature => (
        <HookFeatureCard
          key={feature.id}
          feature={feature}
          moduleId={moduleId}
          onToggle={next => toggleMut.mutate({ featureId: feature.id, enabled: next })}
        />
      ))}
    </div>
  );
}
