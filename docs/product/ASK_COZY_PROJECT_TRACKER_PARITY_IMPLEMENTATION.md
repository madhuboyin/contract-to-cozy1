# Ask Cozy Project Tracker parity

## Purpose and document ownership

This document records the desktop-to-conversation parity audit for Project Tracker and maps each identified gap to its Ask Cozy implementation.

The authoritative product requirements remain in [`LIVE_PROJECT_EXECUTION_TRACKER.md`](../functional/LIVE_PROJECT_EXECUTION_TRACKER.md). This companion is intentionally separate because it records a channel-specific audit, implementation status, code ownership, validation evidence, and residual differences. New product behavior belongs in the FRD first; this document should then be updated to describe how Ask Cozy exposes that behavior.

**Audit baseline:** desktop Project Tracker routes and the Live Project Execution Tracker FRD  
**Ask operations:** `PROJECT_TRACKER_PROJECTS`, `PROJECT_TRACKER_CREATE`, `PROJECT_TRACKER_COMMAND`  
**Parity implementation commits:** `4b0ab827` and `e55a1776`  
**Last reviewed:** October 11, 2026

## Parity goal

Ask Cozy must not present Project Tracker as a static summary or a dead end. A household member should be able to review the canonical execution record, take the next valid action in context, and receive the same business-rule enforcement as the desktop workflow.

Parity does not mean duplicating desktop components inside the conversation. It means:

- reading and writing the same canonical project records;
- exposing the same consequential actions when they are valid;
- preserving authorization, lifecycle, payment, compliance, evidence, and closeout safeguards;
- requiring review and confirmation before material writes;
- failing closed when the project or selected child record changed;
- linking to a specialized desktop surface only when the conversational renderer cannot safely perform the task.

## Conversational UI and compact-density requirements

Functional parity is necessary but not sufficient. Project Tracker must read as part of the conversation, not as a desktop page embedded inside a message. Its presentation follows the shared Ask Cozy density rules in `ASK_COZY_INLINE_WORKSPACE_FRD.md`, especially the card-whitespace and responsive-width contract recorded in FRD v1.173.

### Response hierarchy

1. Lead with one count-first project judgment: current status, milestone progress, and unresolved issue count.
2. Keep the contract, paid, and remaining amounts together as one compact financial strip or small table.
3. Show execution records immediately after the summary; do not repeat the project title, introductory copy, or section explanation in nested containers.
4. Keep the most likely next action visually dominant. Secondary and destructive actions should not compete with it.
5. Put limitations and record-trust language last, in the standard compact boundary treatment.

### Width and whitespace

- Ordinary project summaries and forms use the centered readable measure, capped at 920 px.
- A genuinely scan-heavy financial table may use the wider artifact measure, but a one-value or two-column fact set must not expand merely to fill 1140 px.
- Cards and rows are content-driven. Do not assign fixed or minimum heights that create empty lower halves.
- Use the shared compact spacing rhythm: tight heading-to-body spacing, compact row gaps, and a single outer boundary. Avoid a pale full-width workflow panel containing multiple separately padded white panels.
- Action regions render only when at least one valid action survives authorization and state filtering. Never reserve an empty footer.
- On wide screens, two or three short sibling records may share a responsive grid row. On narrow screens, they stack without horizontal scrolling.

### Project detail density

- Milestones, payments, change orders, issues, and progress logs use compact record rows/cards rather than full-width dashboard modules.
- Each row shows only the fields needed to decide the next action: name, state, one date or amount, and at most one short supporting line.
- Additional description, evidence, authority status, resolution notes, and material metadata use inline progressive disclosure.
- Keep record actions on the selected row. Do not move the user to a detached action panel or require a second generic prompt.
- Show at most one visually primary action per row. Edit and destructive actions use secondary/quiet treatment or an overflow menu.
- Empty sections are omitted. A single project-level empty state replaces five empty category containers.
- Long collections are bounded. The initial answer should favor the most relevant or recent records and expose continuation rather than rendering an unbounded transcript-sized page.

### Conversational forms

- Short edits remain inline and compact; related fields may use a two-column layout where labels and input sizes remain readable.
- Conditional fields appear only when their governing choice requires them—for example, milestone selection for a milestone-triggered payment or rationale for a not-applicable closeout declaration.
- Do not render the entire completion contract as one visually undifferentiated form. Completion should be progressively grouped into readiness, verification, closeout declarations, and provider/warranty details while remaining one governed workflow.
- Preserve entered values when moving between groups or returning from validation.
- A form must say what will be written and must keep the confirmation boundary visible without duplicating explanatory copy above every field group.

### Conversation continuity

