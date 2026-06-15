'use client';

import { useState } from 'react';

interface Assignee { id: string; name: string; email: string }

interface Props {
  assignees: Assignee[];
  max?: number;
  size?: number;
}

const PALETTE = ['#d8f3dc', '#dbeafe', '#fef3c7', '#fee2e2', '#ede9fe', '#fce7f3'];
const PALETTE_TEXT = ['#1b4332', '#1e3a8a', '#78350f', '#7f1d1d', '#4c1d95', '#831843'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

function hashIndex(str: string, len: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % len;
}

function Avatar({ assignee, size, zIndex }: { assignee: Assignee; size: number; zIndex: number }) {
  const [showTip, setShowTip] = useState(false);
  const idx = hashIndex(assignee.id, PALETTE.length);
  const bg = PALETTE[idx]!;
  const color = PALETTE_TEXT[idx]!;

  return (
    <div
      style={{ position: 'relative', zIndex }}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: bg, color, fontSize: size * 0.38,
        fontFamily: 'DM Sans', fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '2px solid var(--surface)',
        flexShrink: 0, userSelect: 'none',
      }}>
        {initials(assignee.name || assignee.email)}
      </div>
      {showTip && (
        <div style={{
          position: 'absolute', bottom: size + 6, left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--text)', color: '#fff',
          fontFamily: 'DM Sans', fontSize: 11, padding: '3px 8px',
          borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none',
          opacity: showTip ? 1 : 0,
          transition: 'opacity 0.1s ease',
          zIndex: 100,
        }}>
          {assignee.name || assignee.email}
        </div>
      )}
    </div>
  );
}

export function AvatarGroup({ assignees, max = 3, size = 24 }: Props) {
  const visible = assignees.slice(0, max);
  const overflow = assignees.length - visible.length;
  const totalWidth = visible.length * (size - 6) + (overflow > 0 ? size - 6 : 0) + 6;

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: totalWidth, flexShrink: 0 }}>
      {visible.map((a, i) => (
        <div key={a.id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
          <Avatar assignee={a} size={size} zIndex={visible.length - i} />
        </div>
      ))}
      {overflow > 0 && (
        <div style={{
          marginLeft: -6,
          width: size, height: size, borderRadius: '50%',
          background: 'var(--surface2)', color: 'var(--text3)',
          fontSize: size * 0.36, fontFamily: 'DM Sans', fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid var(--surface)', flexShrink: 0,
        }}>
          +{overflow}
        </div>
      )}
    </div>
  );
}
