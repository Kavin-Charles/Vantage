'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listRoles, createRole } from '@vencore/api-client';
import { RoleBadges } from '@/modules/settings/components/RoleBadges';

export default function RolesPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
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
    },
  });

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Roles</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text2)' }}>
            Manage roles and their permissions.
          </p>
        </div>
        <form
          onSubmit={e => {
            e.preventDefault();
            if (name.trim()) create.mutate(name.trim());
          }}
          style={{ display: 'flex', gap: 8 }}
        >
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="New role name"
            style={{
              padding: '7px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 13,
            }}
          />
          <button
            type="submit"
            disabled={!name.trim() || create.isPending}
            style={{
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--text)',
              color: 'var(--bg)',
              fontSize: 13,
              cursor: !name.trim() || create.isPending ? 'not-allowed' : 'pointer',
              opacity: !name.trim() || create.isPending ? 0.6 : 1,
            }}
          >
            Create
          </button>
        </form>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      ) : (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data?.data.map(role => (
            <Link
              key={role.id}
              href={`/settings/roles/${role.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                color: 'var(--text)',
                transition: 'var(--transition)',
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-hover)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: role.color, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>{role.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{Number(role.member_count)} members</span>
              </span>
              <RoleBadges role={role} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
