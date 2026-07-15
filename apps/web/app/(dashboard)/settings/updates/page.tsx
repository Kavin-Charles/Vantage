'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/modules/shared/lib/api';
import { Button } from '@/modules/shared/components/ui/Button';

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  lastCheckedAt: string | null;
}

interface UpdaterStatus {
  state: 'idle' | 'pulling' | 'recreating' | 'error' | 'unavailable' | 'unreachable';
  targetVersion?: string | null;
  log?: string[];
}

type Phase = 'ready' | 'confirming' | 'updating' | 'waiting' | 'done' | 'failed';

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px 24px',
};

function majorOf(v: string): number {
  return Number(v.split('.')[0] ?? 0);
}

export default function UpdatesPage() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadInfo = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: UpdateInfo }>('/api/system/update-info');
      setInfo(res.data);
      if (res.data.latestVersion) {
        localStorage.setItem('vencore-update-dismissed', res.data.latestVersion);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load update info');
    }
  }, []);

  useEffect(() => {
    void loadInfo();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadInfo]);

  const checkNow = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: UpdateInfo }>('/api/system/check-updates', { method: 'POST' });
      setInfo(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed');
    } finally {
      setChecking(false);
    }
  };

  const startPolling = (target: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<{ data: UpdaterStatus }>('/api/system/update-status');
        setStatus(res.data);
        if (res.data.state === 'error') {
          setPhase('failed');
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // API is down — the recreate window. Switch to waiting for it to return.
        setPhase('waiting');
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          try {
            const v = await apiFetch<{ data: { version: string } }>('/api/system/version');
            if (v.data.version === target) {
              if (pollRef.current) clearInterval(pollRef.current);
              setPhase('done');
              setTimeout(() => window.location.reload(), 1500);
            }
          } catch {
            /* still restarting */
          }
        }, 3000);
      }
    }, 2000);
  };

  const startUpdate = async () => {
    if (!info?.latestVersion) return;
    setError(null);
    try {
      await apiFetch('/api/system/update', {
        method: 'POST',
        body: JSON.stringify({ version: info.latestVersion }),
      });
      setPhase('updating');
      startPolling(info.latestVersion);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed to start');
      setPhase('ready');
    }
  };

  const isMajor =
    info?.latestVersion != null &&
    /^\d+\.\d+\.\d+$/.test(info.currentVersion) &&
    majorOf(info.latestVersion) > majorOf(info.currentVersion);

  const row: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: '1px solid var(--border)',
  };
  const label: React.CSSProperties = { fontSize: 12, color: 'var(--text3)', fontWeight: 500 };
  const value: React.CSSProperties = { fontSize: 13, color: 'var(--text)' };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Updates</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Keep this instance up to date.
      </p>

      <div style={card}>
        <div style={row}>
          <span style={label}>Current version</span>
          <span style={value}>{info?.currentVersion ?? '…'}</span>
        </div>
        <div style={row}>
          <span style={label}>Latest version</span>
          <span style={value}>{info?.latestVersion ?? 'unknown'}</span>
        </div>
        <div style={row}>
          <span style={label}>Last checked</span>
          <span style={value}>
            {info?.lastCheckedAt ? new Date(info.lastCheckedAt).toLocaleString() : 'never'}
          </span>
        </div>
        {info?.releaseUrl && (
          <div style={row}>
            <span style={label}>Release notes</span>
            <a href={info.releaseUrl} target="_blank" rel="noreferrer" style={{ ...value, textDecoration: 'underline' }}>
              View on GitHub
            </a>
          </div>
        )}

        {error && (
          <p style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '8px 10px', borderRadius: 8, marginTop: 12 }}>
            {error}
          </p>
        )}

        {phase === 'ready' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button onClick={() => void checkNow()} disabled={checking}>
              {checking ? 'Checking…' : 'Check now'}
            </Button>
            {info?.updateAvailable && (
              <Button variant="primary" onClick={() => setPhase('confirming')}>
                Update to {info.latestVersion}
              </Button>
            )}
          </div>
        )}

        {phase === 'confirming' && info?.latestVersion && (
          <div style={{ marginTop: 16, padding: 14, background: isMajor ? 'var(--amber-bg)' : 'var(--surface2)', borderRadius: 10 }}>
            <p style={{ fontSize: 13, margin: '0 0 10px', color: isMajor ? 'var(--amber)' : 'var(--text)' }}>
              {isMajor
                ? `This is a major version upgrade (${info.currentVersion} → ${info.latestVersion}) and may include breaking changes. Type the version to confirm.`
                : `Update from ${info.currentVersion} to ${info.latestVersion}? The app will restart briefly.`}
            </p>
            {isMajor && (
              <input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder={info.latestVersion}
                style={{ width: '100%', marginBottom: 10, padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}
              />
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="primary"
                disabled={isMajor && confirmText !== info.latestVersion}
                onClick={() => void startUpdate()}
              >
                Update now
              </Button>
              <Button onClick={() => { setPhase('ready'); setConfirmText(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {(phase === 'updating' || phase === 'waiting') && (
          <div style={{ marginTop: 16, padding: 14, background: 'var(--surface2)', borderRadius: 10 }}>
            <p style={{ fontSize: 13, margin: 0, fontWeight: 500 }}>
              {phase === 'updating'
                ? status?.state === 'recreating'
                  ? 'Restarting services…'
                  : 'Pulling new images…'
                : 'Waiting for services to come back…'}
            </p>
            {status?.log && status.log.length > 0 && (
              <pre style={{ fontSize: 11, color: 'var(--text2)', maxHeight: 160, overflow: 'auto', marginTop: 10, marginBottom: 0 }}>
                {status.log.slice(-12).join('\n')}
              </pre>
            )}
          </div>
        )}

        {phase === 'done' && (
          <p style={{ fontSize: 13, color: 'var(--green)', background: 'var(--green-bg)', padding: '8px 10px', borderRadius: 8, marginTop: 16 }}>
            Updated successfully — reloading…
          </p>
        )}

        {phase === 'failed' && (
          <div style={{ marginTop: 16, padding: 14, background: 'var(--red-bg)', borderRadius: 10 }}>
            <p style={{ fontSize: 13, color: 'var(--red)', margin: '0 0 8px', fontWeight: 500 }}>Update failed.</p>
            {status?.log && (
              <pre style={{ fontSize: 11, color: 'var(--text2)', maxHeight: 160, overflow: 'auto', margin: '0 0 8px' }}>
                {status.log.slice(-12).join('\n')}
              </pre>
            )}
            <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
              To roll back manually: set VENCORE_VERSION back to the value of VENCORE_PREVIOUS_VERSION in your install
              directory&apos;s .env, then run <code>docker compose up -d</code>.
            </p>
            <Button style={{ marginTop: 10 }} onClick={() => { setPhase('ready'); setStatus(null); }}>
              Dismiss
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
