import { ModuleSettingsPage } from '@/modules/settings/fluid/modules/ModuleSettingsPage';
import { FIRST_PARTY_MODULES } from '@/modules/settings/fluid/modules/moduleMeta';

interface Props {
  params: Promise<{ moduleId: string }>;
}

export default async function Page({ params }: Props) {
  const { moduleId } = await params;
  const meta = FIRST_PARTY_MODULES.find(m => m.id === moduleId);
  return <ModuleSettingsPage moduleId={moduleId} initialName={meta?.name ?? moduleId} />;
}
