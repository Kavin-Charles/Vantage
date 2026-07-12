'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { ContactsTable } from '@/modules/crm/contacts/components/ContactsTable';
import { CsvImportExport } from '@/modules/shared/components/CsvImportExport';

export default function ContactsPage() {
  const qc = useQueryClient();

  return (
    <ModuleGuard moduleId="crm">
      <Topbar
        action={
          <CsvImportExport
            resource="contacts"
            filename="contacts.csv"
            templateHeaders={['name', 'email', 'phone', 'status']}
            onImported={() => qc.invalidateQueries({ queryKey: ['contacts'] })}
          />
        }
      />
      <div style={{ padding: 24 }}>
        <ContactsTable />
      </div>
    </ModuleGuard>
  );
}
