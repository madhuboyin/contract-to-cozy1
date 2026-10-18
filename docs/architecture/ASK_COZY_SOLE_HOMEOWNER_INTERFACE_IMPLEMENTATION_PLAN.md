# Ask Cozy Sole Homeowner Interface — Implementation Plan

**Status:** Proposed execution plan  
**Date:** October 18, 2026  
**Governing requirements:** `docs/product/ASK_COZY_SOLE_HOMEOWNER_INTERFACE_FRD.md`

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

### Exit criteria

- “Complete Home Record” satisfies FR-REC-001 through FR-REC-007.
- No section silently disappears on provider failure.
- Every capped collection has a complete continuation.
- Viewer/contributor/owner access tests pass.
- Export content and exclusions are tested.

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