- Successful actions append one concise receipt and refresh the canonical project detail; they do not append both the full proposal and a second full desktop-style result.
- After mutation, retain the user's project context and return to the relevant section or selected record.
- Prefer inline continuation actions such as **Add payment**, **Log progress**, or **Review change order** over generic suggestion chips that restate unrelated Ask Cozy starters.
- The desktop Project Tracker link is a quiet escape hatch for specialized workflows, not the primary answer when Ask supports the action.

### Current presentation status

The shared Ask renderer already supplies the standard readable width, wide-artifact classification, content-driven compact cards, and suppression of empty action footers. The Project Tracker implementation also removes empty execution sections and keeps actions attached to their records.

Project creation and follow-on Project Tracker command forms now use the shared compact workflow renderer. Creation groups project identity, delivery, cost/dates, compliance and first-milestone fields into responsive rows; bounds the long project-type choice set behind progressive disclosure; and removes the nested white field-card treatment. Project command forms use a compact two-column default with long explanations and larger choice sets spanning the available width. Shared capture controls now explicitly render the `NUMBER`, `MONEY` and `LONG_TEXT` schemas used throughout Project Tracker, correcting the previously blank amount and narrative panels while leaving canonical validation and confirmation unchanged.

The compact-UI follow-up is complete. Project execution rows use a responsive one/two/three-column grid, keep one dominant action visible, and place secondary actions in a row-local overflow. The ordinary-answer measure is capped at 920 px while genuinely scan-heavy artifacts retain the 1140 px measure. Dedicated desktop and phone Playwright baselines verify responsive density, action overflow, blank-footer suppression, content-driven card height, width policy, and the absence of horizontal scrolling.

Implemented October 11, 2026: every non-empty execution-record section uses an independent three-record server page with previous/next controls and stable source-execution offsets. Progress logs are fetched from the database at the selected offset instead of serializing the latest 100 entries. Project Tracker rows keep only status plus one date or amount visible; descriptions, evidence, authority state, resolution context, and other secondary metadata open inline through a per-record disclosure. Completion is one governed workflow presented in four progressive groups—readiness, verification, closeout declarations, and provider/warranty—with draft values retained between groups and one final review/confirmation boundary.

## Gaps identified and implementation mapping

| Area | Gap found in Ask Cozy | Implementation | Status |
|---|---|---|---|
| Project list | The answer summarized projects but did not let the user continue into a selected record. | Project rows now open an inline detail backed by `getProjectDetail`, with financial position and grouped execution records. | Implemented |
| Empty state and creation | A user with no project reached a dead end. | `PROJECT_TRACKER_CREATE` captures project type, fulfillment mode, contract amount, dates, permit/HOA decisions, and an initial milestone, then calls canonical `createProject` after confirmation. | Implemented |
| Project lifecycle | Start, pause, resume, and cancel were desktop-only. | Valid lifecycle actions are derived from current project status and execute through `updateProject` or `cancelProject`. | Implemented |
| Project settings | Project identity, contractor details, target date, and approval applicability could not be corrected conversationally. | A prefilled edit form updates the canonical project while retaining permit/HOA rationale validation. | Implemented for conversationally supported fields |
| Milestones | Ask could display milestones but could not manage them. | Manual milestones support create, edit, complete, and delete. Completion retains photo-evidence and source-authority rules. Permit/HOA projections remain read-only. | Implemented |
| Payment schedule | Payment rows were static and users could not build or maintain the schedule. | Users can create, edit, delete, and mark eligible payments paid. Milestone gates, payment holds, and paid-record protections remain in `projectTracker.service`. | Implemented |
| Change orders | Scope and contract changes had no conversational workflow. | Users can propose and edit a change order, record structured scope impact, complete permit/HOA compliance review, and approve, reject, or void it. Contract totals are recalculated only by canonical services. | Implemented |
| Progress evidence | Ask supported only a plain text note. | The log form now supports all canonical entry types, milestone association, existing photo-evidence keys, and material delivery metadata including type, brand, model, color, supplier, and quantity. Entries can be removed after confirmation. | Implemented with evidence-key capture |
| Issues | Users could not record or clear execution problems. | Users can create, edit, and resolve household-controlled issues. Blocking severity forces payment hold behavior through the canonical issue service. Source-controlled issues remain protected. | Implemented for core issue lifecycle |
| Execution alignment | Failed permit/HOA projections had no recovery action in Ask. | Ask reads execution alignment with project detail and offers canonical reconciliation retry when errors exist. | Implemented |
| Completion | The conversation had no governed completion workflow. | Ask reads the live completion checklist before presenting completion. It blocks on unresolved permits, HOA approval, disputes, major/blocking issues, final payment, progress photos, or unverified as-built materials. The confirmation captures verification results, eight closeout declarations, actual cost, provider outcome, ratings, review, and warranty duration, then calls `confirmCompletion`. | Implemented |
| Closeout sharing | Completed projects did not offer the desktop closeout handoff. | Ask creates the same hashed, expiring closeout share record and returns the one-time recipient view while the raw token is available. | Implemented |
| Permissions and confirmation | Inline actions risked bypassing desktop authorization or becoming stale. | Reads remain viewer-safe; mutations require at least `CONTRIBUTOR`. Every write is declared-action-only, re-reads the selected record at proposal and confirmation, and uses the shared confirmation receipt flow. | Implemented |

