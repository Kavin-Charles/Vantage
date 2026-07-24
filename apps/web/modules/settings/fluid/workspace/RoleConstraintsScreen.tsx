'use client';

import Link from 'next/link';
import { ConstraintSetEditor } from '@/modules/settings/components/ConstraintSetEditor';
import { PageHeader, GlassCard, MSIcon } from '@/modules/shared/fluid/ui';

/**
 * Fluid roles-constraints screen — mounted by
 * apps/web/app/(fluid)/settings/roles/constraints/page.tsx, replacing the
 * legacy apps/web/app/(dashboard)/settings/(users-roles)/roles/constraints/
 * page.tsx. Reuses ConstraintSetEditor (restyled to `--fl-*` in place, since
 * it had no other importers) for both static (SSD) and dynamic (DSD)
 * separation-of-duty sets:
 *   - GET/POST/DELETE /api/rbac/ssd-sets
 *   - GET/POST/DELETE /api/rbac/dsd-sets
 */
export function RoleConstraintsScreen() {
  return (
    <>
      <Link
        href="/settings/roles"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16,
          fontFamily: 'var(--fl-font-body)', fontSize: 13, fontWeight: 600,
          color: 'var(--fl-on-surface-variant)', textDecoration: 'none',
        }}
      >
        <MSIcon name="arrow_back" size={16} /> Roles
      </Link>

      <PageHeader
        title="Constraints"
        subtitle="Separation-of-duty rules that limit which roles can be combined."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <GlassCard>
          <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--fl-font-display)', fontSize: 18, color: 'var(--fl-on-surface)' }}>
            Static separation of duty
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>
            A user cannot be assigned too many conflicting roles at once.
          </p>
          <ConstraintSetEditor kind="ssd" />
        </GlassCard>

        <GlassCard>
          <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--fl-font-display)', fontSize: 18, color: 'var(--fl-on-surface)' }}>
            Dynamic separation of duty
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>
            A user may hold these roles but cannot activate them together in one session.
          </p>
          <ConstraintSetEditor kind="dsd" />
        </GlassCard>
      </div>
    </>
  );
}
