'use client';
import { KanbanBoard } from './kanban/KanbanBoard';
import type { Pipeline } from '@/modules/crm/pipeline/lib/pipelines';

export function PipelineKanban({
  pipeline,
  search,
  addTrigger,
}: {
  pipeline: Pipeline;
  search: string;
  addTrigger: number;
}) {
  return <KanbanBoard pipeline={pipeline} search={search} addTrigger={addTrigger} />;
}
