import { registerDashboardWidget } from './dashboard-registry';
import { ContactsWidget } from '@/modules/crm/contacts/components/ContactsWidget';
import { PipelineWidget } from '@/modules/crm/pipeline/components/PipelineWidget';
import { ServersWidget } from '@/modules/servers/components/ServersWidget';
import { ProjectsWidget } from '@/modules/projects/components/ProjectsWidget';
import { ActivityWidget } from '@/modules/activity/components/ActivityWidget';
// AlertsWidget self-registers in its own file (imported via register-all-widgets.ts → alerts module)
import '@/modules/alerts/components/AlertsWidget';

registerDashboardWidget({
  id: 'core:contacts',
  module: 'contacts',
  label: 'Contacts',
  description: 'Recent contacts with status filters and quick navigation',
  icon: 'users',
  category: 'sales',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  supportedFilters: ['limit'],
  defaultConfig: { limit: 10 },
  component: ContactsWidget,
});

registerDashboardWidget({
  id: 'core:pipeline',
  module: 'pipeline',
  label: 'Pipeline Overview',
  description: 'Your active pipeline stages at a glance',
  icon: 'pipeline',
  category: 'sales',
  sizeOptions: ['medium', 'large', 'wide'],
  defaultSize: 'wide',
  defaultW: 6,
  defaultH: 3,
  minW: 4,
  minH: 3,
  supportedFilters: [],
  defaultConfig: {},
  component: PipelineWidget,
});

registerDashboardWidget({
  id: 'core:servers',
  module: 'servers',
  label: 'Server Health',
  description: 'Online/degraded/offline counts with per-server CPU and RAM',
  icon: 'server',
  category: 'infra',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: ['refreshInterval'],
  defaultConfig: { refreshInterval: 60_000 },
  component: ServersWidget,
});

registerDashboardWidget({
  id: 'core:projects',
  module: 'projects',
  label: 'Projects Overview',
  description: 'Active projects, at-risk count, overdue tasks, and upcoming milestones',
  icon: 'projects',
  category: 'projects',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: [],
  defaultConfig: {},
  permission: 'projects:view',
  component: ProjectsWidget,
});

registerDashboardWidget({
  id: 'core:activity',
  module: 'activity',
  label: 'Workspace Activity',
  description: 'Latest workspace activity across all records',
  icon: 'activity',
  category: 'insights',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  supportedFilters: ['limit', 'refreshInterval'],
  defaultConfig: { limit: 10, refreshInterval: 120_000 },
  component: ActivityWidget,
});
