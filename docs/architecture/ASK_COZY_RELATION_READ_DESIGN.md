# Relation-read design for DATA_POINT_READ (design only; nothing built)

**Status: DESIGN for owner review, 2026-11-12. No code, no query run.** Needed by claims, sale readiness items (`SaleReadinessItem` by `saleCaseId`), buyer tasks and milestones (by `checklistId`), record versions/links (by `recordId`) and any child without a plain `propertyId`. One mechanism, so there are no one-off readers.

## Contract
1. **Allowlisted relation paths only.** A path is declared in code: `{ child, parent, parentKey, depth: 1 }`, e.g. `HomeBuyerTask -> HomeBuyerChecklist (checklistId)`. No path, relation or field name comes from the message or from a model; the plan carries a path id, never a name. Depth is 1 (parent to child); deeper chains need a new reviewed path.
2. **Property scoping at the authoritative parent.** The query is parent-first: the parent is found by `propertyId` (the parent has a plain column or is a singleton), then children by `parentKey IN (parent ids)`. A child id from a prior turn is never trusted: replay re-resolves through the parent.
3. **Visibility inherited.** If the parent has a visibility rule (Home Records: `visibleRecordWhere(role)`), it is applied to the parent first; an invisible parent means its children read as not found, never "exists but hidden".
4. **Lifecycle filters on both sides.** Parent (active, not trashed/cancelled/closed as appropriate) and child (not deleted, not superseded, status per entity) are declared per path, not defaulted.
5. **Per-field floors** are the existing catalogue floors; the path adds none, and a child may not be read at a lower floor than its parent's strictest field.
6. **Row limits.** Parents at most 5, children at most 50 per read, hard `take`; over the limit asks which, never lists all.
7. **Ambiguity.** More than one matching child or parent and none named: one clarification listing at most 8 display names (existing AMBIGUOUS behaviour). A name matches on the child's declared label only.
8. **Provenance.** Each row carries its own `sourceType`/`sourceId` for the child, plus the parent id; confidence/source limitations follow the existing per-record rule.
9. **Replay and refresh.** Authorization re-checks the child through the parent with the same predicates (new `CHECKS` entries whose `where` includes the parent relation filter, e.g. `{ id, parent: { propertyId } }`), at the current role.
10. **Moves, deletes, privacy changes, supersession.** A child that moves parent, is deleted, becomes private or is superseded fails the replay check and the section is redacted (existing `REDACT_SECTION`); the answer is not recomposed from a stale value.
11. **No model-supplied names.** The request plan's `dataPointId` resolves against the catalogue; relation paths are keyed by catalogue entity.

## Order of work (implementation waits)
Finish and review the parent/singleton slices first (done for v1-v3 except `PropertyRecord`); settle the PropertyRecord visibility policy; then build one path (suggest `HomeBuyerTask -> HomeBuyerChecklist`) end to end with tests before adding claims, which remain deferred.

## Open questions for the owner
Which child fields are wanted first (task status/due date, milestone due date, claim status)? Whether claim amounts and settlement figures are CONTRIBUTOR or OWNER?
