---
name: superpowers-python-automation
description: Implements reliable automations in Python for REST APIs: httpx/requests patterns, retries, timeouts, pagination, typing, config, logging, and tests. Use when writing Python scripts/services that call external APIs.
---

# Python Automation Skill

This skill provides concrete Python patterns to implement robust REST API automations.

## When to use this skill
- Python scripts that call one or more REST APIs
- ETL jobs, sync tools, webhook handlers
- CLI tools or small services that integrate external systems

## Preferred stack (defaults)
- HTTP client: **httpx** (preferred) or requests
- Config: env vars + `.env` (optional) with pydantic-settings if appropriate
- Logging: stdlib `logging` with structured-ish fields
- Testing: pytest (+ respx for httpx mocking when useful)

If the project already uses different tools, follow project conventions.

---

## Reference architecture (small but scalable)
- `client.py`: API client wrapper (auth headers, retries, pagination helpers)
- `models.py`: typed payload models (dataclasses or pydantic)
- `sync.py`: orchestration logic (fetch -> transform -> upsert)
- `main.py`: CLI entrypoint
- `tests/`: unit tests for transform + client behavior

## HTTP rules (mandatory)
- Always set timeouts (connect + read)
- Centralize request sending in one function so retries/logging are consistent
- Never log secrets (Authorization headers, tokens)

### Retry policy guidance
Retry on:
- network errors/timeouts
- 429 (respect Retry-After when present)
- 500–599
Optional: 408, and 409 only if operation is safe and semantics known

Do NOT retry on:
- most 400–499 (unless explicitly safe)

### Timeouts
- Set explicit timeouts; do not rely on defaults.
- Use smaller connect timeout; moderate read timeout.

---

## Pagination patterns
Support at least one helper that can handle:
- `next` URL in response
- cursor token in response
- page/limit parameters

Add a hard stop:
- max pages OR max items OR max elapsed time

---

## Idempotency patterns (Python)
Choose and document:
- Use an `Idempotency-Key` header when supported
- Upsert using a stable `external_id`
- Persist a lightweight state store:
  - simplest: SQLite file (recommended for OSS)
  - alternative: JSONL log + compaction

Minimum: ensure repeated runs don’t create duplicates.

---

## Observability (Python)
Minimum logs should include:
- `run_id`
- request: method, url/path, status_code, elapsed_ms, attempt
- record counts: processed/created/updated/skipped/failed

Also include a final summary log line.

---

## Verification requirements
For non-trivial work, add:
- unit tests for mapping/transform logic
- at least one test for pagination or retry behavior (mocked)
- a “dry-run” CLI flag (prints intended writes)

---

## Output format when writing code
- Provide a small directory layout
- Explain how to configure env vars
- Include exact commands to run (and test)
