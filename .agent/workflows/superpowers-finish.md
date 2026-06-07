---
description: Finalize work: verification, summary, follow-ups, manual validation steps.
---

# Superpowers Finish

Read and apply the `superpowers-finish` skill.

Output:
## Verification (commands + results if possible)
## Summary of changes
## Follow-ups (if needed)
## Manual validation steps (if applicable)

## Persist (mandatory)
After generating the finish content above, you MUST write it to disk:

1) Copy the full finish markdown output.
2) Run:

```bash
python .agent/skills/superpowers-workflow/scripts/write_artifact.py --path artifacts/superpowers/finish.md

```

Provide the finish markdown as stdin to the command.

After writing, confirm it exists by listing artifacts/superpowers/.

If you cannot run the command, say so explicitly and instruct the user to copy/paste the finish output into artifacts/superpowers/finish.md.
Do not implement changes in this workflow. Stop after persistence.
