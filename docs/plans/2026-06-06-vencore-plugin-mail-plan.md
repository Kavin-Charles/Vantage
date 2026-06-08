# Vencore Mail Plugin Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Rewrite the vencore-plugin-mail to use the `@vantage/plugin-sdk` to provide a full-featured, React-based email client with deep CRM integration.

**Architecture:** A native Vantage plugin architecture. We will update `plugin.json` with new permissions/tables/surfaces. The backend (`src/server-entry.ts`) will use `createPlugin()` to expose cron jobs for IMAP sync and hooks for CRM linking. The frontend (`src/client-entry.tsx`) will use `createFrontendPlugin()` with React to render the `/mail` and `/mail/settings` pages, communicating exclusively via the `vantage` bridge.

**Tech Stack:** TypeScript, React, `@vantage/plugin-sdk`, `@vantage/plugin-types`.

---

### Task 1: Scaffolding and Manifest

**Files:**
- Modify: `vencore-plugin-mail/package.json`
- Modify: `vencore-plugin-mail/plugin.json`
- Create: `vencore-plugin-mail/src/client-entry.tsx`

**Step 1: Write the package.json test**
Run: `cat vencore-plugin-mail/package.json | grep "@vantage/plugin-sdk"`
Expected: FAIL

**Step 2: Update package dependencies and scripts**
Modify `package.json` to include `"@vantage/plugin-sdk": "^1.0.0"` (or latest) and React dependencies. Update the `build` script to bundle both `server-entry.ts` and `client-entry.tsx`.

**Step 3: Update `plugin.json`**
Rewrite `plugin.json` entirely based on the new spec.
- Define `mail_accounts` and `mail_messages` tables.
- Request `contacts:read`, `contacts:write`, `deals:read`, `activity:write` permissions.
- Add `/mail` and `/mail/settings` pages to `surfaces.pages`.
- Add a contact panel to `surfaces.panels`.

**Step 4: Create dummy `client-entry.tsx`**
```tsx
import { createFrontendPlugin } from '@vantage/plugin-sdk/react';

export default createFrontendPlugin({
  setup(vantage) {
    vantage.registerPage('/mail', () => <div>Mail App</div>);
  },
});
```

**Step 5: Commit**
```bash
cd vencore-plugin-mail
git add package.json plugin.json src/client-entry.tsx
git commit -m "chore: scaffold sdk dependencies and new manifest"
```

---

### Task 2: Backend SDK Conversion

**Files:**
- Modify: `vencore-plugin-mail/src/server-entry.ts`

**Step 1: Write the failing build check**
Run: `npm run build`
Expected: FAIL (or builds old Express code)

**Step 2: Rewrite `server-entry.ts`**
Remove all Express code. Implement `createPlugin`.

```typescript
import { createPlugin } from '@vantage/plugin-sdk';

export default createPlugin({
  async setup(vantage) {
    vantage.on('contact.created', async (payload) => {
        // Placeholder CRM hook
    });
    
    // Register sync cron
    vantage.cron.register('*/5 * * * *', 'sync-emails', async () => {
        // Placeholder sync logic
    });
  },
});
```

**Step 3: Run build check**
Run: `npm run build`
Expected: PASS (builds both server and client entries successfully)

**Step 4: Commit**
```bash
cd vencore-plugin-mail
git add src/server-entry.ts
git commit -m "refactor(backend): convert to vantage plugin sdk"
```

---

### Task 3: Mail Accounts & Sync Logic (Backend)

**Files:**
- Create: `vencore-plugin-mail/src/sync.ts`
- Modify: `vencore-plugin-mail/src/server-entry.ts`

**Step 1: Write a failing sync test**
(Assuming a basic mock test in `tests/sync.test.ts` or similar verifying table writes)

**Step 2: Implement Sync Logic (`sync.ts`)**
Create the IMAP polling logic that uses `vantage.table('mail_accounts').list()` to find accounts, fetches emails (mocked or basic implementation for now), and uses `vantage.table('mail_messages').upsert()` to save them. Implement basic auto-linking by querying `vantage.list('contacts', { email })`.

**Step 3: Wire into cron**
In `server-entry.ts`, call the sync logic within the cron handler.

**Step 4: Commit**
```bash
cd vencore-plugin-mail
git add src/sync.ts src/server-entry.ts
git commit -m "feat(backend): implement email sync cron and crm linking"
```

---

### Task 4: Frontend Application Foundation

**Files:**
- Modify: `vencore-plugin-mail/src/client-entry.tsx`
- Create: `vencore-plugin-mail/src/components/MailApp.tsx`
- Create: `vencore-plugin-mail/src/components/SettingsApp.tsx`

**Step 1: Implement `MailApp` UI layout**
Build the React component for the three-pane layout (Sidebar, List, Detail). Use `vantage.table('mail_messages').list(...)` to fetch emails for the active folder.

**Step 2: Implement `SettingsApp` UI**
Build the form to add a new `mail_account` using `vantage.table('mail_accounts').insert(...)`.

**Step 3: Register in setup**
```tsx
import { createFrontendPlugin } from '@vantage/plugin-sdk/react';
import MailApp from './components/MailApp';
import SettingsApp from './components/SettingsApp';

export default createFrontendPlugin({
  setup(vantage) {
    vantage.registerPage('/mail', MailApp);
    vantage.registerPage('/mail/settings', SettingsApp);
  },
});
```

**Step 4: Commit**
```bash
cd vencore-plugin-mail
git add src/client-entry.tsx src/components/
git commit -m "feat(frontend): build mail and settings react apps"
```
