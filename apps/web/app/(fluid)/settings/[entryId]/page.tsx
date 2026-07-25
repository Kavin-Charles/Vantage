import { notFound } from 'next/navigation';
import { getSettingsEntryById } from '@/modules/shared/fluid/settings-registry';
// Side-effect import: runs every module's settings-entry registration (CRM,
// personal/workspace settings, etc.) so the registry is populated before
// getSettingsEntryById is queried below.
import '@/modules/shared/lib/register-all-widgets';

/**
 * Registry-driven settings page. Renders whichever panel component was
 * registered under `entryId` via `registerSettingsEntry`, keeping ownership
 * of settings panels inside their own modules instead of under app/.
 *
 * Next.js gives statically-defined segments (e.g. app/(fluid)/settings/about)
 * priority over this dynamic [entryId] route, so existing static settings
 * pages are unaffected.
 */
export default async function SettingsEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const entry = getSettingsEntryById(entryId);
  if (!entry) notFound();

  const Component = entry.component;
  return <Component />;
}
