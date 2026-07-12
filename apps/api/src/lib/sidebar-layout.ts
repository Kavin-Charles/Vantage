export interface SidebarGroupDto {
  id: string | null;
  label: string;
  is_default: boolean;
  item_keys: string[];
}

export const BUILTIN_ITEM_KEYS: readonly string[] = [
  '/pipeline', '/contacts', '/companies', '/tasks', '/activity',
  '/servers', '/databases', '/websites',
  '/messaging', '/projects',
  '/analytics', '/alerts',
  '/dashboard',
];

const SEED: ReadonlyArray<Readonly<{ label: string; is_default: boolean; item_keys: readonly string[] }>> = [
  { label: 'Sales',    is_default: false, item_keys: ['/pipeline', '/contacts', '/companies', '/tasks', '/activity'] },
  { label: 'Infra',    is_default: false, item_keys: ['/servers', '/databases', '/websites'] },
  { label: 'Projects', is_default: false, item_keys: ['/messaging', '/projects'] },
  { label: 'Insights', is_default: false, item_keys: ['/analytics', '/alerts'] },
  { label: 'General',  is_default: true,  item_keys: ['/dashboard'] },
];

export function seedGroups(): SidebarGroupDto[] {
  return SEED.map(g => ({ id: null, label: g.label, is_default: g.is_default, item_keys: [...g.item_keys] }));
}

export function mergeLayout(groups: SidebarGroupDto[], knownKeys: string[]): SidebarGroupDto[] {
  const seen = new Set<string>();
  const out = groups.map(g => ({
    ...g,
    item_keys: g.item_keys.filter(k => {
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
  }));

  // exactly one default: keep the first marked, else mark the last group
  let defaultIdx = out.findIndex(g => g.is_default);
  if (defaultIdx === -1) defaultIdx = out.length - 1;
  out.forEach((g, i) => { g.is_default = i === defaultIdx; });

  const missing = knownKeys.filter(k => !seen.has(k));
  if (missing.length > 0 && out[defaultIdx]) {
    out[defaultIdx].item_keys = [...out[defaultIdx].item_keys, ...missing];
  }
  return out;
}

export function validateLayout(
  groups: { label: string; item_keys: string[]; is_default: boolean }[],
): string | null {
  if (groups.length === 0) return 'Layout must contain at least one group';
  if (groups.filter(g => g.is_default).length !== 1) return 'Layout must contain exactly one default group';

  const labels = new Set<string>();
  for (const g of groups) {
    const label = g.label.trim().toLowerCase();
    if (!label) return 'Group labels must be non-empty';
    if (labels.has(label)) return `Duplicate group label: ${g.label}`;
    labels.add(label);
  }

  const keys = new Set<string>();
  for (const g of groups) {
    for (const k of g.item_keys) {
      if (keys.has(k)) return `Duplicate item key across groups: ${k}`;
      keys.add(k);
    }
  }
  return null;
}
