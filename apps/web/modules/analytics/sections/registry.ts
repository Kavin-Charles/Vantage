import type { ComponentType } from 'react';
import type { AnalyticsSectionProps } from '../lib/analytics';
import { CrmOverviewTile } from './CrmOverviewTile';
import { CrmAnalyticsSection } from './CrmAnalyticsSection';
import { InfraOverviewTile } from './InfraOverviewTile';
import { InfraAnalyticsSection } from './InfraAnalyticsSection';
import { PmOverviewTile } from './PmOverviewTile';
import { PmAnalyticsSection } from './PmAnalyticsSection';

/** Builtin analytics sections — keys match BUILTIN_ANALYTICS_SECTIONS ids. */
export const ANALYTICS_SECTION_COMPONENTS: Record<string, ComponentType<AnalyticsSectionProps>> = {
  'crm-overview': CrmOverviewTile,
  'infra-overview': InfraOverviewTile,
  'pm-overview': PmOverviewTile,
  'crm-panel': CrmAnalyticsSection,
  'infra-panel': InfraAnalyticsSection,
  'pm-panel': PmAnalyticsSection,
};
