'use client';

import { DomainSettings } from '@/modules/settings/components/DomainSettings';

export default function CrmSettingsPage() {
  return (
    <div style={{ maxWidth: 680 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>CRM Settings</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Core CRM options plus settings contributed by installed plugins.
      </p>
      <DomainSettings domain="crm" />
    </div>
  );
}
