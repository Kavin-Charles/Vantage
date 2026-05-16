# Mobile App Design Spec

**Date:** 2026-05-17
**Feature:** Vantage Mobile (React Native / Expo)

---

## Goal

Ship a CRM-first mobile app for Vantage that mirrors the web's core feature set, supports push notifications for both infra alerts and CRM events, and degrades gracefully to read-only when offline.

## Decisions

| Question | Answer |
|----------|--------|
| MVP priority | CRM-first (contacts, deals, tasks, activity, alerts) |
| Push notification triggers | Both infra alerts + CRM events |
| Auth | Email + password, JWT stored in SecureStore |
| Offline | Read-only cache; write actions disabled with offline banner |
| Framework | Expo managed workflow + Expo Router |

---

## Architecture

### New workspace: `apps/mobile`

Expo managed workflow. File-based routing via Expo Router (mirrors Next.js App Router patterns).

```
apps/
  mobile/
    app/
      (auth)/
        login.tsx
      (app)/
        _layout.tsx           ← bottom tab navigator (5 tabs)
        index.tsx             ← dashboard
        contacts/
          index.tsx
          [id].tsx
        deals/
          index.tsx
          [id].tsx
        tasks/
          index.tsx
        alerts/
          index.tsx
          [id].tsx
        settings.tsx
    components/               ← mobile-only UI components
    hooks/
    lib/                      ← imports from @vantage/api-client
    constants/
    .env                      ← EXPO_PUBLIC_API_URL

packages/
  api-client/                 ← NEW: extracted from apps/web/lib/
    src/
      contacts.ts
      deals.ts
      tasks.ts
      activity.ts
      servers.ts
      alerts.ts
      auth.ts
      me.ts
      index.ts
    package.json
  types/                      ← unchanged
```

### Package extraction: `packages/api-client`

All typed fetch functions currently in `apps/web/lib/` move to `packages/api-client`. The web app updates its imports from `@/lib/contacts` → `@vantage/api-client`. Mobile imports the same package. No behaviour change on the web.

---

## Screens & Navigation

### Bottom tabs (5)

| Tab | Icon | Description |
|-----|------|-------------|
| Dashboard | home | Alert summary card, top server statuses, quick stats |
| Contacts | person | Searchable/filterable list → detail |
| Deals | briefcase | List by stage → deal detail |
| Tasks | checkbox | My tasks (today / upcoming / done) → task detail |
| Alerts | bell (badged) | All alerts → detail with ack/resolve |

### Screen inventory

**Auth:**
- `(auth)/login.tsx` — email + password fields, submit button, error display

**Dashboard:**
- `(app)/index.tsx` — unresolved critical/warning alert count, top 3 alerts preview, server online count

**Contacts:**
- `contacts/index.tsx` — paginated list, search bar, status filter chips
- `contacts/[id].tsx` — name, email, phone, status badge, linked company, activity timeline, linked deals, add note/call/email action buttons (disabled offline)

**Deals:**
- `deals/index.tsx` — list grouped by stage, value totals per stage
- `deals/[id].tsx` — stage selector (tap to change), value, close date, linked contact, activity

**Tasks:**
- `tasks/index.tsx` — sections: Today, Upcoming, Done. Tap to mark complete (disabled offline)

**Activity:**
- Accessible as a non-tab route `activity/index.tsx` linked from the Dashboard "View all activity" button — unified feed, paginated. Not a bottom tab.

**Alerts:**
- `alerts/index.tsx` — list, severity filter, resolved toggle
- `alerts/[id].tsx` — full message, resource info, acknowledge / resolve buttons (disabled offline)

**Settings:**
- `(app)/settings.tsx` — workspace logo + name (from API), push notification toggles per type, logout

---

## Data Layer

### TanStack Query + AsyncStorage persistence

```ts
// queryClient config
{
  gcTime: 24 * 60 * 60 * 1000,      // 24h — keep cache across restarts
  staleTime: 5 * 60 * 1000,         // 5 min — background refetch
  networkMode: 'offlineFirst',       // serve cache immediately
}
```

Persisted via `@tanstack/query-async-storage-persister` + `@react-native-async-storage/async-storage`. Cache survives app restarts. Offline users see last-fetched data automatically.

### Offline detection

`@react-native-community/netinfo` monitors connectivity. When offline:
- Queries serve from cache (TanStack handles automatically)
- All mutation-triggering UI elements are disabled
- Amber offline banner shown at top of every screen

**Offline banner text:** `"You're offline — viewing cached data. Connect to make changes."`

### Auth token

