'use client';

import { ContactFormModal } from './ContactFormModal';

export function AddContactModal({
  open, onClose, onCreated, companyId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  companyId?: string;
}) {
  return (
    <ContactFormModal
      open={open}
      mode="create"
      companyId={companyId}
      onClose={onClose}
      onSaved={onCreated}
    />
  );
}
