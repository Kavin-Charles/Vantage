# Superpowers Rules (Always-On)

These rules apply to ALL work unless the user explicitly opts out.

## 1) Plan gate for non-trivial work
If the task is anything beyond a tiny change, do NOT edit code immediately.
You MUST:
1) Brainstorm briefly (goal, constraints, risks, acceptance criteria)
2) Write a step-by-step plan with verification steps
3) Ask the user to approve the plan
Only after approval may you implement.

### Execute-plan gate (Superpowers parity)
After the user approves a plan, do NOT begin implementation automatically.
You MUST pause and instruct the user to run: `/superpowers-execute-plan`

Only begin implementation after `/superpowers-execute-plan` is invoked,
unless the user explicitly says to proceed without it.

### What counts as "tiny"?
- single-file change
- obvious edit
- low risk
Even then: do a mini-plan (3–5 steps) and include verification.

## 2) Verification is mandatory
After implementation, you MUST provide:
- exact commands to verify (tests/lint/run)
- and results if you were able to run them

## 3) Prefer TDD / regression tests
- If fixing a bug: add a regression test if practical
- If adding behavior: add/adjust tests when practical
If tests aren’t feasible, provide a concrete alternative verification path.

## 4) Review pass required
Before final response, do a review pass and list issues by severity:
- Blocker / Major / Minor / Nit

## 5) Safety
- Never log secrets
- Add timeouts, retries, and idempotency for API automations
- Fail safe (no silent data loss)

## Artifact persistence (mandatory)
Any brainstorm, plan, review, or finish output must be written to disk under:
`artifacts/superpowers/`

Do not leave these as IDE-only documents.
After writing, confirm the file exists.

## Persistence enforcement
When a workflow requires saving an artifact to `artifacts/superpowers/`, you MUST ensure the file exists on disk.
Preferred method: use `python .agent/skills/superpowers-workflow/scripts/write_artifact.py --path <...>`.
If you cannot execute commands, instruct the user to save the output manually.
