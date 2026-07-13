'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getItemActivity } from '@/modules/crm/pipeline/lib/items';

interface Props {
  itemId: string;
}

const EVENT_LABELS: Record<string, string> = {
  stage_changed: 'Moved stage',
  field_changed: 'Updated field',
  item_created: 'Item created',
  reminder_sent: 'Reminder sent',
};

function formatPayload(eventType: string, payload: Record<string, unknown>): string {
  if (eventType === 'stage_changed') {
    return payload['to_stage_id'] ? `→ stage ${String(payload['to_stage_id']).slice(0, 8)}` : '';
  }
  if (eventType === 'field_changed') {
    return payload['field_key'] ? `· ${String(payload['field_key'])}` : '';
  }
  return '';
}

export function ItemActivity({ itemId }: Props) {
  const getToken = useApiToken();
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['item-activity', itemId],
    queryFn: async () => getItemActivity(await getToken(), itemId),
  });

  if (isLoading) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
        Loading activity…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
        No activity yet.
      </div>
    );
  }

  return (
    <div>
      {entries.map((entry, i) => (
        <div key={entry.id} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {/* Timeline dot */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--border)',
              border: '2px solid var(--surface)',
              outline: '1px solid var(--border)',
              marginTop: 3,
            }} />
            {i < entries.length - 1 && (
              <div style={{ width: 1, flex: 1, background: 'var(--border)', marginTop: 4 }} />
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, paddingBottom: 8 }}>
            <div style={{ fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
              {EVENT_LABELS[entry.event_type] ?? entry.event_type}
              {' '}
              <span style={{ color: 'var(--text3)' }}>
                {formatPayload(entry.event_type, entry.payload)}
              </span>
            </div>
            <div style={{
              fontSize: 11,
              color: 'var(--text3)',
              fontFamily: 'var(--font-sans)',
              marginTop: 2,
            }}>
              {new Date(entry.created_at).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
