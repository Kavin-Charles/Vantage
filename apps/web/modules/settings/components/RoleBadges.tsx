'use client';

import type { RoleSummary } from '@vencore/api-client';
import { FluidBadge } from '@/modules/shared/fluid/ui';

/**
 * Only used by the Fluid roles screens (RolesPanel, RoleDetailScreen) — the
 * legacy (dashboard)/settings/(users-roles)/roles pages it originally served
 * were removed alongside those Fluid screens, so this was restyled to
 * `--fl-*` (via FluidBadge) in place rather than copied.
 */
export function RoleBadges({ role }: { role: Pick<RoleSummary, 'is_system' | 'grants_all' | 'is_default'> }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      {role.grants_all && <FluidBadge tone="blue">Administrator</FluidBadge>}
      {role.is_default && <FluidBadge tone="green">Default</FluidBadge>}
      {role.is_system && <FluidBadge tone="gold">System</FluidBadge>}
    </span>
  );
}
