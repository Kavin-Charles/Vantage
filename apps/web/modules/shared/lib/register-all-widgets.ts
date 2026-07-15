// Side-effect import — delegates to the existing widget registrations.
// This barrel will be expanded as new self-registering widgets are added in Tasks 10-21.
import '@/modules/shared/lib/register-module-widgets';
import '@/modules/crm/contacts/components/widgets/RecentContactsWidget';
import '@/modules/crm/contacts/components/widgets/NewLeadsTodayWidget';
import '@/modules/crm/contacts/components/widgets/ContactStatusWidget';
import '@/modules/crm/contacts/components/widgets/FollowupsDueWidget';
import '@/modules/crm/contacts/components/widgets/TopCustomersWidget';
import '@/modules/crm/contacts/components/widgets/ContactGrowthWidget';
import '@/modules/crm/pipeline/components/widgets/DealsByStageWidget';
import '@/modules/crm/pipeline/components/widgets/PipelineValueWidget';
import '@/modules/crm/pipeline/components/widgets/ClosingThisWeekWidget';
import '@/modules/crm/pipeline/components/widgets/WinRateWidget';
import '@/modules/crm/pipeline/components/widgets/RecentOpportunitiesWidget';
