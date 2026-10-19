# Ask Cozy Sole Homeowner Interface — Implementation Plan

**Status:** In progress
**Date:** October 18, 2026  
**Governing requirements:** `docs/product/ASK_COZY_SOLE_HOMEOWNER_INTERFACE_FRD.md`

**Implemented Phase 0 foundation:** The code-owned route-retirement registry, startup validation, generated Ask-operation inventory, generated homeowner-route inventory, deployed frontend/API build-contract diagnostics, and production Ask discovery smoke are implemented. The inventory currently marks no route retired; certification evidence and exact successor mappings remain future work.

**Phase 1 complete:** Stable Home, Work, Record, Saved, and History routes plus keyboard-operable desktop/mobile destination navigation are implemented. The shell exposes the selected-property switcher, global command search, notification inbox/count, profile/privacy/settings, notification settings, and sign out on every destination. Destination links retain authorized conversation and launch context; existing draft, selected-entity, layout, and scroll restoration retain workspace state across destination changes and browser navigation. “Needs you” lives on Work and links there from Home without changing canonical continuation or cancellation behavior. Shared semantic layout primitives, compact collection states, measured composer scroll spacing, and validated versioned contracts for all five destinations and every registered specialized grouped-list presentation are implemented. The complete canonical Work projection remains Phase 3; Record and Saved remain explicit foundation states until Phases 2 and 4.

**Phase 2 slice 1 (Record index) implemented, uncommitted:** `governance/askRecordSectionRegistry.ts` declares all sixteen FR-REC-002 sections (buyer and seller records are separate lifecycle sections). Each names its existing Ask read and command operations; its role floor is derived as the strictest read floor, and its lifecycle applicability comes from the read operation's audience policy. `askRecordIndex.service.ts` composes `AskRecordIndex` from the canonical property-record overview and serves `GET /api/ask/record-index`. Every section is always listed with a state: `AVAILABLE`, `UNAVAILABLE` (reader not connected, provider failed, or lifecycle context required), `NOT_APPLICABLE`, or `RESTRICTED`. Seven sections have counts today (property facts, rooms, inventory, documents, warranties, timeline, household access); the other nine report `READER_NOT_CONNECTED` until their collection readers exist. The Record destination renders a compact, scannable two-column index on wide screens. No Prisma change; no export; no collection paging; no route retired. "Browse home record" naming is unchanged until Phase 2 exits.

**Phase 2 slice 1 — acceptance items NOT executed (no browser, real data, or manual accessibility run):**
- Real-database counts and freshness for the seven connected sections, and viewer/contributor/owner role behavior against a live household.
- Browser layout at 1280 × 720, 1440 × 900, 1920 × 1080, 390 × 844, and 360 × 800 (only class-level assertions exist in Jest).
- Screen-reader, keyboard focus order, zoom, and reduced-motion audit of the Record index.
- That the `question` launch from a row opens the intended Ask answer.

**Phase 2 slice 2 (rooms paging) implemented:** the generic collection contract `AskRecordCollectionPage` (FR-REC-003: authoritative total, delivered count, keyset `nextCursor`, `truncated` only when a cursor exists, sort, applied search/filters, filter options) is served by `GET /api/ask/record-sections/:sectionId`, which reauthorizes on every call (account eligibility, current household role, registry role floor, lifecycle applicability). Rooms is the first connected reader (`askRecordCollections.service.ts`; search by name, floor filter including "not recorded", limit 25 default / 50 max). The registry's `pagedCollection` flag is tested against the connected readers. The Record destination opens a section in place at `?section=rooms` with search, filter, total, and "Show more (N remaining)". The Ask rooms answer's 50-room cap is unchanged; its complete continuation is now this Record collection. Not executed: real-database paging and ordering (Postgres collation vs. the keyset comparison), the route's HTTP error mapping, the row's `Show me the items in my <room>` launch question, and browser layout.

**Open floor note:** no Ask operation is dedicated to reading household access, so `household-access` uses `PROPERTY_SUMMARY` (VIEWER), which already carries the household count in the same overview. The index returns only the member count, never names or emails. Confirm this is the intended boundary before the household detail slice.

## 1. Delivery principles

1. Reuse canonical services and existing Ask execution safeguards.
2. Add platform contracts before domain-specific presentation variants.
3. Build structured destinations inside Ask; do not serialize whole databases into chat.
4. Keep legacy homeowner routes until their individual retirement gate passes.
5. Admin pages, multi-property aggregation, and full household administration are deferred.
6. Avoid a flag maze: route retirement is evidence-based and performed one workflow at a time.
7. No schema compatibility layer is required solely for nonexistent production users, but all real authorization, integrity, confirmation, and retention constraints remain.

