import { RoleDetailScreen } from '@/modules/settings/fluid/workspace/RoleDetailScreen';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <RoleDetailScreen id={id} />;
}
