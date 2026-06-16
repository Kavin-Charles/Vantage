'use client';
import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listItems, moveItem, deleteItem } from '@/modules/pipeline/lib/items';
import { KanbanColumn } from './KanbanColumn';
import { ItemDetail } from '@/modules/pipeline/components/detail/ItemDetail';
import { ItemForm } from '@/modules/pipeline/components/shared/ItemForm';
import type { Pipeline } from '@/modules/pipeline/lib/pipelines';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  useContextMenu, ContextMenu, type ContextMenuItem,
} from '@/modules/shared/components/ui/ContextMenu';

interface Props {
  pipeline: Pipeline;
  search: string;
  addTrigger: number;
}

export function KanbanBoard({ pipeline, search, addTrigger }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { user, hasPermission } = useAuth();
  const canEdit = hasPermission('pipelines:edit');
  const canDelete = hasPermission('pipelines:delete');

  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formStageId, setFormStageId] = useState<string | null>(null);
  const [lastTrigger, setLastTrigger] = useState(addTrigger);

  useEffect(() => {
    if (addTrigger !== lastTrigger) {
      setLastTrigger(addTrigger);
      setFormStageId(pipeline.stages[0]?.id ?? null);
    }
  }, [addTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: items = [] } = useQuery({
    queryKey: ['items', pipeline.id],
    queryFn: async () => listItems(await getToken(), pipeline.id),
  });

  const moveMut = useMutation({
    mutationFn: async ({ id, stage_id, position }: { id: string; stage_id: string; position: number }) =>
      moveItem(await getToken(), id, { stage_id, position }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['items', pipeline.id] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteItem(await getToken(), id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['items', pipeline.id] }),
  });

  const filteredItems = search
    ? items.filter(item =>
        Object.values(item.field_values).some(v =>
          String(v ?? '').toLowerCase().includes(search.toLowerCase())
        )
      )
    : items;

  const itemsByStage = useCallback(
    (stageId: string) => filteredItems.filter(i => i.stage_id === stageId),
    [filteredItems]
  );

  const wonStage  = pipeline.stages.find(s => s.is_won);
  const lostStage = pipeline.stages.find(s => s.is_lost);
  const activeStages = pipeline.stages.filter(s => !s.is_won && !s.is_lost);

  function openCardContextMenu(itemId: string, e: React.MouseEvent) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const isOwner = user?.id === String(item.field_values['owner_id'] ?? '');
    const inWon  = item.stage_id === wonStage?.id;
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
        onClick: () => moveMut.mutate({ id: itemId, stage_id: item.stage_id, position: item.position }),
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
      <div style={{
        display: 'flex', gap: 20, padding: '20px 24px',
        overflowX: 'auto', height: '100%',
        alignItems: 'flex-start', boxSizing: 'border-box',
      }}>
        {pipeline.stages.map(stage => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            items={itemsByStage(stage.id)}
            fields={pipeline.fields}
            draggingId={draggingId}
            isDragOver={dragOverStage === stage.id}
            onDragOver={() => setDragOverStage(stage.id)}
            onDragLeave={() => setDragOverStage(prev => prev === stage.id ? null : prev)}
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
