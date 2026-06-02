import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = process.cwd(); // run from apps/web/

const REPLACEMENTS = [
  // lib: module-specific (longer matches first to avoid partial replacement)
  ["from '@/lib/api-keys'", "from '@/modules/shared/lib/api-keys'"],
  ["from \"@/lib/api-keys\"", "from \"@/modules/shared/lib/api-keys\""],
  ["from '@/lib/activity'", "from '@/modules/activity/lib/activity'"],
  ["from \"@/lib/activity\"", "from \"@/modules/activity/lib/activity\""],
  ["from '@/lib/analytics'", "from '@/modules/analytics/lib/analytics'"],
  ["from \"@/lib/analytics\"", "from \"@/modules/analytics/lib/analytics\""],
  ["from '@/lib/AuthContext'", "from '@/modules/shared/lib/AuthContext'"],
  ["from \"@/lib/AuthContext\"", "from \"@/modules/shared/lib/AuthContext\""],
  ["from '@/lib/calendar'", "from '@/modules/shared/lib/calendar'"],
  ["from \"@/lib/calendar\"", "from \"@/modules/shared/lib/calendar\""],
  ["from '@/lib/companies'", "from '@/modules/companies/lib/companies'"],
  ["from \"@/lib/companies\"", "from \"@/modules/companies/lib/companies\""],
  ["from '@/lib/contacts'", "from '@/modules/contacts/lib/contacts'"],
  ["from \"@/lib/contacts\"", "from \"@/modules/contacts/lib/contacts\""],
  ["from '@/lib/conversions'", "from '@/modules/pipeline/lib/conversions'"],
  ["from \"@/lib/conversions\"", "from \"@/modules/pipeline/lib/conversions\""],
  ["from '@/lib/csv'", "from '@/modules/shared/lib/csv'"],
  ["from \"@/lib/csv\"", "from \"@/modules/shared/lib/csv\""],
  ["from '@/lib/deployments'", "from '@/modules/shared/lib/deployments'"],
  ["from \"@/lib/deployments\"", "from \"@/modules/shared/lib/deployments\""],
  ["from '@/lib/infra-databases'", "from '@/modules/databases/lib/infra-databases'"],
  ["from \"@/lib/infra-databases\"", "from \"@/modules/databases/lib/infra-databases\""],
  ["from '@/lib/item-groups'", "from '@/modules/pipeline/lib/item-groups'"],
  ["from \"@/lib/item-groups\"", "from \"@/modules/pipeline/lib/item-groups\""],
  ["from '@/lib/pipelines'", "from '@/modules/pipeline/lib/pipelines'"],
  ["from \"@/lib/pipelines\"", "from \"@/modules/pipeline/lib/pipelines\""],
  ["from '@/lib/record-types'", "from '@/modules/pipeline/lib/record-types'"],
  ["from \"@/lib/record-types\"", "from \"@/modules/pipeline/lib/record-types\""],
  ["from '@/lib/records'", "from '@/modules/pipeline/lib/records'"],
  ["from \"@/lib/records\"", "from \"@/modules/pipeline/lib/records\""],
  ["from '@/lib/servers'", "from '@/modules/servers/lib/servers'"],
  ["from \"@/lib/servers\"", "from \"@/modules/servers/lib/servers\""],
  ["from '@/lib/sftp'", "from '@/modules/servers/lib/sftp'"],
  ["from \"@/lib/sftp\"", "from \"@/modules/servers/lib/sftp\""],
  ["from '@/lib/ssh'", "from '@/modules/servers/lib/ssh'"],
  ["from \"@/lib/ssh\"", "from \"@/modules/servers/lib/ssh\""],
  ["from '@/lib/useApiToken'", "from '@/modules/shared/lib/useApiToken'"],
  ["from \"@/lib/useApiToken\"", "from \"@/modules/shared/lib/useApiToken\""],
  ["from '@/lib/useConfig'", "from '@/modules/shared/lib/useConfig'"],
  ["from \"@/lib/useConfig\"", "from \"@/modules/shared/lib/useConfig\""],
  ["from '@/lib/websites'", "from '@/modules/shared/lib/websites'"],
  ["from \"@/lib/websites\"", "from \"@/modules/shared/lib/websites\""],
  // lib: shared catch-all api (must come after api-keys)
  ["from '@/lib/api'", "from '@/modules/shared/lib/api'"],
  ["from \"@/lib/api\"", "from \"@/modules/shared/lib/api\""],
  // components: module-specific (subdirectory paths)
  ["from '@/components/pipeline/", "from '@/modules/pipeline/components/"],
  ["from \"@/components/pipeline/", "from \"@/modules/pipeline/components/"],
  ["from '@/components/contacts/", "from '@/modules/contacts/components/"],
  ["from \"@/components/contacts/", "from \"@/modules/contacts/components/"],
  ["from '@/components/companies/", "from '@/modules/companies/components/"],
  ["from \"@/components/companies/", "from \"@/modules/companies/components/"],
  ["from '@/components/servers/", "from '@/modules/servers/components/"],
  ["from \"@/components/servers/", "from \"@/modules/servers/components/"],
  ["from '@/components/settings/", "from '@/modules/settings/components/"],
  ["from \"@/components/settings/", "from \"@/modules/settings/components/"],
  // components: shared ui
  ["from '@/components/ui/", "from '@/modules/shared/components/ui/"],
  ["from \"@/components/ui/", "from \"@/modules/shared/components/ui/"],
  // components: shared top-level
  ["from '@/components/AlertBar'", "from '@/modules/shared/components/AlertBar'"],
  ["from \"@/components/AlertBar\"", "from \"@/modules/shared/components/AlertBar\""],
  ["from '@/components/CsvImportExport'", "from '@/modules/shared/components/CsvImportExport'"],
  ["from \"@/components/CsvImportExport\"", "from \"@/modules/shared/components/CsvImportExport\""],
  ["from '@/components/ModuleGuard'", "from '@/modules/shared/components/ModuleGuard'"],
  ["from \"@/components/ModuleGuard\"", "from \"@/modules/shared/components/ModuleGuard\""],
  ["from '@/components/NotificationBell'", "from '@/modules/shared/components/NotificationBell'"],
  ["from \"@/components/NotificationBell\"", "from \"@/modules/shared/components/NotificationBell\""],
  ["from '@/components/Providers'", "from '@/modules/shared/components/Providers'"],
  ["from \"@/components/Providers\"", "from \"@/modules/shared/components/Providers\""],
  ["from '@/components/Sidebar'", "from '@/modules/shared/components/Sidebar'"],
  ["from \"@/components/Sidebar\"", "from \"@/modules/shared/components/Sidebar\""],
  ["from '@/components/Topbar'", "from '@/modules/shared/components/Topbar'"],
  ["from \"@/components/Topbar\"", "from \"@/modules/shared/components/Topbar\""],
  // contexts
  ["from '@/contexts/modules'", "from '@/modules/shared/contexts/modules'"],
  ["from \"@/contexts/modules\"", "from \"@/modules/shared/contexts/modules\""],
  ["from '@/contexts/ServerMetricsContext'", "from '@/modules/shared/contexts/ServerMetricsContext'"],
  ["from \"@/contexts/ServerMetricsContext\"", "from \"@/modules/shared/contexts/ServerMetricsContext\""],
  // hooks
  ["from '@/hooks/useMailSocket'", "from '@/modules/shared/hooks/useMailSocket'"],
  ["from \"@/hooks/useMailSocket\"", "from \"@/modules/shared/hooks/useMailSocket\""],
];

