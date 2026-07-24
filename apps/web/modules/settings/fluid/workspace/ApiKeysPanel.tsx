'use client';

import { useState } from 'react';
import { ApiKeyTable } from '@/modules/settings/components/ApiKeyTable';
import { CreateApiKeyModal } from '@/modules/settings/components/CreateApiKeyModal';

/**
 * Fluid API Keys settings panel — registered into the Foundation settings
 * registry (workspace scope, admin-only). Mounted directly by
 * apps/web/app/(fluid)/settings/api-keys/page.tsx.
 *
 * Reuses the exact backend surface as the legacy
 * apps/web/app/(dashboard)/settings/api-keys/page.tsx it replaces:
 *   - GET    /api/api-keys      → list keys (via ApiKeyTable)
 *   - POST   /api/api-keys      → create key (via CreateApiKeyModal)
 *   - DELETE /api/api-keys/:id  → revoke key (via ApiKeyTable)
 *
 * ApiKeyTable/CreateApiKeyModal had no other importers besides the legacy
 * page, so they were restyled in place to Fluid primitives rather than
 * copied — same reasoning as InviteUserModal in workspace/UsersPanel.tsx.
 */
export function ApiKeysPanel() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <ApiKeyTable onCreateClick={() => setShowModal(true)} />
      {showModal && <CreateApiKeyModal onClose={() => setShowModal(false)} />}
    </>
  );
}
