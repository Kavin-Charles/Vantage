---
name: superpowers-workflow
description: Enforces a disciplined workflow for coding, debugging, refactoring, and automation: brainstorm -> plan -> implement with verification (prefer TDD) -> review -> finish. Use for almost any non-trivial change.
---

# Superpowers Workflow

This skill defines the default operating procedure for software and automation tasks.

## When to use this skill
Use whenever the user asks to:
- build or modify code
- debug an error or failing tests
- refactor or improve quality
- design an automation workflow (e.g., API integrations, ETL, pipelines)
- add tests, reliability, or safety checks

## Activation marker (required)
Immediately after reading this skill (before any other output), run:

python .agent/skills/superpowers-workflow/scripts/record_activation.py --skill superpowers-workflow


## Default workflow (mandatory unless explicitly unnecessary)
1. **Brainstorm (short)**: clarify goal, constraints, risks, and acceptance criteria.
2. **Write a plan**: small steps (2–10 minutes each) with files + verification.
3. **Implement**: make the smallest correct change; prefer tests-first when feasible.
4. **Review pass**: correctness, edge cases, security, style, maintainability.
5. **Finish**: run verification commands, summarize changes + next steps.

## Decision tree: how much process is needed?
- **Tiny change (1 file, obvious)**:
  - Do a mini-brainstorm (3 bullets), then mini-plan (3–5 steps), then implement + verify.
- **Non-trivial change**:
  - Full brainstorm + plan before editing.
- **High-risk change** (auth, money, prod data, security, migrations):
  - Add explicit risk controls: rollback plan, dry-run, extra tests, logging, safe defaults.

## Output rules (how you communicate)
- Always state **assumptions** if anything is ambiguous.
- Always include **verification** (commands, tests, or observable checks).
- If you must ask questions, ask **at most 3**; then proceed with best assumptions.

## Stop conditions
Pause implementation and switch to planning if:
- requirements conflict
- critical unknowns block correctness
- the change could cause data loss or security issues without safeguards
