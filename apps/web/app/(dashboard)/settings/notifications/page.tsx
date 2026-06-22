'use client';

import { ComingSoonBadge } from '@/modules/shared/components/ui/ComingSoonBadge';

const CATEGORIES = [
  { label: 'Critical alerts', description: 'Server, database, or website outages.' },
  { label: 'Deal updates', description: 'Stage changes and assignments on your deals.' },
  { label: 'Task reminders', description: 'Due dates approaching or overdue.' },
  { label: 'Weekly digest', description: 'A weekly summary email of workspace activity.' },
];

export default function NotificationsPage() {
  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Notifications</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Choose what you get notified about.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {CATEGORIES.map(cat => (
          <div
            key={cat.label}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)',
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{cat.label}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{cat.description}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <ComingSoonBadge />
              <button
                disabled
                style={{
                  position: 'relative', width: 44, height: 24, borderRadius: 999,
                  background: 'var(--border)', border: 'none', cursor: 'not-allowed', opacity: 0.6, flexShrink: 0,
                }}
                aria-label={`${cat.label} (coming soon)`}
              >
                <span style={{ position: 'absolute', top: 3, left: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff' }} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
