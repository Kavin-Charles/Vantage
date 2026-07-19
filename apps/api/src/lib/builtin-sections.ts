/**
 * Builtin module sections — core modules contributing UI sections to page
 * slots alongside plugins. A section declares exactly one gate:
 *   requires_contract — renders when the contract has an active provider
 *                       (true discovery: builtin or plugin provider both count)
 *   requires_module   — renders when the builtin module is enabled for the
 *                       workspace (for modules without hub contracts)
 * Host-only: this never touches the plugin manifest shape.
 */

export interface BuiltinSectionDef {
  module_id: string;
  /** Stable section id — also the client-side render key. */
  id: string;
  /** Target slot as `page:slotId`, e.g. "analytics:panels". */
  slot: string;
  label: string;
  /** Lower renders first. */
  priority: number;
  requires_contract?: string;
  requires_module?: string;
}

export const BUILTIN_ANALYTICS_SECTIONS: BuiltinSectionDef[] = [
  { module_id: 'crm', id: 'crm-overview', slot: 'analytics:overview', label: 'CRM', priority: 10, requires_contract: 'crm.deal@v1' },
  { module_id: 'infra', id: 'infra-overview', slot: 'analytics:overview', label: 'Infrastructure', priority: 20, requires_module: 'infra' },
  { module_id: 'projects', id: 'pm-overview', slot: 'analytics:overview', label: 'Projects', priority: 30, requires_module: 'projects' },
  { module_id: 'crm', id: 'crm-panel', slot: 'analytics:panels', label: 'CRM Analytics', priority: 10, requires_contract: 'crm.deal@v1' },
  { module_id: 'infra', id: 'infra-panel', slot: 'analytics:panels', label: 'Infrastructure Analytics', priority: 20, requires_module: 'infra' },
  { module_id: 'projects', id: 'pm-panel', slot: 'analytics:panels', label: 'Project Analytics', priority: 30, requires_module: 'projects' },
];

export interface BuiltinGateContext {
  enabledModules: ReadonlySet<string>;
  /** Contracts that currently have an active provider in the workspace. */
  activeContracts: ReadonlySet<string>;
}

export interface ResolvedBuiltinSection {
  kind: 'builtin';
  /** Module id, in the plugin_id seat so the shape matches plugin sections. */
  plugin_id: string;
  id: string;
  slot_id: string;
  label: string;
  priority: number;
}

export function resolveBuiltinSections(
  page: string,
  ctx: BuiltinGateContext,
  defs: readonly BuiltinSectionDef[] = BUILTIN_ANALYTICS_SECTIONS,
): ResolvedBuiltinSection[] {
  const out: ResolvedBuiltinSection[] = [];
  for (const d of defs) {
    const [slotPage, slotId] = d.slot.split(':');
    if (slotPage !== page || !slotId) continue;
    if (d.requires_contract && !ctx.activeContracts.has(d.requires_contract)) continue;
    if (d.requires_module && !ctx.enabledModules.has(d.requires_module)) continue;
    out.push({
      kind: 'builtin',
      plugin_id: d.module_id,
      id: d.id,
      slot_id: slotId,
      label: d.label,
      priority: d.priority,
    });
  }
  return out;
}

/** Distinct contracts the registry gates on — the route resolves these once. */
export function requiredContracts(
  defs: readonly BuiltinSectionDef[] = BUILTIN_ANALYTICS_SECTIONS,
): string[] {
  return [...new Set(defs.map(d => d.requires_contract).filter((c): c is string => !!c))];
}
