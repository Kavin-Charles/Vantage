'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { listDashboards, createDashboard } from '../lib/dashboard-api';
import { CreateDashboardModal } from '../components/CreateDashboardModal';

export function DashboardIndexPage() {
  const router = useRouter();
  const getToken = useApiToken();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: dashboards, isLoading } = useQuery({
    queryKey: ['dashboards'],
    queryFn: async () => listDashboards(await getToken()),
  });

  useEffect(() => {
    if (!isLoading && dashboards && dashboards.length > 0) {
      router.replace(`/dashboard/${dashboards[0]!.id}`);
    }
  }, [isLoading, dashboards, router]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>
        Loading…
      </div>
    );
  }

  if (dashboards && dashboards.length > 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        color: 'var(--text3)',
      }}
    >
      <p style={{ fontSize: 15, margin: 0 }}>
        {user?.role === 'admin'
          ? 'No dashboards yet.'
          : 'No dashboards have been assigned to your groups.'}
      </p>
      {user?.role === 'admin' && (
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: '9px 20px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--text)',
            color: 'var(--bg)',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Create Dashboard
        </button>
      )}
      <CreateDashboardModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={async name => {
          const token = await getToken();
          const d = await createDashboard(name, token);
          await queryClient.invalidateQueries({ queryKey: ['dashboards'] });
          router.push(`/dashboard/${d.id}`);
        }}
      />
    </div>
  );
}
