'use client';

import { useState } from 'react';
import { ApiKeyTable } from '@/modules/settings/components/ApiKeyTable';
import { CreateApiKeyModal } from '@/modules/settings/components/CreateApiKeyModal';

export default function ApiKeysPage() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div style={{ maxWidth: 800 }}>
      <ApiKeyTable onCreateClick={() => setShowModal(true)} />
      {showModal && <CreateApiKeyModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
