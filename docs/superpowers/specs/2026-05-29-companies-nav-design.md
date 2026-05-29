# Companies Screen + Nav Change — Design Spec
**Date:** 2026-05-29
**Scope:** Mobile app (Expo Router)

---

## Goal

Add a Companies section to the mobile app (read-only list + detail). Simultaneously replace the Activity tab in the bottom nav with Contacts, moving Activity to the More menu.

---

## Nav Change

**`app/(app)/_layout.tsx`**

| Tab | Before | After |
|---|---|---|
| 1 | Home | Home |
| 2 | Pipeline | Pipeline |
| 3 | Activity | **Contacts** |
| 4 | Servers | Servers |
| 5 | More | More |

- `contacts` promoted from hidden route → real tab (icon: `people-outline`)
- `activity` demoted to hidden route (still reachable via More menu)
- `companies` added as hidden route

---

## More Menu Update

**`app/(app)/more/index.tsx`**

CRM section gains two rows:

```
CRM
  Contacts        (already exists)
  Companies       (NEW — links /(app)/companies)
  Tasks           (already exists)
  Pipeline        (already exists)
  Activity        (NEW — links /(app)/activity, previously a tab)
```

Infrastructure section unchanged.

---

## Companies Screens

### `companies/_layout.tsx`
Stack navigator, identical pattern to `contacts/_layout.tsx`.

### `companies/index.tsx`
- Header: display "Companies" title + count eyebrow (`N companies`)
- Search bar: filters by `name` (client-side, list loaded once)
- FlatList rows: `name` (primary) + `industry` badge + `location` (secondary text)
- Empty state: "No companies found"
- Tap row → `/(app)/companies/[id]`
- Data: `listCompanies(token)` via React Query key `['companies']`

### `companies/[id].tsx`
- Data source: `useQueryClient().getQueryData(['companies'])` — find by id from list cache. No separate API call (no `getCompany` endpoint exists).
- Header: company name + back chevron
- Info card fields (show `—` when null):
  - Industry
  - Location
  - Website (tappable `Linking.openURL`)
  - Employees
- Contacts section: "View Contacts" button → navigates to `/(app)/contacts` (no inline list — `listContacts` has no `company_id` filter)

---

## Non-Goals

- Create / edit company
- Inline linked contacts list
- `getCompany` API endpoint (not needed — detail uses list cache)

---

## Files Changed

| File | Action |
|---|---|
| `app/(app)/_layout.tsx` | Edit — swap tab |
| `app/(app)/more/index.tsx` | Edit — add Companies + Activity rows |
| `app/(app)/companies/_layout.tsx` | Create |
| `app/(app)/companies/index.tsx` | Create |
| `app/(app)/companies/[id].tsx` | Create |
