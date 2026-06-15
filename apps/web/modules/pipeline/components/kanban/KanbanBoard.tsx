'use client';
import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listItems, moveItem } from '@/modules/pipeline/lib/items';
import { KanbanColumn } from './KanbanColumn';
import { ItemDetail } from '@/modules/pipeline/components/detail/ItemDetail';
import { ItemForm } from '@/modules/pipeline/components/shared/ItemForm';
import type { Pipeline } from '@/modules/pipeline/lib/pipelines';

interface Props {
  pipeline: Pipeline;
  search: string;
  addTrigger: number;
}

export function KanbanBoard({ pipeline, search, addTrigger }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formStageId, setFormStageId] = useState<string | null>(null);

  // addTrigger from parent opens the form for any stage
  const [lastTrigger, setLastTrigger] = useState(addTrigger);
  // Moved to useEffect to avoid setState-during-render
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

  return (
    <>
      <div style={{
        display: 'flex',
        gap: 20,
        padding: '20px 24px',
        overflowX: 'auto',
        height: '100%',
        alignItems: 'flex-start',
        boxSizing: 'border-box',
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
    </>
  );
}
