# Deployment Tracking — Design Spec
_Date: 2026-05-31_

## Overview

Add deployment tracking to Vencore's Infra section. Users can log deployments from three sources (CI webhooks, monitoring agent, manual curl), view a global feed with filters, and drill into per-deploy git + duration details.

---

## Data Model

New `deployments` table:

```
id:           uuid PK
workspace_id: uuid FK → workspace          (required — workspace scoping)
server_id:    uuid FK → server (nullable)  (optional link to monitored server)
name:         string (nullable)            (free-text: "api", "web", "monolith", etc.)
environment:  string (nullable)            (free-text: "production", "staging", etc.)
status:       enum (pending, running, success, failed, cancelled)
source:       enum (webhook, agent, manual)
started_at:   timestamp
finished_at:  timestamp (nullable)
duration_s:   int (nullable)               (computed/set on finish)
git_commit:   string (nullable)
git_branch:   string (nullable)
git_tag:      string (nullable)
git_message:  string (nullable)
git_author:   string (nullable)
meta:         jsonb (nullable)             (CI provider extras, arbitrary KV)
created_at:   timestamp
```

### Notes
- `name` and `environment` are nullable free-text — no enums. Works for monoliths and microservices alike.
- No soft delete — deployments are append-only audit records.
- Two-phase deploys: `POST` with `status: running` → `PATCH /:id` with `status: success|failed` + `finished_at`. Single-call use (status known upfront) also valid.
- Stale `running` records older than 24h are marked `cancelled` by a cron job.

---

## API Routes

```
POST   /api/deployments        Create deployment (all sources)
GET    /api/deployments        List — paginated, filterable
GET    /api/deployments/:id    Get single deployment
PATCH  /api/deployments/:id    Update status + finished_at (two-phase CI)
DELETE /api/deployments/:id    Delete
```

Additional agent endpoint:
```
POST   /api/agent/deployment   Agent-authenticated create (mirrors POST /api/deployments)
```

### Auth
- Dashboard / webhook / manual: existing workspace auth middleware (`requireWorkspace`)
- Agent source: `agent_token` in `Authorization: Bearer <token>` header → resolves workspace + auto-attaches `server_id`

### GET /api/deployments filters
| Param | Type | Notes |
|---|---|---|
| `name` | string | exact or partial match |
| `environment` | string | exact or partial match |
| `status` | enum | comma-separated multi |
| `server_id` | uuid | |
| `source` | enum | |
| `from` | ISO date | `started_at >=` |
| `to` | ISO date | `started_at <=` |
| `limit` | int | default 50, max 200 |
| `cursor` | string | cursor pagination |

### Validation (Zod)
- `POST`: `name?` string, `environment?` string, `status` required, `source` required, `server_id?` uuid, `started_at?` timestamp, `git_commit?` string, `git_branch?` string, `git_tag?` string, `git_message?` string, `git_author?` string, `meta?` object
- `PATCH`: all fields optional — `status?`, `finished_at?`. `duration_s` is computed server-side when `finished_at` is set (no need to pass it).

### Error format
All errors: `{ data: null, error: { code: string, message: string } }`

---

## UI

### Sidebar
New "Deployments" entry in the Infra group, after Websites.

### /deployments page

**Header:** "Deployments" (left) + "Log Deploy" button (right)

**Filter bar:**
- Name (text input)
- Environment (text input)
- Status (pill multi-select: all / running / success / failed / cancelled)
- Server (dropdown of monitored servers)
- Date range picker

**Table columns:**
| Column | Content |
|---|---|
| Status | Coloured badge (running=blue, success=green, failed=red, cancelled=grey) |
| Name | Free-text name |
| Environment | Free-text env |
| Server | Linked server name (if set) |
| Git | Branch + short commit SHA |
| Duration | Human-readable (e.g. "2m 14s") |
| Time | Relative (e.g. "3 hours ago") |

Row click → slide-over detail panel:
- All fields displayed
- Source badge (webhook / agent / manual)
- Full git message, author
- Raw `meta` JSON block (collapsed by default)

**Empty state:** Shows setup snippets directly (no dead-end).

