'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface Doc {
  id: string;
  title: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DocsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['project-docs', projectId],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: Doc[] }>(`/api/projects/${projectId}/docs`, { token });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: Doc }>(`/api/projects/${projectId}/docs`, {
        token,
        method: 'POST',
        body: JSON.stringify({ title: 'Untitled doc' }),
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['project-docs', projectId] });
      router.push(`/projects/${projectId}/docs/${res.data.id}`);
    },
  });

  const docs = data?.data ?? [];

  return (
    <div style={{ padding: '24px 32px', maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 24, color: 'var(--text)', margin: 0 }}>
          Docs
        </h2>
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          style={{
            fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
            background: 'var(--text)', color: '#fff',
            border: 'none', borderRadius: 7, padding: '8px 16px',
            cursor: createMutation.isPending ? 'not-allowed' : 'pointer',
            opacity: createMutation.isPending ? 0.6 : 1,
          }}
        >
          + New doc
        </button>
      </div>

      {isLoading ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text3)' }}>Loading...</div>
      ) : error ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--red)' }}>Failed to load docs.</div>
      ) : docs.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '48px 24px', textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'Instrument Serif', fontSize: 20, color: 'var(--text)', marginBottom: 8 }}>
            No docs yet
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>
            Create your first doc to start building your project wiki.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {docs.map(doc => (
            <button
              key={doc.id}
              onClick={() => router.push(`/projects/${projectId}/docs/${doc.id}`)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '14px 18px',
                cursor: 'pointer', textAlign: 'left', width: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>📄</span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
                  {doc.title}
                </span>
              </div>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>
                Updated {formatDate(doc.updated_at)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
