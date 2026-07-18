import { redirect } from 'next/navigation';

export default async function TeamUserRedirect({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  redirect(`/settings/users/${userId}`);
}
