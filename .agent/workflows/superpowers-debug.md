---
description: Systematic debugging workflow: reproduce, minimize, hypotheses, instrument, fix, prevent, verify.
---

# Superpowers Debug

Read and apply the `superpowers-debug` skill.

Use the required reporting format:
- Symptom
- Repro steps
- Root cause
- Fix
- Regression protection
- Verification

## Persist (mandatory)
After generating the debug content above, you MUST write it to disk:

1) Copy the full debug markdown output.
2) Run:

```bash
python .agent/skills/superpowers-workflow/scripts/write_artifact.py --path artifacts/superpowers/debug.md

```

Provide the debug markdown as stdin to the command.

After writing, confirm it exists by listing artifacts/superpowers/.

If you cannot run the command, say so explicitly and instruct the user to copy/paste the debug output into artifacts/superpowers/debug.md.
Do not implement changes in this workflow. Stop after persistence.