Stored in `expo-secure-store` (OS keychain, encrypted). On app launch:
1. Read token from SecureStore
2. Check JWT expiry client-side
3. If expired → redirect to login
4. If valid → proceed to app

On logout: delete token from SecureStore, call `DELETE /api/me/push-token`.

### Workspace branding

Fetched from `GET /api/me` on login. Workspace `name` and `logo_url` stored in AsyncStorage. Displayed in:
- Settings screen header
- Dashboard screen header

Refreshed each time app comes to foreground.

---

## Push Notifications

### Stack

Expo Push Notifications → Expo Push Service → APNs (iOS) / FCM (Android).

No direct APNs/FCM credential management required — Expo handles the relay.

### Token lifecycle

1. On login: `Notifications.requestPermissionsAsync()`
2. Get Expo Push Token: `Notifications.getExpoPushTokenAsync()`
3. `POST /api/me/push-token` with `{ token, platform: 'ios' | 'android' }`
4. On logout: `DELETE /api/me/push-token`

### New DB table: `push_tokens`

```sql
CREATE TABLE push_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token         text NOT NULL,
  platform      text NOT NULL CHECK (platform IN ('ios', 'android')),
  preferences   jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);
```

`preferences` jsonb shape:
```json
{
  "alerts_critical": true,
  "alerts_warning": true,
  "tasks_due": true,
  "deals_assigned": true,
  "contacts_assigned": true
}
```

### New API endpoints

```
POST   /api/me/push-token   { token: string, platform: 'ios'|'android' }  → upsert token
DELETE /api/me/push-token                                                  → remove token
PATCH  /api/me/push-token   { preferences: object }                        → update prefs
```

### Notification triggers (server-side)

| Event | Title | Body | Preference key |
|-------|-------|------|----------------|
| Alert created, severity=critical | 🔴 Alert | `{server/site name}: {message}` | `alerts_critical` |
| Alert created, severity=warning | 🟡 Alert | `{server/site name}: {message}` | `alerts_warning` |
| Task due today (new midnight cron job) | 📋 Task due today | `{task title}` | `tasks_due` |
| Deal assigned to user | 💼 Deal assigned | `{deal name} — ${value}` | `deals_assigned` |
| Contact assigned to user | 👤 Contact assigned | `{contact name}` | `contacts_assigned` |

Push sending utility in `apps/api/src/lib/push-notify.ts`:
```ts
import { Expo } from 'expo-server-sdk';
const expo = new Expo();

export async function sendPush(tokens: string[], title: string, body: string) {
  const messages = tokens
    .filter(t => Expo.isExpoPushToken(t))
    .map(t => ({ to: t, title, body, sound: 'default' }));
  await expo.sendPushNotificationsAsync(messages);
}
```

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Network error (query) | TanStack retries 3×, then shows inline error + "Retry" button |
| 401 Unauthorized | Clear SecureStore token, redirect to login |
| Mutation failure (online) | Toast via `react-native-toast-message`, no optimistic rollback |
| Mutation attempt (offline) | Button disabled — cannot reach failure state |
| Push permission denied | Silently skip token registration; no push received |

---

## Build & Release

### EAS Build profiles (`eas.json`)

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false },
      "android": { "buildType": "apk" }
    },
    "production": {
      "ios": { "distribution": "store" },
      "android": { "buildType": "app-bundle" }
    }
  }
}
```

- `eas build --profile preview` → TestFlight internal / Play internal track
- `eas build --profile production` → App Store / Play Store submission
- `eas update` → OTA JS-only hotfixes (no store review)

### CI (GitHub Actions)

On push to `main`: run `eas update` (OTA). On release tag: run `eas build --profile production`.

### Environment

```
apps/mobile/.env
  EXPO_PUBLIC_API_URL=https://api.yourdomain.com
```

---

## Backend Changes Summary

All additive — no breaking changes to existing API.

| Change | Type |
|--------|------|
| `push_tokens` table + migration | New |
| `POST /api/me/push-token` | New endpoint |
| `DELETE /api/me/push-token` | New endpoint |
| `PATCH /api/me/push-token` | New endpoint |
| `apps/api/src/lib/push-notify.ts` | New lib |
| Alert creation hooks push send | Modified (additive) |
| Midnight cron: push for tasks due today | New |
| `packages/api-client` extracted | Refactor (web import paths updated) |

---

## Out of Scope (this phase)

- SSH terminal on mobile
- File browser on mobile
- Billing / invoices
- Analytics charts
- Mail / Gmail integration
- Biometric unlock (can add later)
- True offline write queue / sync