## 2. Target frontend structure

```text
components/ask/shell/
  AskShell.tsx
  AskPrimaryNavigation.tsx
  AskUtilityBar.tsx
  AskPropertyIdentity.tsx
  AskDestinationBoundary.tsx

components/ask/home/
  AskHome.tsx

components/ask/work/
  AskWork.tsx
  WorkFilters.tsx
  WorkItemDetail.tsx

components/ask/record/
  AskRecord.tsx
  RecordSectionNav.tsx
  RecordCollection.tsx
  RecordDetail.tsx

components/ask/saved/
  AskSaved.tsx
  ArtifactList.tsx
  ArtifactDetail.tsx

components/ask/history/
  AskHistory.tsx

components/ask/search/
  AskGlobalSearch.tsx

components/ask/notifications/
  AskNotificationInbox.tsx

components/ask/composer/
  AskComposer.tsx
  UploadIntake.tsx
  CandidateReview.tsx
```

Existing `AskWorkspace`, execution cards, capture cards, block renderers, history hooks, and detail components should be migrated incrementally behind the shell rather than rewritten.

## 3. Target backend contracts

### 3.1 Destination projections

Add dedicated read contracts rather than manufacturing destination state from conversation transcripts:

- `AskHomeProjection`
- `AskWorkProjection`
- `AskRecordIndex`
- `AskRecordCollectionPage`
- `AskSavedArtifactPage`
- `AskGlobalSearchResultPage`
- `AskNotificationPage`

Every contract includes `contractVersion`, `propertyId`, `generatedAt`, partial-provider status, and authorization-safe data.

### 3.2 Registries

Add:

- `askRecordSectionRegistry.ts`
- `askWorkProviderRegistry.ts`
- `askArtifactTypeRegistry.ts`
- `askSearchProviderRegistry.ts`
- `askNotificationContinuationRegistry.ts`
- `askRouteRetirementRegistry.ts`
- `askMutationImpactRegistry.ts`

Startup validation shall reject duplicate ids, missing owners, invalid routes/operations, unknown artifact types, and retirement claims without evidence.

### 3.3 Persistence

Before changing Prisma, complete schema review against existing output artifacts, decision threads, Ask executions, projects, reports, and document models. Prefer references to canonical entities over duplicated payloads.

Probable new persistence, subject to that review:

- a shared saved-artifact envelope or artifact-index projection;
- notification read/mute metadata if current models cannot support the inbox;
- upload-intake records for unscoped media and candidate-review lifecycle;
- route-retirement evidence records only if generated source evidence cannot remain code-owned.

Do not create migration scripts; update Prisma and run generation when a schema change is approved.

## 4. Phase 0 — Baseline and retirement inventory

### Deliverables

1. Generate an authoritative operation inventory from `ASK_OPERATION_DEFINITIONS`.
2. Generate an authoritative customer-route inventory from frontend routes.
3. Create `askRouteRetirementRegistry.ts` with states:
   - `LEGACY_ACTIVE`
   - `ASK_PARITY_IN_PROGRESS`
   - `ASK_CERTIFIED`
   - `STRUCTURED_SURFACE_RETAINED`
   - `RETIRED`
4. Map each homeowner route to owning domain, Ask operations, missing reads/writes, successor destination, deep-link rule, and evidence tests.
5. Add deployed client/API build diagnostics and a production discovery smoke test.
6. Rename the present “Complete home record” to “Browse home record” until Phase 2 exits.
7. Add its discovery entry to Suggested Next Actions with registered outcome identity and deduplication.

### Primary files

- `apps/backend/src/services/ask/askOperationRegistry.ts`
- `apps/backend/src/services/ask/askCapabilityBindings.ts`
- `apps/backend/src/services/ask/suggestedActions/*`
- new `apps/backend/src/services/ask/governance/askRouteRetirementRegistry.ts`
- frontend build diagnostics and smoke scripts

### Exit criteria

- No manually maintained operation count in product documentation.
- Every homeowner route has an explicit disposition.
- Production smoke proves My Home Record, More ideas, and Suggested Next Actions expose the expected record entry.
- No route is marked retired.

## 5. Phase 1 — Five-destination shell

### Deliverables

1. Introduce stable routes/views for Home, Work, Record, Saved, and History under the Ask shell.
2. Replace the history-dominant desktop rail with primary destination navigation.
3. Retain conversation search, pin/archive/restore/delete, and session URLs in History.
4. Move “Needs you” from the history rail into a complete Work preview and destination.
5. Add utility bar entry points for global search, notifications, profile/settings, selected property, and sign out.
6. Make mobile use bottom navigation and destination sheets where appropriate.
7. Preserve composer drafts and active entity/workspace context across destination changes.