// Analytics page: relative imports for co-located components that moved to components/
const ANALYTICS_PAGE = join(ROOT, 'modules/analytics/pages/page.tsx');
const ANALYTICS_FIXUPS = [
  ["from './KpiCards'", "from '../components/KpiCards'"],
  ["from \"./KpiCards\"", "from \"../components/KpiCards\""],
  ["from './RevenueChart'", "from '../components/RevenueChart'"],
  ["from \"./RevenueChart\"", "from \"../components/RevenueChart\""],
  ["from './PipelineChart'", "from '../components/PipelineChart'"],
  ["from \"./PipelineChart\"", "from \"../components/PipelineChart\""],
  ["from './RepLeaderboard'", "from '../components/RepLeaderboard'"],
  ["from \"./RepLeaderboard\"", "from \"../components/RepLeaderboard\""],
];

function walk(dir) {
  const results = [];
  const SKIP = new Set(['node_modules', '.next', 'dist', '.turbo']);
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (['.ts', '.tsx', '.mts'].includes(extname(entry))) {
      results.push(full);
    }
  }
  return results;
}

let updated = 0;
for (const file of walk(ROOT)) {
  let content = readFileSync(file, 'utf8');
  let changed = false;
  for (const [from, to] of REPLACEMENTS) {
    if (content.includes(from)) {
      content = content.split(from).join(to);
      changed = true;
    }
  }
  if (file === ANALYTICS_PAGE) {
    for (const [from, to] of ANALYTICS_FIXUPS) {
      if (content.includes(from)) {
        content = content.split(from).join(to);
        changed = true;
      }
    }
  }
  if (changed) {
    writeFileSync(file, content, 'utf8');
    console.log('Updated:', file.replace(ROOT + '/', ''));
    updated++;
  }
}
console.log(`\nDone. Updated ${updated} files.`);
