# PASS 4 - Gap and Duplication Analysis

## 1. Missing Data (Top 15)

1. **Canonical risk/financial preference profile is missing**
- Repeatedly inferred/captured in tool-specific runs (`riskTolerance`, `cashBuffer`, `deductible`) but not persisted as a shared profile model.
- Evidence: repeated route inputs in `coverageAnalysis`, `riskPremiumOptimizer`, `doNothing`.

2. **Cross-tool assumption memory is missing as a shared entity**
- Assumptions are saved in separate snapshots (`inputsSnapshot`, `inputOverrides`) per feature, not as a reusable unified record.
- Evidence: `CoverageAnalysis.inputsSnapshot`, `RiskPremiumOptimizationAnalysis.inputsSnapshot`, `DoNothingScenario.inputOverrides`, `DoNothingSimulationRun.inputsSnapshot`.

3. **Mitigation evidence linkage is under-captured in live UI flows**
- `evidenceDocumentId` and `linkedHomeEventId` exist in API/model but current optimizer panel updates only status/completedAt.
- Evidence: API supports fields; panel payload sends status + completedAt only.

4. **Mitigation outcome quality is missing**
- Plan items track status and optional estimates, but not actual realized savings/cost deltas tied to completion.
- Evidence: `RiskMitigationPlanItem` has estimate fields and `completedAt`, no realized outcome fields.

5. **Home Savings realized impact is missing**
- Opportunity status can be `APPLIED`/`SWITCHED`, but actual realized savings are not captured as first-class fields.
- Evidence: `HomeSavingsOpportunity` stores estimated savings and status only.

6. **Negotiation case resolution outcome is missing**
- Cases have analysis/drafts, but no normalized final outcome data (accepted amount, concession secured, premium changed, etc.).
- Evidence: `NegotiationShieldCase` lifecycle and artifacts exist; no final resolution model.

7. **Negotiation extraction quality is not first-class**
- Parse warnings/derived context live in flexible payloads, not a stable quality schema for downstream analytics.
- Evidence: parse and manual inputs are stored in `NegotiationShieldInput.structuredData` JSON.

8. **Replay event relevance feedback is missing**
- Home Risk Replay stores run/matches but has no per-match user state model (save/dismiss/acted/relevant).
- Evidence: only `HomeRiskReplayRun` + `HomeRiskReplayEventMatch` and analytics events.

9. **Radar state rationale is weakly structured**
- State transitions allow optional `stateMetaJson`, but no required typed rationale taxonomy.
- Evidence: `updateRadarStateBodySchema` accepts optional `stateMetaJson` only.

10. **Timeline preference persistence is incomplete**
- Timeline mode/filter/replay preferences are mostly local state and localStorage, not server-scoped user preferences.
- Evidence: timeline page persists mode in localStorage (`ctc.timeline.mode`) and keeps other controls local.

11. **Home Score correction capture is missing in current UI flow**
- Backend + API client support corrections, but current Home Score page does not call correction endpoints.
- Evidence: correction methods exist in API client; page uses refresh + tracking only.

12. **Timeline event capture is missing in current timeline UI**
- Backend supports event create/update/attach flows, but current timeline page is primarily read/filter/replay.
- Evidence: timeline page consumes list endpoint; no create/edit flow in that page.

13. **Capital Timeline override capture is missing in current tool UI**
- Override CRUD exists in API/backend but tool client currently captures horizon + rerun only.
- Evidence: override API methods exist; `CapitalTimelineClient` uses run/horizon controls.

14. **Savings account context fields are under-captured in UI**
- API/model support `accountNumberMasked`, `startDate`, `status`; current panel focuses on a narrower subset.
- Evidence: fields present in `HomeSavingsAccountUpsertPayload`; limited panel form fields.

15. **Cross-feature provenance linkage is incomplete**
- Many feature outputs are stored as isolated JSON snapshots without consistent typed references back to shared source facts/documents/events.
- Evidence: repeated snapshot JSON patterns across analysis models.

## 2. Duplication Issues

1. **Asset identity duplication**
- Same concepts exist in `HomeAsset` and `InventoryItem` (manufacturer/model/serial/install context), creating dual truth for core home systems.

2. **Coverage cost duplication across operational and analysis models**
- Insurance/warranty costs appear in canonical policy/warranty models, `HomeSavingsAccount`, and multiple analysis snapshots.
- Models involved: `InsurancePolicy`, `Warranty`, `HomeSavingsAccount`, `CoverageAnalysis`, `RiskPremiumOptimizationAnalysis`, `DoNothing*`.

