import { UserDetailScreen } from '@/modules/settings/fluid/workspace/UserDetailScreen';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <UserDetailScreen id={id} />;
}
