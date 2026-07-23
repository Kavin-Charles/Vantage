import { ContactDetailScreen } from '@/modules/crm/fluid/contacts/ContactDetailScreen';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <ContactDetailScreen id={id} />;
}