### Log Deploy modal
Fields:
- Name (text, optional)
- Environment (text, optional)
- Server (dropdown, optional)
- Status (select: success / failed / running / pending)
- "Git info" (collapsible section): branch, commit SHA, tag, message, author

After creation: shows curl one-liner + GitHub Actions snippet pre-filled with the workspace API key.

### Setup snippets (shown in empty state + Settings → Integrations)

**Curl (manual):**
```bash
curl -X POST https://app.vencore.dev/api/deployments \
  -H "Authorization: Bearer $VENCORE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "api",
    "environment": "production",
    "status": "success",
    "git_branch": "main",
    "git_commit": "abc1234",
    "source": "manual"
  }'
```

**GitHub Actions step:**
```yaml
- name: Notify Vencore
  if: always()
  env:
    VENCORE_STATUS: ${{ job.status == 'success' && 'success' || 'failed' }}
  run: |
    curl -X POST https://app.vencore.dev/api/deployments \
      -H "Authorization: Bearer ${{ secrets.VENCORE_API_KEY }}" \
      -H "Content-Type: application/json" \
      -d "{
        \"name\": \"${{ github.repository }}\",
        \"environment\": \"production\",
        \"status\": \"$VENCORE_STATUS\",
        \"git_branch\": \"${{ github.ref_name }}\",
        \"git_commit\": \"${{ github.sha }}\",
        \"git_message\": \"${{ github.event.head_commit.message }}\",
        \"git_author\": \"${{ github.actor }}\",
        \"source\": \"webhook\"
      }"
  # Note: job.status returns "success", "failure", or "cancelled".
  # The env expression maps "failure" → "failed" to match Vencore enum.
```

**GitLab CI after_script:**
```yaml
after_script:
  - |
    curl -X POST https://app.vencore.dev/api/deployments \
      -H "Authorization: Bearer $VENCORE_API_KEY" \
      -H "Content-Type: application/json" \
      -d "{
        \"name\": \"$CI_PROJECT_NAME\",
        \"environment\": \"production\",
        \"status\": \"$([ $CI_JOB_STATUS = 'success' ] && echo success || echo failed)\",
        \"git_branch\": \"$CI_COMMIT_REF_NAME\",
        \"git_commit\": \"$CI_COMMIT_SHA\",
        \"git_message\": \"$CI_COMMIT_MESSAGE\",
        \"git_author\": \"$GITLAB_USER_LOGIN\",
        \"source\": \"webhook\"
      }"
```

---

## Agent Detection (v2 — optional, deferred if scope too large)

Agent gets optional `deploymentWatch` config:
```json
{
  "deploymentWatch": [
    { "name": "api", "processName": "node", "watchPath": "/app/api/dist" },
    { "name": "web", "watchPath": "/app/web/.next" }
  ]
}
```

Detection strategies (run every 30s alongside existing ping):

| Signal | Method | Notes |
|---|---|---|
| Process PID change | Compare PID of `processName` vs last seen | Catches process restarts |
| File mtime change | Check mtime of `watchPath` | Catches new build artifacts |
| systemd restart | `systemctl show <unit> --property=ActiveEnterTimestamp` | Most precise |

On detection → `POST /api/agent/deployment`:
- `source: "agent"`
- `status: "success"`
- `started_at: <detected_time>`
- `server_id` auto-attached from agent token

Git fields not available via agent — remain null unless CI webhook also configured.

---

## Error Handling

| Case | Behaviour |
|---|---|
| `PATCH /:id` unknown ID | 404 |
| `running` deploys > 24h | Cron job → marks `cancelled` |
| Agent token invalid | 401 |
| Zod validation fail | 422 with `VALIDATION_ERROR` |
| Missing git fields | Accepted — all nullable |
| Agent create: server_id | Auto-resolved from token, not passed in body |

---

## Out of Scope (this spec)

- Log streaming / deploy logs attachment
- Deploy rollback triggering
- Slack / email notifications on deploy fail
- Container / Kubernetes deployment events (separate Infra++ item)
- CI/CD pipeline visibility (separate Infra++ item)