## Canonical implementation

Ask Cozy does not maintain a parallel Project Tracker model.

- `apps/backend/src/services/ask/handlers/projectTracker.handler.ts` owns conversational presentation, action availability, capture, confirmation proposals, and receipts.
- `apps/backend/src/services/ask/support/projectTrackerConstants.ts` defines declared action identifiers.
- `apps/backend/src/services/ask/support/commandInputs.ts` validates conversational form input before a proposal is created.
- `apps/backend/src/services/projectTracker.service.ts` remains the canonical owner of project, milestone, payment, change-order, log, issue, completion, and closeout writes.
- `apps/backend/src/services/renovationExecution.service.ts` remains the canonical owner of execution alignment and reconciliation.
- `apps/backend/src/services/ask/askAnswerTrustPolicy.ts` explicitly permits only the Project Tracker actions emitted by these operations.
- `apps/backend/src/services/ask/askInteractionCoverageMatrix.ts` and `askOperationSemanticPackages.ts` describe the supported interaction contract.

## Governance and safety retained

- Viewer roles cannot mutate Project Tracker records.
- Mutations are unavailable from free-form routing unless launched by a declared Project Tracker action.
- Paid payments cannot be edited or deleted.
- Milestone-gated payments cannot be marked paid before the milestone is complete.
- Payments on hold cannot be marked paid.
- Source-controlled permit and HOA milestones cannot be edited as manual milestones.
- A change order cannot be approved until its structured compliance impact is evaluated and required authority review is complete.
- Verified completion cannot bypass the live completion checklist.
- Provider-led verified completion requires all four provider ratings.
- Closeout declarations cannot silently omit a category; a not-applicable declaration requires a rationale.
- Share tokens are exposed only in the creation receipt; persisted records retain only the hash.

## Residual differences and explicit follow-up scope

The implemented pass removes the principal dead ends, but several specialized desktop affordances are not yet first-class conversational workflows:

1. **Advanced milestone planning.** Dependency editing, manual ordering, delayed-status override, and template replacement are not exposed in the Ask form.
2. **Advanced issue/dispute workflow.** Escalation, incremental issue notes, and dispute-package generation remain outside the current Ask command.
3. **Project-scoped Material Specs management.** Material delivery metadata is recorded and participates in closeout checks, but creating, verifying, substituting, and maintaining the linked Material Spec remains the Material Specs workflow.
4. **Log archive controls.** Desktop search, date/type filtering, cursor pagination, and room tagging are not reproduced inline.
5. **Alignment diagnostics.** Ask offers retry when reconciliation errors exist, but does not render the complete projection-by-projection diagnostic ledger.
6. **Closeout package inspection.** Ask can complete and share the package, but does not reproduce the complete desktop package preview or share-link management history.
7. **Secondary project metadata.** Home-system selection, service category, and contractor identity linking are not included in the conversational project-settings editor.

Implemented October 11, 2026: Project Tracker capture forms can select recent Home Record documents or upload a new JPEG, PNG, WEBP, or PDF inline for contract records, payment receipts, progress evidence, issue attachments, change-order support and authority evidence, warranty documents, and completion proof. Uploaded files remain property-scoped documents. Confirmation re-authorizes every selected document against the current property, stores document IDs where the canonical model uses document relations, and translates them to storage keys only for legacy key-backed Project Tracker fields.

These are documented gaps, not authorization to weaken their canonical rules. If conversational parity is required for any item, extend the existing Project Tracker operations and services rather than adding a separate Ask-only data path.

## Validation evidence

The implementation was reviewed against:

- the Live Project Execution Tracker FRD;
- every route in `projectTracker.routes.ts`;
- canonical validators and service preconditions;
- Ask trust-policy, command-registry, confirmation, and refresh contracts.

Validation completed during implementation:

- backend TypeScript compilation passed with `npx tsc --noEmit`;
- frontend TypeScript compilation passed with `npx tsc --noEmit`;
- focused Project Tracker presentation tests passed;
- the Project Tracker desktop and phone visual-regression scenarios passed in Chromium and established dedicated screenshot baselines;
- `git diff --check` passed;
- Graphify was updated after the implementation;
- lightweight Ask registry tests were executed.

The registry test run also reported repository-wide certification drift unrelated to this parity implementation: stale hard-coded handler counts and existing Property Brief/Reserve Fund governance findings. No database-backed or browser runtime was configured or claimed.