### Reuse

- `AskWorkspace.tsx`
- `ConciergeHome.tsx`
- `ConversationHistoryNav.tsx`
- `CalmLanding.tsx`
- `ExecutionCard.tsx`
- `CaptureCards.tsx`
- existing mobile history/context sheets

### Exit criteria

- Destination navigation is keyboard and screen-reader operable.
- Refresh and back/forward retain destination and focused entity.
- Home is useful with no prompt.
- History behavior has no regression.
- No domain workflow is retired yet.

### Presentation contracts and shared quality system

Build presentation governance into the shell before migrating more workflows:

1. Define shared semantic layout primitives for common content shapes: `AskReadingMeasure`, `AskWorkspaceMeasure`, `AskCompactRow`, `AskDefinitionGrid`, `AskCollection`, `AskAdaptiveGrid`, and `AskFocusedPanel`. These are a reusable baseline, not the complete Ask visual language.
2. Give each structured destination and specialized result family a versioned presentation contract describing its homeowner job, essential regions, responsive priorities, state variants, and acceptance criteria.
3. Map generic response patterns to shared primitives. A grouped list must default to compact rows; card decks require rich or independently actionable items. Do not infer “card” merely because an object has a title and action.
4. Preserve dedicated typed renderers when the domain benefits from a custom composition. Environment Report, planners, timelines, scenario comparisons, maps, and similarly data-rich experiences may combine charts, signals, controls, and narrative in a tool-specific layout rather than inheriting collection-row rules.
5. Remove fixed/minimum content heights from variable repeated items. Keep minimum sizes only for accessible controls, skeleton stability, media/visualization geometry, or another need documented by the presentation contract.
6. Place row-level actions beside the row identity/status on wide screens and below the content only when wrapping requires it.
7. Make workspace width content-aware: prose keeps a readable measure; records, tables, timelines, planners, comparisons, indexes, and reports use the width and composition defined by their presentation contract.
8. Measure the sticky composer and navigation overlays and derive scroll padding from their actual height. Do not use large static spacer blocks.
9. Add compact zero, unavailable, and not-applicable variants to collection presentations with explicit add/retry/explanation actions. Specialized tools define state treatment within their own composition.
10. Remove layout-mode controls from operations that do not have two genuinely useful renderings. Persist valid choices and make Auto select the most suitable accessible default for that presentation family, which is not always the densest one.

Shared quality invariants and a tool-specific presentation contract are part of Phase 1 exit criteria for every migrated screen. Visual uniformity is not an exit criterion.

### Phase 1 completion evidence

- `AskLayoutPrimitives.tsx` owns the reading/workspace measures, compact row, definition grid, collection, adaptive grid, focused panel, and compact empty/unavailable/not-applicable states.
- `presentationContracts.ts` is the versioned registry for the five destinations and all registered specialized grouped-list patterns; module validation rejects duplicate or incomplete contracts.
- Generic grouped lists use the shared collection primitive and compact empty state. Record, Saved, and Work foundations declare their destination contracts; bespoke renderers retain their specialized composition.
- The pending-Ask reader no longer applies the former three-item display cap, so the Work destination does not silently hide authorized “Needs you” requests.
- Destination URLs preserve property, session, execution, return, origin, and launch context. Existing result-view session storage restores focused entity, filters/layout, disclosure, and scroll state after authorized session hydration.
- ResizeObserver measurement drives composer-relative scroll padding and the “Jump to latest” offset; the fixed composer offset was removed.
- Focused shell, navigation, History lifecycle, destination continuity, result restoration, primitives, contract registry, and measurement tests cover the Phase 1 code gates. No domain workflow is retired by this phase.

## 6. Phase 2 — Complete Record workspace

### Backend slices

1. Implement `askRecordSectionRegistry` with owner, applicability, role floor, collection reader, detail reader, supported commands, export eligibility, and freshness source.
2. Replace the fixed seven-row property-summary index with `AskRecordIndex`.
3. Add collection paging and normalized filters to rooms, inventory, documents, warranties, timeline, inspections, permits, projects/renovations, incidents/claims, coverage, financing, and lifecycle-specific records.
4. Keep Property Context completeness as the governed facts section.
5. Add a read-only household-access summary; defer role administration.
6. Add scoped export using existing home report/export infrastructure where authoritative.

### Frontend slices

