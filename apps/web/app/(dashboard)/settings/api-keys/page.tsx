'use client';

import { useState } from 'react';
import { ApiKeyTable } from '@/components/settings/ApiKeyTable';
import { CreateApiKeyModal } from '@/components/settings/CreateApiKeyModal';

export default function ApiKeysPage() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div style={{ maxWidth: 800 }}>
      <ApiKeyTable onCreateClick={() => setShowModal(true)} />
      {showModal && <CreateApiKeyModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
