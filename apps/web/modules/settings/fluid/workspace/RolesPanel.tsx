'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listRoles, createRole, type RoleSummary } from '@vencore/api-client';
import { RoleBadges } from '@/modules/settings/components/RoleBadges';
import {
  PageHeader, FluidTable, FluidInput, FluidButton, FluidModal, EmptyState,
  type FluidColumn,
} from '@/modules/shared/fluid/ui';

/**
 * Fluid Roles settings panel — registered into the Foundation settings
 * registry (workspace scope, admin-only). Takes no props; mounted directly
 * by apps/web/app/(fluid)/settings/roles/page.tsx.
 *
 * Reuses the exact backend surface as the legacy
 * apps/web/app/(dashboard)/settings/(users-roles)/roles/page.tsx it replaces:
 *   - GET  /api/roles       (listRoles)  → role list + member counts
 *   - POST /api/roles       (createRole) → { name, copyDefaults: true }
 */
export function RolesPanel() {
  const getToken = useApiToken();
  const router = useRouter();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => listRoles(await getToken()),
  });

  const create = useMutation({
    mutationFn: async (n: string) => createRole(await getToken(), { name: n, copyDefaults: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['roles'] });
      setName('');
      setShowCreate(false);
    },
  });

  const roles = data?.data ?? [];

  const columns: FluidColumn<RoleSummary>[] = [
    {
      key: 'role',
      header: 'Role',
      render: r => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)' }}>
              {Number(r.member_count)} member{Number(r.member_count) === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'badges',
      header: '',
      width: 260,
      render: r => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <RoleBadges role={r} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Roles"
        subtitle="Manage roles and their permissions."
        actions={
          <FluidButton icon="add" onClick={() => setShowCreate(true)}>Create Role</FluidButton>
        }
      />

      {isLoading ? (
        <EmptyState icon="hourglass_empty" title="Loading…" />
      ) : roles.length === 0 ? (
        <EmptyState icon="admin_panel_settings" title="No roles yet" message="Create a role to get started." />
      ) : (
        <FluidTable
          columns={columns}
          rows={roles}
          rowKey={r => r.id}
          onRowClick={r => router.push(`/settings/roles/${r.id}`)}
        />
      )}

      <FluidModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create role"
        subtitle="Starts from the workspace's default permission set."
      >
        <form
          onSubmit={e => {
            e.preventDefault();
            if (name.trim()) create.mutate(name.trim());
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <FluidInput value={name} onChange={setName} placeholder="Role name" icon="badge" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <FluidButton type="button" variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </FluidButton>
            <FluidButton type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create'}
            </FluidButton>
          </div>
        </form>
      </FluidModal>
    </>
  );
}
