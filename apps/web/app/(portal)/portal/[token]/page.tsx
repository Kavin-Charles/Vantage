'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface HandshakeData {
  requires_password: boolean;
  label: string;
}

interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  health: string;
  progress: number;
  color: string | null;
  start_date: string | null;
  end_date: string | null;
}

const HEALTH_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  ON_TRACK:  { label: 'On Track',  bg: 'var(--green-bg, #d8f3dc)', color: 'var(--green, #2d6a4f)' },
  AT_RISK:   { label: 'At Risk',   bg: 'var(--amber-bg, #fef3c7)', color: 'var(--amber, #92400e)' },
  OFF_TRACK: { label: 'Off Track', bg: 'var(--red-bg, #fee2e2)',   color: 'var(--red, #991b1b)'   },
};

export default function PortalOverviewPage() {
  const { token } = useParams<{ token: string }>();
  const [handshake, setHandshake] = useState<HandshakeData | null>(null);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [authPending, setAuthPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/portal/${token}`, { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (json.error) { setError(json.error.message); setLoading(false); return; }
        setHandshake(json.data);
        if (!json.data.requires_password) {
          loadProject();
        } else {
          setLoading(false);
        }
      })
      .catch(() => { setError('Failed to load portal'); setLoading(false); });
  }, [token]);

  function loadProject() {
    fetch(`/api/portal/${token}/project`, { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (json.data) setProject(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthPending(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/${token}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error?.message ?? 'Invalid password'); return; }
      loadProject();
    } finally {
      setAuthPending(false);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text3, #9e998f)', fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (error && !handshake) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--red, #991b1b)', fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}>
        {error}
      </div>
    );
  }

  if (handshake?.requires_password && !project) {
    return (
      <div style={{ maxWidth: 400, margin: '60px auto 0' }}>
        <div style={{
          background: 'var(--surface, #fff)',
          border: '1px solid var(--border, #e4e0d8)',
          borderRadius: 12,
          padding: 28,
        }}>
          <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--text, #1a1814)', marginBottom: 6 }}>
            {handshake.label}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text2, #6b665c)', marginBottom: 20 }}>
            This portal is password protected. Enter the password to continue.
          </p>
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 13,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border, #e4e0d8)',
                background: 'var(--bg, #f7f6f2)',
                color: 'var(--text, #1a1814)',
                outline: 'none',
              }}
            />
            {error && (
              <p style={{ fontSize: 12, color: 'var(--red, #991b1b)', margin: 0 }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={authPending}
              style={{
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 13,
                fontWeight: 600,
                padding: '10px 16px',
                borderRadius: 8,
                background: 'var(--text, #1a1814)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {authPending ? 'Verifying…' : 'Enter Portal'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!project) return null;

  const health = HEALTH_STYLES[project.health] ?? HEALTH_STYLES.ON_TRACK;

  return (
    <div>
      <div style={{
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border, #e4e0d8)',
        borderRadius: 12,
        padding: '24px 28px',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 26, color: 'var(--text, #1a1814)', margin: '0 0 6px' }}>
              {project.name}
            </h1>
            {project.description && (
              <p style={{ fontSize: 14, color: 'var(--text2, #6b665c)', margin: 0, lineHeight: 1.5 }}>
                {project.description}
              </p>
            )}
          </div>
          <span style={{
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 6,
            background: health.bg,
            color: health.color,
            flexShrink: 0,
          }}>
            {health.label}
          </span>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text3, #9e998f)' }}>Progress</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text, #1a1814)' }}>{project.progress}%</span>
          </div>
          <div style={{ height: 8, background: 'var(--surface2, #f0ede6)', borderRadius: 4 }}>
            <div style={{
              height: '100%',
              borderRadius: 4,
              background: project.color ?? 'var(--green, #2d6a4f)',
              width: `${project.progress}%`,
              transition: 'width 0.4s',
            }} />
          </div>
        </div>

        {(project.start_date || project.end_date) && (
          <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
            {project.start_date && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3, #9e998f)', marginBottom: 2 }}>Start</div>
                <div style={{ fontSize: 13, color: 'var(--text, #1a1814)' }}>
                  {new Date(project.start_date).toLocaleDateString()}
                </div>
              </div>
            )}
            {project.end_date && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3, #9e998f)', marginBottom: 2 }}>End</div>
                <div style={{ fontSize: 13, color: 'var(--text, #1a1814)' }}>
                  {new Date(project.end_date).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
