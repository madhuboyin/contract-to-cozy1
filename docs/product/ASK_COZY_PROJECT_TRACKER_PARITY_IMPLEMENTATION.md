# Ask Cozy Project Tracker parity

## Purpose and document ownership

This document records the desktop-to-conversation parity audit for Project Tracker and maps each identified gap to its Ask Cozy implementation.

The authoritative product requirements remain in [`LIVE_PROJECT_EXECUTION_TRACKER.md`](../functional/LIVE_PROJECT_EXECUTION_TRACKER.md). This companion is intentionally separate because it records a channel-specific audit, implementation status, code ownership, validation evidence, and residual differences. New product behavior belongs in the FRD first; this document should then be updated to describe how Ask Cozy exposes that behavior.

**Audit baseline:** desktop Project Tracker routes and the Live Project Execution Tracker FRD  
**Ask operations:** `PROJECT_TRACKER_PROJECTS`, `PROJECT_TRACKER_CREATE`, `PROJECT_TRACKER_COMMAND`  
**Parity implementation commits:** `4b0ab827`, `e55a1776`, then the compact-UI, pagination and completion work (`87f9e746`–`6ab80ee3`), document capture (`7b1cd58a`), milestone planning (`b90bddf8`), disputes and materials (`458a2316`) and the slice close-out (`4a5209b4`)  
**Last reviewed:** October 12, 2026 (status verified against the code; see [Status verification](#status-verification-2026-10-12))

## Parity goal

Ask Cozy must not present Project Tracker as a static summary or a dead end. A household member should be able to review the canonical execution record, take the next valid action in context, and receive the same business-rule enforcement as the desktop workflow.

Parity does not mean duplicating desktop components inside the conversation. It means:

- reading and writing the same canonical project records;
- exposing the same consequential actions when they are valid;
- preserving authorization, lifecycle, payment, compliance, evidence, and closeout safeguards;
- requiring review and confirmation before material writes;
- failing closed when the project or selected child record changed;
- never sending the user to a desktop page: Ask is the product surface (owner decision, 2026-10-10), so a task the conversational renderer cannot safely perform is explained, not linked. The answer-trust policy removes any href that is not an in-conversation Ask link.

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
- Ask offers no link to the desktop Project Tracker, Home Records, or any other desktop page. Where an action produces something the user must carry elsewhere (a closeout recipient link, a dispute package), the receipt states it inline as text.

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
| Project settings | Project identity, contractor details, target date, and approval applicability could not be corrected conversationally. | A prefilled edit form updates the canonical project, home systems, service category, and contractor identity link while retaining permit/HOA rationale validation. | Implemented |
| Milestones | Ask could display milestones but could not manage them. | Manual milestones support create, edit, complete, and delete. Completion retains photo-evidence and source-authority rules. Permit/HOA projections remain read-only. | Implemented |
| Payment schedule | Payment rows were static and users could not build or maintain the schedule. | Users can create, edit, delete, and mark eligible payments paid. Milestone gates, payment holds, and paid-record protections remain in `projectTracker.service`; the service itself refuses to edit or delete a paid payment (`PAYMENT_PAID`), not only the Ask handler. | Implemented |
| Change orders | Scope and contract changes had no conversational workflow. | Users can propose and edit a change order, record structured scope impact, complete permit/HOA compliance review, and approve, reject, or void it. Contract totals are recalculated only by canonical services. | Implemented |
| Progress evidence | Ask supported only a plain text note. | The log form supports canonical entry types, milestone and room association, photo evidence, and material delivery metadata. The archive service supports search, date/type/room filters, cursor pagination, and scoped room validation. | Implemented |
| Issues | Users could not record or clear execution problems. | Users can create, edit, and resolve household-controlled issues. Blocking severity forces payment hold behavior through the canonical issue service. Source-controlled issues remain protected. | Implemented: create, edit, resolve, escalate, append-only notes with evidence, and immutable dispute packages (see the October 12 entry below) |
| Execution alignment | Failed permit/HOA projections had no recovery action in Ask. | Ask renders the projection-by-projection source, status, attempt, error, and last-reconciliation ledger and offers canonical reconciliation retry when errors exist. | Implemented |
| Completion | The conversation had no governed completion workflow. | Ask reads the live completion checklist before presenting completion. It blocks on unresolved permits, HOA approval, disputes, major/blocking issues, final payment, progress photos, or unverified as-built materials. The confirmation captures verification results, eight closeout declarations, actual cost, provider outcome, ratings, review, and warranty duration, then calls `confirmCompletion`. | Implemented |
| Closeout sharing | Completed projects did not offer the desktop closeout handoff. | Ask previews generated closeout metadata and share history and creates hashed expiring links. The receipt shows the full recipient link and its expiry as text for the owner to copy; it is not an Ask link and carries no href. The canonical API lists safe link metadata and revokes active links without exposing token hashes. Ask does not offer revoke. | Implemented (revoke is API-only) |
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
- Share tokens are shown only in the creation receipt, as text; the share-link record retains only the hash. The receipt is part of the stored Ask execution result, so the raw token also lives in that conversation record.
- A paid payment cannot be edited or deleted: the service rejects both (`PAYMENT_PAID`) and the Ask handler also withholds the actions.
- A progress entry is resolved by its own id within the project, so entries outside the latest page can be deleted.

## Residual differences and explicit follow-up scope

No documented Project Tracker parity items remain pending in this implementation slice, with one deliberate exception: closeout share-link revocation is available through the canonical API but not as an Ask action. Future additions should extend the same canonical services and governed Ask workflows rather than introduce an Ask-only data path.

Implemented October 12, 2026: the progress archive accepts bounded note search plus date, entry-type, milestone, and room filters with cursor pagination; new progress entries can be room-tagged only to a room owned by the project property. Project detail renders the full execution-alignment diagnostic ledger. Completed-project detail previews closeout generation/write-back state and safe share-link history, while authenticated closeout endpoints list and revoke links without returning raw tokens or hashes. The conversational project editor now maintains home systems, service category, and linked contractor identity.

Implemented October 11, 2026: Project Tracker capture forms can select recent Home Record documents or upload a new JPEG, PNG, WEBP, or PDF inline for contract records, payment receipts, progress evidence, issue attachments, change-order support and authority evidence, warranty documents, and completion proof. Uploaded files remain property-scoped documents. Confirmation re-authorizes every selected document against the current property, stores document IDs where the canonical model uses document relations, and translates them to storage keys only for legacy key-backed Project Tracker fields.

Implemented October 11, 2026: milestone capture now exposes manual ordering and dependency selection, milestone editing can explicitly override a delayed or blocked state, and planning projects can replace their manual plan with the canonical project-type template. Replacement is refused after completion, progress, or payment history exists and never deletes source-controlled compliance milestones.

Implemented October 12, 2026: manual issues can be escalated, receive append-only timeline notes with property-scoped evidence, and generate timestamped PDF dispute packages. Every generated package is a new immutable version stored in Home Records with a checksum and generation snapshot; the contract reference, milestone history, payment history, change orders, issue history, and selected evidence manifest are compiled into the package.

Implemented October 12, 2026: project detail now reads its linked canonical Material Specs and exposes proposal, maintenance, lifecycle verification, and substitution actions. Ask delegates to `MaterialSpecService`, so property-scoped evidence authorization, permit/HOA attribute checks, exact-product identity, receipt, remaining-material, lifecycle, as-built immutability, and compliance-reviewed change-order requirements remain authoritative.

Implemented October 12, 2026 (status-verification fixes): the "Open Project Tracker" action and the closeout and dispute-package receipt links were removed because the owner rule allows only in-conversation links and the answer-trust policy strips every other href, which could have hidden the one-time share token. The closeout receipt now shows the recipient link and expiry as text and the dispute receipt states that the package was saved to Home Records. `updatePayment` now rejects a paid payment in the service, and log deletion looks the entry up by id within the project instead of scanning the latest 100.

These rules are not authorization to weaken the canonical rules. If conversational parity is required for further items, extend the existing Project Tracker operations and services rather than adding a separate Ask-only data path.

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

## Status verification (2026-10-12)

The implementation status above was re-checked against the code. Code-traced unless marked executed.

**Confirmed:** all 35 declared action ids are handled and allowlisted; viewers are blocked at proposal and confirmation (the role enum is OWNER/CONTRIBUTOR/VIEWER, so "at least CONTRIBUTOR" holds); mutations run only from a declared launch and never from `ASK_REFRESH`; confirmation re-runs the full proposal path and fails with a context-version conflict if the record changed; the change-order, milestone-template, completion-declaration and provider-rating rules behave as described.

**Corrected in this pass:**

| Finding | Correction |
|---|---|
| The "quiet escape hatch" desktop link did not survive the answer-trust policy. | The action and its allowlist entries were removed; the answer no longer claims the link. |
| The closeout share token appeared only in a receipt href to a non-Ask path, which the policy would strip if the confirm path validates it (not established) and which otherwise broke the owner rule; the dispute receipt linked to a desktop page. | The recipient link and expiry are shown as text; the dispute receipt names Home Records. Both allowlist entries were removed. |
| `updatePayment` did not reject a paid payment in the service. | The service now throws `PAYMENT_PAID`; no frontend caller of the API edit existed. |
| Deleting a progress entry resolved the target from the latest 100 entries. | The target is a direct project-scoped lookup. |

**Executed:** `projectTrackerProjectsCapabilitySlice` 19/19 (four new tests cover the share receipt, the dispute receipt, deleting an entry beyond the latest 100, and the service-level paid guard), `projectTrackerCapabilityActivation` 4/4, `startupRegistryValidation` 1/1, backend `npx tsc --noEmit` clean. `askInteractionCoverageMatrix` (144 vs 141 operations) and `askTrustArchitecture` (a 44 vs 41 set of non-retrievable operations) fail on operation-count drift; this pass did not touch the registries and the failures are in the counts, but they were not run on the prior revision to prove they pre-date it.

**Not run:** frontend typecheck, the Playwright baselines, `git diff --check`, the full `tests/ask` suite, and anything against a real database or browser.
