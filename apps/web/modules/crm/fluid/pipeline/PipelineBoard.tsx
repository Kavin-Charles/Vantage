'use client';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { listItems, moveItem, deleteItem, updateItem } from '@/modules/crm/pipeline/lib/items';
import { listPipelines, getPipeline } from '@/modules/crm/pipeline/lib/pipelines';
import { ItemDetail } from '@/modules/crm/pipeline/components/detail/ItemDetail';
import { ItemForm } from '@/modules/crm/pipeline/components/shared/ItemForm';
import {
  useContextMenu, ContextMenu, type ContextMenuItem,
} from '@/modules/shared/components/ui/ContextMenu';
import { PageHeader, FluidButton, FluidInput, FluidSelect, EmptyState, MSIcon } from '@/modules/shared/fluid/ui';
import { PipelineColumn } from './PipelineColumn';

interface Props {
  pipelineId: string;
}

export function PipelineBoard({ pipelineId }: Props) {
  const getToken = useApiToken();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, hasPermission } = useAuth();
  const canEdit = hasPermission('pipelines:edit');
  const canDelete = hasPermission('pipelines:delete');

  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formStageId, setFormStageId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(v), 300);
  }, []);

  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });

  const { data: pipeline } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId),
  });

  const { data: items = [] } = useQuery({
    queryKey: ['items', pipelineId],
    queryFn: async () => listItems(await getToken(), pipelineId),
    enabled: !!pipeline,
  });

  const moveMut = useMutation({
    mutationFn: async ({ id, stage_id, position }: { id: string; stage_id: string; position: number }) =>
      moveItem(await getToken(), id, { stage_id, position }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['items', pipelineId] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteItem(await getToken(), id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['items', pipelineId] }),
  });

  if (!pipeline) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--fl-on-surface-variant)', fontFamily: 'var(--fl-font-body)' }}>
        Loading…
      </div>
    );
  }

  const filteredItems = debouncedSearch
    ? items.filter(item =>
        Object.values(item.field_values).some(v =>
          String(v ?? '').toLowerCase().includes(debouncedSearch.toLowerCase())
        )
      )
    : items;

  const itemsByStage = (stageId: string) => filteredItems.filter(i => i.stage_id === stageId);

  const wonStage = pipeline.stages.find(s => s.is_won);
  const lostStage = pipeline.stages.find(s => s.is_lost);
  const activeStages = pipeline.stages.filter(s => !s.is_won && !s.is_lost);
  const noStages = pipeline.stages.length === 0;

  function openCardContextMenu(itemId: string, e: React.MouseEvent) {
    const item = items.find(i => i.id === itemId);
    if (!item || !pipeline) return;

    const isOwner = user?.id === String(item.field_values['owner_id'] ?? '');
    const inWon = item.stage_id === wonStage?.id;
    const inLost = item.stage_id === lostStage?.id;

    const menuItems = [
      { label: 'Open', icon: 'external-link', onClick: () => setSelectedId(itemId) },
      canEdit && activeStages.length > 0 && {
        type: 'submenu' as const,
        label: 'Move to Stage',
        icon: 'arrow-right',
        items: activeStages
          .filter(s => s.id !== item.stage_id)
          .map(s => ({
            label: s.name,
            swatch: s.color ?? '#6366f1',
            onClick: () => moveMut.mutate({ id: itemId, stage_id: s.id, position: itemsByStage(s.id).length }),
          })),
      },
      canEdit && !isOwner && user && {
        label: 'Assign to Me',
        icon: 'user',
        onClick: () => void (async () => {
          const token = await getToken();
          await updateItem(token, itemId, { field_values: { ...item.field_values, owner_id: user!.id } });
          void qc.invalidateQueries({ queryKey: ['items', pipelineId] });
        })(),
      },
      (canEdit || canDelete) && { type: 'separator' as const },
      canEdit && wonStage && !inWon && {
        label: 'Mark as Won',
        icon: 'check-circle',
        onClick: () => moveMut.mutate({ id: itemId, stage_id: wonStage.id, position: itemsByStage(wonStage.id).length }),
      },
      canEdit && lostStage && !inLost && {
        label: 'Mark as Lost',
        icon: 'x-circle',
        onClick: () => moveMut.mutate({ id: itemId, stage_id: lostStage.id, position: itemsByStage(lostStage.id).length }),
      },
      canDelete && { type: 'separator' as const },
      canDelete && {
        label: 'Delete',
        icon: 'trash-2',
        danger: true,
        onClick: () => {
          if (confirm('Delete this item? This cannot be undone.'))
            deleteMut.mutate(itemId);
        },
      },
    ].filter(Boolean) as ContextMenuItem[];

    openMenu(e, menuItems);
  }

  return (
    <>
      <PageHeader
        title={pipeline.name}
        subtitle={`${filteredItems.length} record${filteredItems.length === 1 ? '' : 's'} across ${pipeline.stages.length} stage${pipeline.stages.length === 1 ? '' : 's'}`}
        actions={(
          <>
            {pipelines.length > 1 && (
              <FluidSelect
                value={pipelineId}
                onChange={v => router.push(`/crm/pipeline/${v}`)}
                options={pipelines.map(p => ({ label: p.name, value: p.id }))}
              />
            )}
            <div style={{ width: 260 }}>
              <FluidInput value={search} onChange={handleSearch} placeholder="Search records…" icon="search" />
            </div>
            {canEdit && (
              <FluidButton
                icon="add"
                disabled={noStages}
                onClick={() => setFormStageId(pipeline.stages[0]?.id ?? null)}
              >
                Add Deal
              </FluidButton>
            )}
            <FluidButton
              variant="ghost"
              icon="settings"
              onClick={() => router.push(`/settings/pipelines/${pipelineId}`)}
            >
              Pipeline settings
            </FluidButton>
          </>
        )}
      />

      {noStages && (
        <div className="glass-panel" style={{
          display: 'flex', alignItems: 'center', gap: 10, borderRadius: 'var(--fl-radius-input)',
          padding: '14px 18px', marginBottom: 20, color: 'var(--fl-on-error-container)',
          background: 'var(--fl-error-container)', fontFamily: 'var(--fl-font-body)', fontSize: 13,
        }}>
          <MSIcon name="warning" size={18} />
          <span>
            <strong>No stages configured.</strong> Create at least one stage in{' '}
            <a href={`/settings/pipelines/${pipelineId}`} style={{ color: 'inherit', fontWeight: 600 }}>
              Settings → Pipelines
            </a>{' '}
            before adding records.
          </span>
        </div>
      )}

      {!noStages && filteredItems.length === 0 && !debouncedSearch ? (
        <EmptyState
          icon="account_tree"
          title="No records yet"
          message="Add your first record to get this pipeline moving."
        />
      ) : (
        <div style={{ display: 'flex', gap: 20, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
          {pipeline.stages.map(stage => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              items={itemsByStage(stage.id)}
              fields={pipeline.fields}
              draggingId={draggingId}
              isDragOver={dragOverStage === stage.id}
              canEdit={canEdit}
              onDragOver={() => setDragOverStage(stage.id)}
              onDragLeave={() => setDragOverStage(prev => (prev === stage.id ? null : prev))}
              onDrop={() => {
                if (draggingId) {
                  const destItems = itemsByStage(stage.id);
                  moveMut.mutate({ id: draggingId, stage_id: stage.id, position: destItems.length });
                  setDraggingId(null);
                }
                setDragOverStage(null);
              }}
              onCardClick={id => setSelectedId(id)}
              onCardDragStart={id => setDraggingId(id)}
              onCardDragEnd={() => setDraggingId(null)}
              onAddClick={() => setFormStageId(stage.id)}
              onCardContextMenu={openCardContextMenu}
            />
          ))}
        </div>
      )}

      {selectedId && (
        <ItemDetail itemId={selectedId} pipeline={pipeline} onClose={() => setSelectedId(null)} />
      )}

      {formStageId !== null && (
        <ItemForm
          pipelineId={pipeline.id}
          stages={pipeline.stages}
          fields={pipeline.fields}
          defaultStageId={formStageId}
          onClose={() => setFormStageId(null)}
        />
      )}

      <ContextMenu menu={menu} onClose={closeMenu} />
    </>
  );
}
