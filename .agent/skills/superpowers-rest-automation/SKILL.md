---
name: superpowers-rest-automation
description: Builds reliable automations that integrate with REST APIs: auth, pagination, retries, rate limits, idempotency, webhooks, data mapping, and safe error handling. Use when calling external APIs, syncing systems, or building ETL-style workflows.
---

# REST Automation Skill

This skill enforces reliability and safety when building automations that call REST APIs.

## When to use this skill
Use whenever the task involves:
- calling external REST APIs (CRUD, search, sync)
- integrating 2+ systems (ETL, iPaaS-like flows)
- webhooks, polling, or scheduled jobs
- data ingestion, normalization, enrichment, deduplication

## Default design principles
- **Idempotent by design**: repeats should not create duplicates or corrupt data.
- **Observable**: logs/metrics correlate each run and each API call.
- **Fail safe**: handle partial failures; avoid silent data loss.
- **Rate-limit aware**: backoff and respect vendor limits.
- **Least privilege**: handle secrets safely, avoid overbroad scopes.

---

## Checklist (apply unless irrelevant)

### 1) Define the contract
- Inputs (format, required fields, validation)
- Outputs (where data goes, expected shape)
- Success criteria (what “done” means)
- Non-goals (what the automation will not do)

### 2) Authentication & secrets
- Identify auth type: API key, OAuth2, JWT, mTLS
- Never hardcode secrets in code or logs
- Support secret injection via env vars / secret manager
- Plan token refresh if applicable (OAuth2)

### 3) Idempotency & deduplication
Pick at least one:
- Use provider idempotency keys (if supported)
- Use stable external IDs (e.g., `external_id` field) for upserts
- Keep a local/state store mapping source IDs -> target IDs
- Use deterministic hashes for dedupe when no stable ID exists
Document the idempotency strategy explicitly.

### 4) Pagination & incremental sync
- Detect pagination style: `next` link, cursor, page+limit, offset+limit
- Ensure loops terminate safely (max pages / max time)
- Prefer incremental sync using `updated_since`/ETag/If-Modified-Since when possible
- Handle out-of-order updates and late-arriving events

### 5) Retries, backoff, and timeouts
- Set **timeouts** for connect/read
- Retry on transient errors: network failures, 429, 5xx (with limits)
- Use exponential backoff with jitter if possible
- Do **not** retry on most 4xx (except 408/409/429 depending on semantics)
- Cap retries and surface failures clearly

### 6) Rate limits & quotas
- Respect `Retry-After` and rate-limit headers
- Implement adaptive backoff on 429
- Consider batch endpoints to reduce call volume
- Avoid bursty concurrency unless explicitly safe

### 7) Data mapping & validation
- Explicit mapping layer (source -> normalized -> target)
- Validate required fields and types
- Normalize common formats (dates, enums, currency, locales)
- Handle nullability and partial payloads
- Record rejected records with reasons (don’t silently drop)

### 8) Error handling strategy
Choose and document per error class:
- **Skip with log** (non-critical record)
- **Retry** (transient)
- **Quarantine** (store failing payload for later)
- **Fail the run** (systemic issue)
Ensure the workflow reports a clear summary at the end.

### 9) Observability & audit trail
Minimum:
- Run ID / correlation ID
- Per-request logs: method, path (not full secrets), status, latency, attempt count
- Counters: processed, created, updated, skipped, failed
Prefer structured logs (JSON) if possible.

### 10) Webhooks (if involved)
- Verify signature (if provided)
- Handle replay (idempotency for event IDs)
- Respond quickly; process async if needed
- Store raw event payloads (optional but recommended)

### 11) Safety controls
- Dry-run mode (no writes)
- Limit scope (max records per run)
- “Kill switch” config flag
- Backups/rollback plan for destructive operations

---

## Output requirements (when producing a solution)
Include:
- Idempotency strategy (1–3 bullets)
- Retry/backoff policy
- Pagination/incremental sync approach (if relevant)
- Error handling strategy + what gets logged/quarantined
- Verification plan (tests or a safe sandbox run plan)
