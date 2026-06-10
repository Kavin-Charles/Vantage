import { DashboardPage } from '@/modules/dashboard/pages/[id]/page';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <DashboardPage dashboardId={id} />;
}
