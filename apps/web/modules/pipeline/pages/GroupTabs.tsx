'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listItemGroups } from '@/modules/pipeline/lib/item-groups';
import type { ItemGroup } from '@vantage/types';

interface Props {
  pipelineId: string | null;
  activeGroupId: string | null; // null = Deals view
  onChange: (groupId: string | null) => void;
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: active ? 600 : 400,
  color: active ? 'var(--text)' : 'var(--text3)',
  background: 'none',
  border: 'none',
  borderBottom: active ? '2px solid var(--text)' : '2px solid transparent',
  cursor: 'pointer',
  marginBottom: -1,
  transition: 'color .15s',
});

export function GroupTabs({ pipelineId, activeGroupId, onChange }: Props) {
  const getToken = useApiToken();
  const { data } = useQuery({
    queryKey: ['item-groups', pipelineId],
    queryFn: async () => listItemGroups(await getToken(), pipelineId!),
    enabled: !!pipelineId,
  });

  const groups: ItemGroup[] = (data?.data ?? []);

  if (groups.length === 0) return null;

  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
      <button style={tabStyle(activeGroupId === null)} onClick={() => onChange(null)}>
        Items
      </button>
      {groups.map(g => (
        <button key={g.id} style={tabStyle(activeGroupId === g.id)} onClick={() => onChange(g.id)}>
          {g.name}
        </button>
      ))}
    </div>
  );
}