3. **Deductible duplication across mixed units and domains**
- Deductible appears as `deductibleAmount` and `deductibleCents` in policy context, plus claim and tool-specific snapshots.
- Models involved: `InsurancePolicy`, `Claim`, analysis snapshot JSON.

4. **Task/action concept duplication**
- Similar actionable concepts are spread across `ChecklistItem`, `PropertyMaintenanceTask`, `OrchestrationActionEvent`, `OrchestrationActionCompletion`, and `OrchestrationActionSnooze`.

5. **Event concept duplication by feature silo**
- Timeline events, radar events, and replay events are separate ecosystems with limited shared typing/linkage.
- Models involved: `HomeEvent`, `RadarEvent` + `PropertyRadarMatch/State/Action`, `HomeRiskEvent` + `HomeRiskReplay*`.

6. **Correction and telemetry duplication in generic audit logs**
- Home Score corrections and many feature analytics are both encoded as generic `AuditLog` entries with JSON payloads, not typed feature tables.

7. **Scenario/override duplication across tools**
- Similar “what-if/override” semantics are repeated with different model shapes per feature.
- Models involved: `CoverageScenario`, `DoNothingScenario`, `HomeCapitalTimelineOverride`, `ToolOverride`.

8. **Insurance and warranty mirrored into Home Savings accounts**
- Home Savings auto-creates account rows from canonical insurance/warranty entities, producing parallel plan records.
- Evidence: `ensureAccount` implementations in `homeSavings/categories/insuranceHome.ts` and `warrantyHome.ts`.

## 3. Misaligned Capture Points

### Asked Too Early
1. **Property setup asks broad structural/system details in first creation flow**
- `createProperty` onboarding captures extensive system/safety profile up front, before users receive first-step value feedback.

2. **Home buyer/owner segmentation is asked at signup before property context exists**
- Segment is captured at account creation and may be revised once property/workflow context is clearer.

### Asked Too Late
1. **Mitigation proof capture is effectively late/missing in current UX**
- Evidence links for plan items are supported by backend but not surfaced in current plan-item UI updates.

2. **Home Score correction entry is late/missing in current report UX**
- Correction API exists but no active correction submission flow on current Home Score page.

3. **Capital timeline override capture is late/missing in current UX**
- Override APIs exist, but users only control horizon/rerun in current tool flow.

4. **Event authoring in timeline is late/missing in current page flow**
- CRUD APIs exist, but timeline page is read-first and does not expose direct create/edit capture.

### Asked In Wrong Feature
1. **Risk preference assumptions are captured per tool instead of a shared profile/preference surface**
- Same user concept (`riskTolerance`, cash-buffer logic, deductible posture) is re-asked inside multiple decision tools.

2. **Savings follow-through sits in Home Savings only while action lifecycle exists elsewhere**
- Opportunity status (`APPLIED`, `SAVED`, etc.) is tracked inside savings feature without a shared action/task abstraction.

3. **Feature analytics are captured in generic logging rather than feature-native state models**
- Radar/Replay/Home Score interactions are mostly audit events, limiting first-class behavioral reuse.

## 4. Fragmentation Issues

1. **Tool-specific analysis silos**
- Coverage, Risk Premium, Do-Nothing, Capital Timeline, and Home Savings each persist separate snapshots/runs with little shared typed schema.

2. **No unified “event graph” across timeline, radar, and replay**
- `HomeEvent`, `RadarEvent`, and `HomeRiskEvent` live in separate domains with different semantics and weak cross-linking.

3. **Action lifecycle fragmented across orchestration, checklist, and maintenance**
- Action identity depends heavily on string `actionKey` conventions across multiple models/services.

4. **Preferences fragmented across user/profile/property/tool-local layers**
- Preferences are split among `User`, `HomeownerProfile`, `PropertyClimateSetting`, and local UI storage.

5. **Negotiation outputs are feature-isolated artifacts**
- `NegotiationShieldAnalysis`/`Draft` are not strongly integrated with timeline events, maintenance plans, or savings outcomes.

6. **Savings opportunity lifecycle is feature-isolated**
- `HomeSavingsOpportunity` status progression is not normalized with broader action center completion/snooze patterns.

7. **Audit log overload as a pseudo-feature store**
- Many product signals (corrections + interaction events) are stored generically in `AuditLog`, reducing explicit shared contracts.

8. **Provenance and evidence linkage is inconsistent across tools**
- Some tools support document/event linking, others rely on opaque snapshots, making cross-feature explainability uneven.
