# Pipeline Board View — Design Spec

**Date:** 2026-05-23
**Status:** Approved

## Summary

Add drag-and-drop and click-to-detail to the pipeline board (kanban) view for deal-type pipelines. Extract board logic into a dedicated `DealKanban` component, mirroring the existing `RecordKanban` pattern.

---

## Background

The pipeline page already has a list/board toggle. The board branch for deal-type pipelines rendered a static `DealBoard` function (inline in `page.tsx`) with no drag-and-drop and non-clickable cards. `RecordKanban` already has these capabilities for record-type pipelines. This spec closes the gap.

---

## Scope

- Deal-type pipelines only (pipelines where `record_type_id` is null)
- Active stages only — Won/Lost columns remain hidden on the board
- No new API routes required

Out of scope: Won/Lost columns, record-type pipeline changes, mobile, optimistic updates.

---

## Component Structure

### New file: `apps/web/components/pipeline/DealKanban.tsx`

```
DealKanban
├── props: { pipelineId: string; addTrigger?: number }
├── state: dragDealId, selectedDealId, createModal, stageError
├── queries:
│   ├── ['pipeline', pipelineId]   → pipeline + stages (with fields)
│   ├── ['deals', pipelineId]      → deals[]
│   └── ['workspace-users']        → WorkspaceUser[]
├── mutation: updateDeal(token, dragDealId, { stage_id })
├── renders: active stages as columns → deal cards
├── on card click → Modal > DealDetailCard
└── on addTrigger ↑ → Modal > DealForm (create)
```

### Modified: `apps/web/app/(dashboard)/pipeline/[pipelineId]/page.tsx`

- Remove inline `DealBoard` function
- In `DealsList`: replace `<DealBoard>` with `<DealKanban pipelineId={pipelineId} addTrigger={addTrigger} />`
- `DealsList` still owns the toolbar (count, value, CSV, add button) — `DealKanban` owns only the board canvas

---

## Data Flow

```
DealKanban mounts
  → fetch pipeline+stages, deals, workspace-users

drag start   → setDragDealId(deal.id)
drag over    → e.preventDefault()
drop on col  → updateDeal(token, dragDealId, { stage_id: col.id })
             → onSuccess: invalidate ['deals', pipelineId]
             → onError: setStageError(message)

card click   → setSelectedDealId(deal.id)
             → render Modal > DealDetailCard
             → onDone: invalidate + close

addTrigger ↑ → setCreateModal(true)
             → render Modal > DealForm
             → onDone: invalidate + close
```

No optimistic updates. Simple invalidate-on-success pattern matches the rest of the codebase.

---

## Error Handling

| Condition | Behaviour |
|---|---|
| Drop fails (required stage fields) | Amber error banner (dismissible ✕), same as `RecordKanban` |
| No active stages | Board renders empty (pipeline misconfigured) |
| Empty column | "Empty" placeholder text |
| Network error on drop | Throw → React Query shows error; banner catches message |

---

## Types

`DealDetailCard` expects `stages` as `StageWithFields[]` (i.e. `PipelineStage & { fields: StageField[] }`). `getPipeline` already returns stages with fields attached, so the cast is safe — no API changes needed.

---

## Files Changed

| File | Change |
|---|---|
| `apps/web/components/pipeline/DealKanban.tsx` | **New** — full kanban component |
| `apps/web/app/(dashboard)/pipeline/[pipelineId]/page.tsx` | Remove `DealBoard` fn, swap in `<DealKanban>` |

No backend changes. No migration needed.
