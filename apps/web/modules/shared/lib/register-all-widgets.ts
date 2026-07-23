// Core (7 existing widgets, upgraded in Task 10)
import '@/modules/shared/lib/register-module-widgets';

// CRM — Settings entry (Task 15)
import '@/modules/crm/fluid/settings/register';

// CRM — Contacts (Task 11)
import '@/modules/crm/contacts/components/widgets/RecentContactsWidget';
import '@/modules/crm/contacts/components/widgets/NewLeadsTodayWidget';
import '@/modules/crm/contacts/components/widgets/ContactStatusWidget';
import '@/modules/crm/contacts/components/widgets/FollowupsDueWidget';
import '@/modules/crm/contacts/components/widgets/TopCustomersWidget';
import '@/modules/crm/contacts/components/widgets/ContactGrowthWidget';

// CRM — Pipeline (Task 12)
import '@/modules/crm/pipeline/components/widgets/DealsByStageWidget';
import '@/modules/crm/pipeline/components/widgets/PipelineValueWidget';
import '@/modules/crm/pipeline/components/widgets/ClosingThisWeekWidget';
import '@/modules/crm/pipeline/components/widgets/WinRateWidget';
import '@/modules/crm/pipeline/components/widgets/RecentOpportunitiesWidget';

// CRM — Companies (Task 13)
import '@/modules/crm/companies/components/widgets/RecentCompaniesWidget';
import '@/modules/crm/companies/components/widgets/CompaniesByIndustryWidget';
import '@/modules/crm/companies/components/widgets/LargestCustomersWidget';
import '@/modules/crm/companies/components/widgets/CompanyGrowthWidget';

// Tasks (Task 14)
import '@/modules/crm/tasks/components/widgets/DueTodayWidget';
import '@/modules/crm/tasks/components/widgets/OverdueTasksWidget';
import '@/modules/crm/tasks/components/widgets/UpcomingDeadlinesWidget';
import '@/modules/crm/tasks/components/widgets/CompletedThisWeekWidget';
import '@/modules/crm/tasks/components/widgets/TeamTaskProgressWidget';
import '@/modules/crm/tasks/components/widgets/TaskPriorityWidget';

// Projects (Task 15)
import '@/modules/projects/components/widgets/ActiveProjectsWidget';
import '@/modules/projects/components/widgets/DelayedProjectsWidget';
import '@/modules/projects/components/widgets/MilestonesDueWidget';
import '@/modules/projects/components/widgets/TeamWorkloadWidget';
import '@/modules/projects/components/widgets/ProjectActivityWidget';

// Infra — Servers (Task 16)
import '@/modules/servers/components/widgets/CpuUsageWidget';
import '@/modules/servers/components/widgets/RamUsageWidget';
import '@/modules/servers/components/widgets/StorageUsageWidget';
import '@/modules/servers/components/widgets/OfflineServersWidget';
import '@/modules/servers/components/widgets/ServerAlertsWidget';
import '@/modules/servers/components/widgets/TopConsumersWidget';

// Infra — Databases (Task 17)
import '@/modules/databases/components/widgets/DatabaseHealthWidget';
import '@/modules/databases/components/widgets/DbStorageWidget';
import '@/modules/databases/components/widgets/DbConnectionsWidget';
import '@/modules/databases/components/widgets/ReplicationLagWidget';

// Infra — Websites (Task 18)
import '@/modules/shared/components/widgets/WebsiteStatusWidget';
import '@/modules/shared/components/widgets/WebsiteUptimeWidget';
import '@/modules/shared/components/widgets/SslExpiryWidget';
import '@/modules/shared/components/widgets/ResponseTimeWidget';

// Analytics (Task 19)
import '@/modules/analytics/components/widgets/RevenueTrendWidget';
import '@/modules/analytics/components/widgets/PipelineByStageWidget';
import '@/modules/analytics/components/widgets/KpiCardsWidget';
import '@/modules/analytics/components/widgets/TeamLeaderboardWidget';

// Alerts + Activity (Task 20)
import '@/modules/alerts/components/widgets/CriticalAlertsWidget';
import '@/modules/alerts/components/widgets/WarningAlertsWidget';
import '@/modules/alerts/components/widgets/RecentlyResolvedWidget';
import '@/modules/activity/components/widgets/WorkspaceActivityWidget';
import '@/modules/activity/components/widgets/TeamActivityWidget';
import '@/modules/activity/components/widgets/RecentChangesWidget';
