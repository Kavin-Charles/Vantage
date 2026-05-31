'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ModuleGuard } from '@/components/ModuleGuard';
import { Topbar } from '@/components/Topbar';
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { CsvImportExport } from '@/components/CsvImportExport';

export default function ContactsPage() {
  const qc = useQueryClient();

  return (
    <ModuleGuard moduleId="contacts">
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
