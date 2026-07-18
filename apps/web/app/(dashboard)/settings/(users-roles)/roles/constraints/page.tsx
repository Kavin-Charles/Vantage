'use client';

import { ConstraintSetEditor } from '@/modules/settings/components/ConstraintSetEditor';

export default function ConstraintsPage() {
  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 28 }}>
      <section>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
          Static separation of duty
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text2)' }}>
          A user cannot be assigned too many conflicting roles at once.
        </p>
        <ConstraintSetEditor kind="ssd" />
      </section>
      <section>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
          Dynamic separation of duty
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text2)' }}>
          A user may hold these roles but cannot activate them together in one session.
        </p>
        <ConstraintSetEditor kind="dsd" />
      </section>
    </div>
  );
}
