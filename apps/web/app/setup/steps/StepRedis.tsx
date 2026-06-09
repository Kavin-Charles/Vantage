'use client';

import type { SetupState, WizardAction } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

export function StepRedis({ state, dispatch }: Props) {
  const { redis } = state.infra;

  const set = (partial: Partial<typeof redis>) =>
    dispatch({ type: 'SET_INFRA', value: { ...state.infra, redis: { ...redis, ...partial } } });

  return (
    <div>
      <h2 style={heading}>
        Redis{' '}
        <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 400 }}>optional</span>
      </h2>
      <p style={subtext}>
        Redis is used for sessions and job queues. Skip if you don't have one — some features will be unavailable.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 3 }}>
            <label style={label}>Host</label>
            <input style={input} value={redis.host} onChange={e => set({ host: e.target.value })} placeholder="localhost" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Port</label>
            <input style={input} value={redis.port} onChange={e => set({ port: e.target.value })} placeholder="6379" />
          </div>
        </div>
        <div>
          <label style={label}>Password</label>
          <input style={input} type="password" value={redis.password} onChange={e => set({ password: e.target.value })} placeholder="Leave blank if none" />
        </div>
      </div>
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'Bricolage Grotesque, sans-serif' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 };
const input: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Sans, sans-serif', boxSizing: 'border-box' };
