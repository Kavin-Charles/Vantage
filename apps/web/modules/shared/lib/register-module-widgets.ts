import { registerDashboardWidget } from './dashboard-registry';
import { ContactsWidget } from '@/modules/crm/contacts/components/ContactsWidget';
import { PipelineWidget } from '@/modules/crm/pipeline/components/PipelineWidget';
import { ServersWidget } from '@/modules/infra/servers/components/ServersWidget';
import { ProjectsWidget } from '@/modules/projects/components/ProjectsWidget';
import { AlertsWidget } from '@/modules/infra/alerts/components/AlertsWidget';
import { ActivityWidget } from '@/modules/activity/components/ActivityWidget';

registerDashboardWidget({
  id: 'core:contacts',
  label: 'Contacts',
  description: 'Recent contacts, status filters, and quick actions',
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  component: ContactsWidget,
});

registerDashboardWidget({
  id: 'core:pipeline',
  label: 'Pipeline',
  description: 'Recent records across your pipeline',
  defaultW: 6,
  defaultH: 3,
  minW: 4,
  minH: 3,
  component: PipelineWidget,
});

registerDashboardWidget({
  id: 'core:servers',
  label: 'Servers',
  description: 'Server status and resource usage',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  component: ServersWidget,
});

registerDashboardWidget({
  id: 'core:projects',
  label: 'Projects',
  description: 'Active project health and upcoming milestones',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  permission: 'projects:view',
  component: ProjectsWidget,
});

registerDashboardWidget({
  id: 'core:alerts',
  label: 'Alerts',
  description: 'Unresolved critical and warning alerts with quick acknowledge',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  component: AlertsWidget,
});

registerDashboardWidget({
  id: 'core:activity',
  label: 'Activity',
  description: 'Latest workspace activity across all records',
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  component: ActivityWidget,
});