1. Record section navigation with counts and degraded states.
2. Generic pageable collection shell.
3. Reuse existing bespoke inline details for rooms, inventory, documents, warranties, timeline, inspections, claims, seller items, and capital items.
4. Add source/freshness/audit presentation.
5. Add correction and state actions only when declared by the server.
6. Add export review and receipt.
7. Replace the tall one-column section-card stack with the shared compact collection primitive; allow a richer preview only when a section has enough content to justify it.
8. Compose profile, section navigation, and completeness into one responsive workspace: a wide scannable index on desktop, a single compact list on mobile, and no duplicated explanatory bands.

### Exit criteria

- “Complete Home Record” satisfies FR-REC-001 through FR-REC-007.
- No section silently disappears on provider failure.
- Every capped collection has a complete continuation.
- Viewer/contributor/owner access tests pass.
- Export content and exclusions are tested.
- The Record index satisfies FR-IA-005 through FR-IA-010 and FR-REC-008 at the certified viewports.

## 7. Phase 3 — Work workspace

### Backend slices

1. Implement providers for Ask pending executions, projects, guidance journeys, decision threads, incidents, claims, repairs, renovation cases, monitors, and queued jobs.
2. Normalize lifecycle states without replacing canonical domain states.
3. Batch load counts and previews; avoid N+1 domain calls.
4. Resolve exact resume targets and current-version tokens.
5. Add stale/deleted/access-lost recovery mapping.

### Frontend slices

1. Needs you, Active, Waiting, Scheduled, Completed, and Archived views.
2. Work-type and status filters.
3. Inline current detail and primary next action.
4. Exact resume into conversation, confirmation, or structured workspace.

### Exit criteria

- Every pending confirmation remains discoverable outside its conversation.
- Archiving a conversation does not orphan canonical work.
- No preview cap hides work without a complete list.
- Resume reauthorizes and rereads current state.

## 8. Phase 4 — Saved artifacts

### Deliverables

1. Inventory existing artifact-like domain models and output blocks.
2. Approve shared artifact envelope and per-type version rules.
3. Build Saved projection without copying sensitive payloads into a generic table.
4. Support browse, filter, search, archive, reopen, freshness, supersession, export, and sharing where allowed.
5. Convert pinning to a presentation preference; it shall not create a saved artifact implicitly.

### Exit criteria

- Material comparisons and decisions retain prior versions.
- Deleted/access-lost sources degrade honestly.
- Artifact search and reopen work across sessions.
- Retention and visibility inherit from the canonical owner.

## 9. Phase 5 — Global search

### Deliverables

1. Define provider query/result contracts with bounded latency.
2. Add providers for Record, Work, Saved, History, and capabilities.
3. Enforce authorization and visibility at query time.
4. Group results by type with property, freshness, and status.
5. Add partial-provider failure and telemetry without storing query text in analytics.

### Exit criteria

- Search opens exact canonical destinations.
- Sensitive snippets never leak across roles or properties.
- One provider failure does not blank the response.
- Conversation search remains available through the federated surface.

## 10. Phase 6 — Notifications

### Deliverables

1. Add unified homeowner inbox projection over current notifications.
2. Map every supported notification to current property/entity/execution context.
3. Add read/unread, dismiss, mute/snooze, and category preferences.
4. Add channel preferences and consent disclosures.
5. Open canonical current state rather than replaying notification copy.

### Exit criteria

- Every enabled homeowner notification has a tested continuation.
- Revoked access and deleted target recovery pass.
- Cooldown, quiet-hour, and consent policies remain server-owned.

## 11. Phase 7 — Multimodal composer and intake

### Deliverables

1. Unify text, voice, image, camera, document, paste/drop, and entity references.
2. Introduce unscoped upload intake with malware/type/size/privacy checks.
3. Classify uploads into typed candidate workflows.
4. Present page/region evidence and candidate confidence.
5. Reuse canonical capture and confirmation paths for persistence.
6. Add retention and model-processing disclosures.

### Exit criteria

- Inspection PDF, policy document, receipt/invoice, and appliance-label photo reference journeys pass.
- Original media and extraction candidates retain provenance.
- Rejected candidates never write canonical state.
- Equivalent non-camera and non-voice paths exist.

## 12. Phase 8 — Reconciliation platform

### Deliverables

1. Replace ad hoc mutation sibling lists with validated `askMutationImpactRegistry` entries.
2. Cover destination projections, record sections, work indexes, artifacts, notifications, suggestions, and visible executions.
3. Refresh or mark stale after writes.
4. Keep canonical command success distinct from refresh failure.
5. Add cross-domain contract tests for every registered mutation.

### Exit criteria

