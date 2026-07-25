import { PipelineSettingsScreen } from '@/modules/crm/fluid/pipeline/settings/PipelineSettingsScreen';

export default async function PipelineSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PipelineSettingsScreen pipelineId={id} />;
}
