'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRole, deleteRole } from '@vencore/api-client';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';
import { RoleMatrixEditor } from '@/modules/settings/components/RoleMatrixEditor';
import { RoleMembersPanel } from '@/modules/settings/components/RoleMembersPanel';
import { RoleInheritancePanel } from '@/modules/settings/components/RoleInheritancePanel';
import { RoleBadges } from '@/modules/settings/components/RoleBadges';
import { PageHeader, GlassCard, PillTabs, FluidButton, EmptyState, MSIcon } from '@/modules/shared/fluid/ui';

type Tab = 'permissions' | 'members' | 'inheritance';

/**
 * Fluid role-detail screen — registered as the [id] route under the Fluid
 * "roles" settings entry. Mounted by
 * apps/web/app/(fluid)/settings/roles/[id]/page.tsx.
 *
 * Reuses the exact backend surface and permission/members/inheritance
 * widgets as the legacy apps/web/app/(dashboard)/settings/(users-roles)/
 * roles/[id]/page.tsx it replaces:
 *   - GET    /api/roles/:id           (getRole)
 *   - DELETE /api/roles/:id           (deleteRole)
 * RoleMatrixEditor, RoleMembersPanel, RoleInheritancePanel and RoleBadges had
 * no importers outside the legacy roles pages, so they were restyled to
 * `--fl-*` in place rather than copied.
 */
export function RoleDetailScreen({ id }: { id: string }) {
  const getToken = useApiToken();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('permissions');
  const { ask: askConfirm, el: confirmEl } = useConfirm();

  const { data, isLoading } = useQuery({
    queryKey: ['role', id],
    queryFn: async () => getRole(await getToken(), id),
  });
  const role = data?.data;

  const remove = useMutation({
    mutationFn: async () => deleteRole(await getToken(), id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['roles'] });
      router.push('/settings/roles');
    },
  });

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

      {isLoading ? (
        <EmptyState icon="hourglass_empty" title="Loading…" />
      ) : !role ? (
        <EmptyState icon="admin_panel_settings" title="Role not found" />
      ) : (
        <>
          <PageHeader
            title={role.name}
            subtitle={role.description ?? undefined}
            actions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <RoleBadges role={role} />
                {!role.is_system && (
                  <FluidButton
                    variant="ghost"
                    icon="delete"
                    disabled={remove.isPending}
                    onClick={() => askConfirm({
                      title: 'Delete role',
                      message: `Delete "${role.name}"? This cannot be undone.`,
                      confirmLabel: 'Delete',
                      variant: 'danger',
                      onConfirm: () => remove.mutate(),
                    })}
                  >
                    Delete role
                  </FluidButton>
                )}
              </div>
            }
          />

          {role.max_members != null && (
            <p style={{ margin: '-16px 0 20px', fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>
              Limited to {role.max_members} member{role.max_members === 1 ? '' : 's'}.
            </p>
          )}
          {role.is_system && (
            <p style={{ margin: '-16px 0 20px', fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>
              System role — cannot be renamed or deleted.
            </p>
          )}

          <div style={{ marginBottom: 24 }}>
            <PillTabs
              tabs={[
                { id: 'permissions', label: 'Permissions' },
                { id: 'members', label: 'Members' },
                { id: 'inheritance', label: 'Inheritance' },
              ]}
              active={tab}
              onChange={t => setTab(t as Tab)}
            />
          </div>

          <GlassCard>
            {tab === 'permissions' && (
              role.grants_all ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>
                  The Administrator role grants full access to everything. Its permissions are not editable.
                </p>
              ) : (
                <RoleMatrixEditor roleId={id} />
              )
            )}
            {tab === 'members' && <RoleMembersPanel roleId={id} />}
            {tab === 'inheritance' && <RoleInheritancePanel roleId={id} />}
          </GlassCard>
        </>
      )}
      {confirmEl}
    </>
  );
}
