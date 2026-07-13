'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/modules/shared/lib/api';
import { useApiToken } from '@/modules/shared/lib/useApiToken';

export interface SidebarGroup {
  id: string | null;
  label: string;
  is_default: boolean;
  item_keys: string[];
}

export interface SidebarPrefs {
  pinned_keys: string[];
  collapsed_group_keys: string[];
}

// Mirrors apps/api/src/lib/sidebar-layout.ts seedGroups() — fallback when the API is unreachable.
export const FALLBACK_GROUPS: SidebarGroup[] = [
  { id: null, label: 'Sales',    is_default: false, item_keys: ['/crm/pipeline', '/crm/contacts', '/crm/companies', '/crm/tasks', '/activity'] },
  { id: null, label: 'Infra',    is_default: false, item_keys: ['/servers', '/databases', '/websites'] },
  { id: null, label: 'Projects', is_default: false, item_keys: ['/messaging', '/projects'] },
  { id: null, label: 'Insights', is_default: false, item_keys: ['/analytics', '/alerts'] },
  { id: null, label: 'General',  is_default: true,  item_keys: ['/dashboard'] },
];

const EMPTY_PREFS: SidebarPrefs = { pinned_keys: [], collapsed_group_keys: [] };

export function collapseKey(g: SidebarGroup): string {
  return g.id ?? `seed:${g.label}`;
}

export function useSidebarLayoutQuery(): { groups: SidebarGroup[]; isFallback: boolean } {
  const getToken = useApiToken();
  const { data, isError } = useQuery({
    queryKey: ['sidebar-layout'],
    queryFn: async () => {
      const res = await apiFetch<{ data: { groups: SidebarGroup[] }; error: null }>(
        '/api/sidebar/layout',
        { token: await getToken() },
      );
      return res.data.groups;
    },
    staleTime: 5 * 60_000,
  });
  return { groups: data ?? FALLBACK_GROUPS, isFallback: isError || data == null };
}

export function useSaveSidebarLayout() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (groups: SidebarGroup[]) => {
      const res = await apiFetch<{ data: { groups: SidebarGroup[] }; error: null }>(
        '/api/sidebar/layout',
        {
          token: await getToken(),
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groups: groups.map((g) => ({
              ...(g.id ? { id: g.id } : {}),
              label: g.label,
              item_keys: g.item_keys,
              is_default: g.is_default,
            })),
          }),
        },
      );
      return res.data.groups;
    },
    onMutate: async (groups) => {
      await queryClient.cancelQueries({ queryKey: ['sidebar-layout'] });
      const previous = queryClient.getQueryData<SidebarGroup[]>(['sidebar-layout']);
      queryClient.setQueryData(['sidebar-layout'], groups);
      return { previous };
    },
    onError: (_err, _groups, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['sidebar-layout'], ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['sidebar-layout'] });
    },
  });
}

export function useSidebarPrefsQuery(): SidebarPrefs {
  const getToken = useApiToken();
  const { data } = useQuery({
    queryKey: ['sidebar-prefs'],
    queryFn: async () => {
      const res = await apiFetch<{ data: SidebarPrefs; error: null }>(
        '/api/sidebar/prefs',
        { token: await getToken() },
      );
      return res.data;
    },
    staleTime: 60_000,
  });
  return data ?? EMPTY_PREFS;
}

export function useSaveSidebarPrefs(): { save: (prefs: SidebarPrefs) => void } {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (prefs: SidebarPrefs) => {
      await apiFetch('/api/sidebar/prefs', {
        token: await getToken(),
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
    },
  });
  return {
    save: (prefs: SidebarPrefs) => {
      queryClient.setQueryData(['sidebar-prefs'], prefs); // optimistic; failure reverts on next refetch
      mutation.mutate(prefs);
    },
  };
}

// ── Pure layout ops (admin context-menu actions) ─────────────────────────────

export function moveItemToGroup(groups: SidebarGroup[], itemKey: string, targetIdx: number): SidebarGroup[] {
  return groups.map((g, i) => {
    const without = g.item_keys.filter((k) => k !== itemKey);
    if (i === targetIdx) return { ...g, item_keys: [...without, itemKey] };
    return { ...g, item_keys: without };
  });
}

export function moveItemWithinGroup(groups: SidebarGroup[], groupIdx: number, itemKey: string, dir: 1 | -1): SidebarGroup[] {
  return groups.map((g, i) => {
    if (i !== groupIdx) return g;
    const keys = [...g.item_keys];
    const from = keys.indexOf(itemKey);
    const to = from + dir;
    if (from === -1 || to < 0 || to >= keys.length) return g;
    [keys[from], keys[to]] = [keys[to]!, keys[from]!];
    return { ...g, item_keys: keys };
  });
}

export function moveGroup(groups: SidebarGroup[], groupIdx: number, dir: 1 | -1): SidebarGroup[] {
  const to = groupIdx + dir;
  if (to < 0 || to >= groups.length) return groups;
  const out = [...groups];
  [out[groupIdx], out[to]] = [out[to]!, out[groupIdx]!];
  return out;
}

export function renameGroup(groups: SidebarGroup[], groupIdx: number, label: string): SidebarGroup[] {
  return groups.map((g, i) => (i === groupIdx ? { ...g, label } : g));
}

export function addGroupBelow(groups: SidebarGroup[], groupIdx: number): SidebarGroup[] {
  const out = [...groups];
  out.splice(groupIdx + 1, 0, { id: null, label: 'New group', is_default: false, item_keys: [] });
  return out;
}

export function deleteGroup(groups: SidebarGroup[], groupIdx: number): SidebarGroup[] {
  const doomed = groups[groupIdx];
  if (!doomed || doomed.is_default) return groups;
  const defaultIdx = groups.findIndex((g) => g.is_default);
  return groups
    .filter((_, i) => i !== groupIdx)
    .map((g, _i) =>
      g === groups[defaultIdx]
        ? { ...g, item_keys: [...g.item_keys, ...doomed.item_keys] }
        : g,
    );
}
