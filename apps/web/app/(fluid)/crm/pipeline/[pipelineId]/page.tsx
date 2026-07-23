import { PipelineBoard } from '@/modules/crm/fluid/pipeline/PipelineBoard';

interface Props {
  params: Promise<{ pipelineId: string }>;
}

export default async function Page({ params }: Props) {
  const { pipelineId } = await params;
  return <PipelineBoard pipelineId={pipelineId} />;
}
