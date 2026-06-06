---
description: Superpowers brainstorm. Produces goal/constraints/risks/options/recommendation/acceptance criteria.
---

# Superpowers Brainstorm

## Task
Brainstorm for this task (exactly as provided by the user):
**{{input}}**

If `{{input}}` is empty or missing, ask the user to restate the task in one sentence and STOP.

## Output sections (use exactly)
## Goal
## Constraints
## Known context
## Risks
## Options (2–4)
## Recommendation
## Acceptance criteria

## Persist (mandatory)
After generating the brainstorm content, you MUST write it to disk using this exact procedure:

1) Output the brainstorm markdown content first (the sections above).
2) Then immediately run:

```bash
python .agent/skills/superpowers-workflow/scripts/write_artifact.py --path artifacts/superpowers/brainstorm.md

```

Provide the brainstorm markdown as stdin to the command.

After writing, confirm it exists by listing artifacts/superpowers/.

If you cannot run the command, say so explicitly and instruct the user to copy/paste the brainstorm output into artifacts/superpowers/brainstorm.md.
Do not implement changes in this workflow. Stop after persistence.