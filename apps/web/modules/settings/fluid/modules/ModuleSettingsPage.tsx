'use client';

import { useState } from 'react';
import { useInstalledPlugins } from '@/modules/shared/hooks/useInstalledPlugins';
import { PageHeader, PillTabs } from '@/modules/shared/fluid/ui';
import { GeneralTab } from './GeneralTab';
import { HooksTab } from './HooksTab';

type TabId = 'general' | 'hooks';

interface Props {
  moduleId: string;
  /**
   * Best-effort display name resolved synchronously by the route's server
   * component (from the static FIRST_PARTY_MODULES list, or moduleId itself
   * for plugins). Overridden below once useInstalledPlugins resolves, so
   * plugin pages briefly show the raw id/slug before flashing to the real name.
   */
  initialName: string;
}

/**
 * Uniform module/plugin settings page: PageHeader + PillTabs [General, Hooks]
 * switching between GeneralTab and HooksTab for a given moduleId. Mounted by
 * apps/web/app/(fluid)/settings/modules/[moduleId]/page.tsx.
 */
export function ModuleSettingsPage({ moduleId, initialName }: Props) {
  const [tab, setTab] = useState<TabId>('general');
  const { data: plugins } = useInstalledPlugins();
  const plugin = plugins?.find(p => p.id === moduleId);
  const name = plugin?.name ?? initialName;

  return (
    <>
      <PageHeader title={name} />
      <div style={{ marginBottom: 24 }}>
        <PillTabs
          tabs={[
            { id: 'general', label: 'General' },
            { id: 'hooks', label: 'Hooks' },
          ]}
          active={tab}
          onChange={id => setTab(id as TabId)}
        />
      </div>
      {tab === 'general' ? <GeneralTab moduleId={moduleId} /> : <HooksTab moduleId={moduleId} />}
    </>
  );
}
