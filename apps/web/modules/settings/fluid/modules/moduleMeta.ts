export interface FirstPartyModuleMeta {
  id: string;
  name: string;
  description: string;
}

/**
 * First-party (built-in) modules — mirrors the id/name/description set from
 * the legacy apps/web/app/(dashboard)/settings/modules/page.tsx this Fluid
 * panel replaces. Kept as a static list (no dedicated "list of modules"
 * endpoint exists) and shared between ModulesListPanel, GeneralTab, and the
 * [moduleId] route so the display name is available synchronously.
 */
export const FIRST_PARTY_MODULES: FirstPartyModuleMeta[] = [
  { id: 'dashboard', name: 'Dashboard', description: 'Custom dashboards and widget layouts.' },
  { id: 'crm', name: 'CRM', description: 'Contacts, companies, deals pipeline, and tasks.' },
  { id: 'infra', name: 'Infrastructure', description: 'Servers, databases, website uptime, and alerting.' },
  { id: 'analytics', name: 'Analytics', description: 'Revenue, pipeline stats, and team leaderboard.' },
  { id: 'activity', name: 'Activity', description: 'Unified activity feed across all workspace records.' },
  { id: 'projects', name: 'Project Management', description: 'Projects, tasks, sprints, automations, and client portals.' },
  { id: 'messaging', name: 'Messaging', description: 'Real-time team messaging, channels, and direct messages.' },
];