- Every Ask mutation has a validated impact declaration.
- No successful write leaves an affected visible result silently current.
- Refresh failures produce recoverable stale states.

## 13. Phase 9 — Accessibility, reliability, and performance certification

### Deliverables

1. Browser tests for all FRD acceptance journeys.
2. Keyboard, screen reader, zoom, contrast, reduced motion, and live-region audits.
3. Mobile Safari/Chrome acceptance.
4. LLM-unavailable and provider-partial drills.
5. Offline/reconnect and draft recovery tests.
6. Numeric latency and payload budgets per destination.
7. Production-like database tests for authorization, paging, reconciliation, export, and retention.

### Exit criteria

- No P0/P1 accessibility defect in a retirement candidate.
- Performance budgets approved and measured.
- Critical deterministic journeys pass with remote generation disabled.
- Operational runbooks exist.

## 14. Phase 10 — Workflow retirement

### Process

1. Select one route family, starting with maintenance.
2. Complete its route-registry evidence packet.
3. Run browser/database/accessibility/deep-link certification.
4. Map old links to the exact Ask destination/workspace/entity.
5. Remove duplicate UI logic only after the successor is live and measured.
6. Repeat for records/documents, then other certified families.

### Retained structured surfaces

Record tables, complex comparisons, audit views, exports, and bulk-management surfaces may remain structured components inside Ask. Retirement removes the parallel product navigation, not useful interaction forms.

## 15. Deferred phases

After the sole-property homeowner shell is certified:

- admin pages may be consolidated separately without being constrained to homeowner navigation;
- multi-property projections may add portfolio attention, work, search, and comparison with an approved authorization/aggregation contract;
- household administration may add member browse, role changes, removal, ownership transfer, invitations, and activity audit.

## 16. Testing strategy

### Static and contract

- Registry validation.
- Contract schema parsing.
- Operation/route/artifact/search-provider parity generation.
- Authorization floors and visibility.
- Mutation impact completeness.

### Unit

- Projection composition and partial-provider behavior.
- Filtering, sorting, pagination and stable cursors.
- Artifact versioning and staleness.
- Search grouping and redaction.
- Notification continuation.

### Integration

- Canonical reads/writes against a database.
- Reauthorization and role changes.
- Idempotency, conflicts, races and unknown outcomes.
- Cross-domain reconciliation.
- Export and retention.

### Browser

- Five-destination navigation.
- Full acceptance journeys.
- Back/forward, refresh and deep links.
- Mobile sheets/composer.
- Accessibility and focus restoration.
- Presentation-contract snapshots at 1280 × 720, 1440 × 900, 1920 × 1080, 390 × 844, and 360 × 800 for every destination and registered structured response family.
- Bounding-box assertions appropriate to the declared presentation family: compact-row height for collections; essential-region visibility and visualization integrity for custom reports; unexplained trailing space, content hidden by sticky overlays, and page-level horizontal overflow for both. Assertions shall permit wrapped/localized/zoomed content to grow.
- Populated, zero-count, unavailable, loading, error, and unusually long-content fixtures so visual checks cannot pass only on ideal data.

Quality checks shall fail on systemic wasted space, not on intentional whitespace or space required for a visualization, comparison, decision, or narrative hierarchy. Snapshot review must use the tool's presentation contract to verify comprehension, scanability, grouping, action proximity, touch targets, focus order, reflow, and essential content visibility. It shall not compare every tool to a single card/list template.

### Production smoke

- Build compatibility.
- Core discovery entries.
- One deterministic read.
- One safe write proposal without confirmation.
- Record/Work/Saved/Search/Notification projection health.

## 17. Documentation maintenance

On implementation:

- update `ASK_COZY_PRIMARY_INTERFACE_REDESIGN.md` to point to this FRD;
- generate operation and route counts rather than writing constants;
- update `ASK_INLINE_COVERAGE.md` from certification evidence;
- record per-route retirement decisions in the registry, not scattered prose;
- keep domain FRDs authoritative for business behavior.

## 18. Recommended first implementation increment

The first code increment should be Phase 0 plus the Phase 1 shell skeleton:

1. route-retirement registry and generated inventory;
2. deployed build diagnostics and discovery smoke;
3. rename “Complete home record” to “Browse home record”;
4. add it to Suggested Next Actions;
5. introduce five destination routes and navigation while initially embedding current Home and History behavior;
6. move the two-item “Needs you” preview toward the Work destination without changing canonical execution behavior.

This increment is reversible, establishes the target shell, fixes the current naming/deployment gaps, and creates the evidence system needed before any homeowner route is removed.
