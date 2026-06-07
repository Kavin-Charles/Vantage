---
description: Executes an approved plan in small steps with verification after each step. Writes execution artifacts to disk. Stops on failures. Finishes with review + summary.
---

# Superpowers Execute Plan

## Persist (mandatory)
You must write execution artifacts to disk (not IDE-only documents):

- Append execution notes to: `artifacts/superpowers/execution.md`
- Write the final summary to: `artifacts/superpowers/finish.md`

Requirements:
1) Ensure the folder `artifacts/superpowers/` exists (create it if needed).
2) After EACH completed plan step, append a note to `artifacts/superpowers/execution.md`.
3) At the end, write the final summary to `artifacts/superpowers/finish.md`.
4) After writing, confirm the files exist by listing `artifacts/superpowers/`.

If you are unable to write these files directly, use `python .agent/skills/superpowers-workflow/scripts/write_artifact.py --path <target>` to persist the content.


## Preconditions (do not skip)
1) The user must have replied **APPROVED** to a written plan.
2) The approved plan must exist on disk at:
   - `artifacts/superpowers/plan.md`

If `artifacts/superpowers/plan.md` does not exist:
- Stop immediately.
- Tell the user to run `/superpowers-write-plan` first.
- Do not edit code.

## Load the plan
- Read `artifacts/superpowers/plan.md`.
- Restate the plan briefly (1–2 lines) before making changes.

## Check for parallel execution opportunity (optional)
After loading the plan, analyze if steps can run in parallel:

1. **Check for independent steps**: Do 2+ steps operate on different files with no dependencies?
2. **If yes**: Suggest to the user:
   - "I notice steps X, Y, Z are independent and could run in parallel."
   - "Would you like to use `/superpowers-execute-plan-parallel` for faster execution?"
   - "Or continue with sequential execution? (Reply: PARALLEL or SEQUENTIAL)"
3. **If PARALLEL**: Stop and instruct user to run `/superpowers-execute-plan-parallel` instead.
4. **If SEQUENTIAL or no independent steps**: Continue with sequential execution below.

## Skills to apply as needed
Read and apply these skills when relevant:
- `superpowers-tdd` (preferred)
- `superpowers-debug` (if issues occur)
- `superpowers-review`
- `superpowers-finish`
- `superpowers-rest-automation` (if relevant)
- `superpowers-python-automation` (if Python)

## Execution rules (strict)
1) Implement **ONE** plan step at a time.
2) After each step:
   - Run the step’s verification command(s) (or, if you cannot run them, provide exact commands and expected outcomes).
   - Append a short note to `artifacts/superpowers/execution.md` containing:
     - Step name
     - Files changed
     - What changed (1–3 bullets)
     - Verification command(s)
     - Result (pass/fail or “not run”)
3) If verification fails:
   - Stop.
   - Switch to systematic debugging (use `superpowers-debug`).
   - Do not continue executing further steps until fixed and verified.
4) Keep changes minimal and scoped to the plan. If the plan is wrong or missing a step:
   - Stop and update the plan (write the updated plan back to `artifacts/superpowers/plan.md`)
   - Ask for approval again if the change is material.

## Finish (required)
At the end:
1) Run a review pass (Blocker/Major/Minor/Nit).
2) Write a final summary to `artifacts/superpowers/finish.md` including:
   - Verification commands run + results
   - Summary of changes
   - Follow-ups (if any)
   - Manual validation steps (if applicable)
3) Confirm the artifacts exist by listing `artifacts/superpowers/`.

Stop after completing the finish step.
