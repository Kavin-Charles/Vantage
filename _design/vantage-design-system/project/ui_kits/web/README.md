# Vencore Web — UI Kit

A pixel-faithful, click-through recreation of the Vencore dashboard.

**Open `index.html`** to launch the prototype. The sidebar toggles between five core screens — Pipeline, Contacts, Activity, Servers, Analytics — all of them populated with seed data lifted from the screenshots in the source repo (Meridian Labs, Cobalt Systems, Stackline, Fenix, Orbit Cloud, etc).

## What's interactive

- **Sidebar** — clicking any nav item swaps the visible screen. Active state matches the live app (text-color fill, white label).
- **Pipeline** — list view is the primary surface (sortable by every column, with stage badge + owner avatar). A **List / Board** segmented toggle in the top-right switches to the kanban board, where cards drag between stage columns and stage totals re-sum live.
- **Contacts** — Edit/Delete buttons on every row (Delete is a soft fade-out). Add Contact opens the modal.
- **Companies** — Logo-tiled rows with industry / location / employees / website + Add Company modal.
- **Tasks** — All / Todo / Done filter tabs with counts, overdue banner, checkbox toggle, avatar assignees.
- **Activity** — Log Activity opens a Modal, prepends a new row. All icons are stroke glyphs (no emoji).
- **Mail** — Three-pane: folder sidebar (Inbox / Starred / Sent / Trash with counts), message list, reader pane with Reply CTA.
- **Servers** — Click any row to drill into the **Server Detail** page (Overview · Terminal · Services · Logs · Files tabs). Live-jittering CPU/MEM/DISK numbers on the list view.
- **Server Detail** — Sparkline metric cards, Details card, agent-install snippet, an interactive Terminal tab (`df`, `free`, `ps aux`, `uptime` return mock output), a systemd-style Services table with start/stop/restart per row, journalctl-flavored Logs (colored by severity), and a Files browser with directory navigation.
- **Databases** — engine badges (postgres/redis/clickhouse colored), host/port/status/last-checked.
- **Websites** — label + URL, response time, 30d uptime, SSL expiry colored by days remaining.
- **Files** — Stroke-icon file tiles (no emoji), size, type, Download/Delete with fade-out.
- **Analytics** — KPI strip with delta pills, gridded Revenue chart, **Pipeline by stage** horizontal bars (color-coded by stage), Rep leaderboard with Top badge + revenue progress bars. 30D / 90D / 12M period toggle updates everything.
- **Alerts** — All / Unresolved / Critical / Warning / Info tabs with counts, Acknowledge / Resolve.
- **Settings** — Profile / Team / Mail / Pipelines / Tasks / SSH Keys / API Keys sub-tabs.
- **Alert card** — dismissible severity-tiered card above the topbar.

## Files

```
index.html              Page shell — loads React, Babel, and every component file
app.jsx                 Top-level <App/>, screen routing, alert card state
Shell.jsx               Sidebar + Topbar + AlertCard + content frame

Pipeline.jsx            List view (primary) + Board view + Add deal modal
Contacts.jsx            Avatar-row table + Add Contact modal
Companies.jsx           Company table + Add Company modal
Tasks.jsx               Filter tabs + overdue banner + checkbox rows
Activity.jsx            Unified feed with stroke-icon type tiles
Mail.jsx                3-pane: folder sidebar / list / reader
Servers.jsx             Infrastructure list, click-through to detail
ServerDetail.jsx        Overview · Terminal · Services · Logs · Files tabs
Databases.jsx           Engine-badged table
Websites.jsx            Uptime monitoring with SSL date coloring
Files.jsx               Uploaded files list with stroke-icon tiles
Analytics.jsx           KPIs + Revenue chart + Pipeline-by-stage + Leaderboard
Alerts.jsx              Severity-tabbed list with ack/resolve actions
Settings.jsx            Profile / Team / Mail / Pipelines / SSH / API Keys

ui.jsx                  Primitives: Icon, Button, Badge, Modal, FormField,
                        Avatar, Eyebrow — and the entire stroke icon set
```

## Fidelity notes

- All colors / radii / spacing / type come from `../../colors_and_type.css` — no values redefined locally.
- Icons are loaded from `../../assets/icons/*.svg` and tinted with `filter` on hover (since they're not inline, `currentColor` doesn't tint them — see the `<Icon/>` helper in `ui.jsx` for how active state is handled).
- Empty states, error microcopy, and timestamp formatting copied verbatim from the source.
- The Mail / Files / Settings screens that exist in the source repo are **not** rebuilt — they were behind feature flags or weren't central to the visual story.
