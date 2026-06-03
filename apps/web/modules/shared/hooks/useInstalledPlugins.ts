'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  surfaces?: {
    nav?: { label: string; path: string; icon?: string; group?: string }[];
    pages?: { path: string; title: string }[];
    widgets?: { id: string; label: string }[];
    panels?: { record_type: string; id: string; label: string }[];
  };
  build?: {
    server?: string;
    client?: string;
  };
}

export interface InstalledPlugin {
  id: string;
  plugin_id: string;
  name: string;
  version: string;
  enabled: boolean;
  installed_at: string;
  manifest: PluginManifest;
}

export function useInstalledPlugins() {
  const getToken = useApiToken();
  return useQuery({
    queryKey: ['plugins'],
    queryFn: async () => {
      const res = await apiFetch<{ data: InstalledPlugin[]; error: null }>(
        '/api/plugins',
        { token: await getToken() },
      );
      return res.data ?? [];
    },
    staleTime: 60_000,
  });
}
