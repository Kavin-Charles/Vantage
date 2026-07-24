import { CompanyDetailScreen } from '@/modules/crm/fluid/companies/CompanyDetailScreen';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <CompanyDetailScreen id={id} />;
}
