# PASS 5 - Data Reuse and System Synthesis

## Scope and Framing
- This pass is grounded in inspected frontend flows, backend services/routes/controllers, and Prisma models.
- Focus is strictly insight mapping: where data is captured, where adjacent features do not currently consume it, and system-level reuse patterns.

## Top 15 Data Reuse Opportunities

| Data | Captured In | Not Used In | Potential Value |
| --- | --- | --- | --- |
| Room context (`InventoryRoom.type`, `profile`, `heroImage`) | Inventory room creation/update and room scan flows (`inventory.service.ts`, `roomInsights.service.ts`, `roomScan.service.ts`) | Coverage Analysis, Risk Premium Optimizer, Do-Nothing Simulator, Capital Timeline risk weighting | Room-level context can materially improve location-specific risk framing and prioritization consistency across tools. |
| Inventory item room linkage (`InventoryItem.roomId`) | Inventory capture and imports | Most risk/financial tools consume item-level data without room semantics | Adds explainable “where in home” context for risk exposure and action narratives. |
| Maintenance completion evidence (`OrchestrationActionCompletion` + photos + notes) | Action Center completion modal / orchestration completion services | RiskAssessment core scoring, Risk Premium Optimizer driver confidence, Coverage confidence trails | Completed proof history is a high-quality signal for risk reduction confidence and underwriting readiness signals. |
| Maintenance snooze/deferral history (`OrchestrationActionSnooze`) | Action Center snooze flow | RiskAssessment scoring inputs, Financial efficiency confidence, Home Score confidence factors | Deferral cadence indicates latent maintenance risk and potential cost volatility. |
| Maintenance backlog + recurrence details (`PropertyMaintenanceTask`) | Maintenance task CRUD/status flows | RiskAssessment asset scoring model (current core calc does not read task backlog directly) | Backlog and recurrence adherence are leading indicators of future loss likelihood and cost drift. |
| Timeline event rich payload (`importance`, `summary`, `meta`, attachments) | Home Event creation model + timeline APIs (`HomeEvent`, `HomeEventDocument`) | Risk Premium Optimizer and Coverage Analysis currently rely more on claims/maintenance than full event richness | Rich timeline semantics can improve causal explainability in risk and premium narratives. |
| Timeline interaction behavior (view/replay/filter engagement) | Timeline UI controls (client state only) | Behavioral risk/engagement models (no server-side behavioral capture for timeline page) | Behavioral patterns can indicate homeowner attention/risk-awareness trends over time. |
| Home Event Radar user state (`new/seen/saved/dismissed/acted_on`) | Radar detail state updates (`PropertyRadarState`, `PropertyRadarAction`) | Maintenance task prioritization, Home Score trust/engagement factors, Do-Nothing risk tuning | “Saved/acted_on” is direct intent signal that can contextualize perceived risk salience. |
| Home Risk Replay matched-event corpus (`HomeRiskReplayEventMatch`) | Replay generation runs | RiskAssessment baseline scoring and Capital Timeline assumptions | Historical stress-event intensity can calibrate scenario realism beyond static property attributes. |
| Negotiation Shield pricing assessments + findings | Negotiation analysis artifacts (`NegotiationShieldAnalysis`, `NegotiationShieldDraft`) | Financial efficiency modeling, Home Savings opportunity confidence, Home Score financial exposure | Negotiation outputs contain structured cost pressure signals (premium increases, settlement gaps, concession asks). |
| Negotiation case lifecycle outcomes | Negotiation case state and analysis timestamps | Timeline canonical events and downstream financial/risk summaries | Case progression reflects real-world dispute/contract pressure with broad planning impact. |
| Home Savings opportunity lifecycle (`NEW` -> `APPLIED`/`SWITCHED`) | Home Savings status updates (`HomeSavingsOpportunity.status`) | Home Score improvement evidence, financial confidence adjustments, action-center completion alignment | Follow-through state is a concrete indicator of realized financial behavior, not just modeled opportunity. |
| Coverage what-if scenarios (`CoverageScenario`) | Coverage simulate + save scenario flow | Risk Premium Optimizer and Do-Nothing simulator assumptions reuse | Scenario memory reveals user risk posture and preferred tradeoff boundary across tools. |
| Risk mitigation evidence links (`evidenceDocumentId`, `linkedHomeEventId`) | Risk Premium plan item patch API/model | Optimizer UI capture path, Home Score evidence graph, timeline/provenance views | Explicit evidence linkage increases explainability and cross-feature trust in mitigation claims. |
| Home Score corrections (`HOME_SCORE_CORRECTION_*` in `AuditLog`) | Home Score correction APIs + audit entries | Active Home Score page workflows (no correction submit/read flow wired in current page) and source data reconciliation surfaces | Corrections are high-value user truth signals that expose model/data mismatch patterns. |

## High-Leverage Data (Used Across Many Features)
- `Property` baseline attributes (address, type, year, systems/safety): referenced across risk, financial, score, replay/radar matching, maintenance context.
- `InventoryItem` + coverage links (`warrantyId`, `insurancePolicyId`): shared between risk, coverage, do-nothing, timeline/capital tools, and reporting.
- `PropertyMaintenanceTask` state: consumed by maintenance workflows, do-nothing simulation, and Home Score confidence/risk narratives.
- `InsurancePolicy` and `Warranty`: central to coverage, risk-premium optimization, financial efficiency, savings seeding, and negotiation context.
- `HomeEvent`: reused by timeline, capital timeline computations, do-nothing sensitivity, and Home Score story layers.

## Underutilized Data (Captured but Lightly Consumed)
- `InventoryRoom.profile` and `InventoryRoom.type` outside room-specific features.
- `OrchestrationActionCompletion` qualitative fields (notes, provider rating, photos) in risk/financial intelligence.
- `PropertyRadarState` and `PropertyRadarAction` behavioral states outside radar feed UX.
- `HomeRiskReplayEventMatch` details outside replay presentation.
- `NegotiationShieldAnalysis.pricingAssessment` outside negotiation tool surfaces.
- `HomeSavingsOpportunity.status` as a cross-feature “realized action” signal.
- Home Score correction payloads stored in `AuditLog` but minimally surfaced in current Home Score page flow.

## Isolated Data (Feature-Trapped)
- Negotiation Shield artifacts (`NegotiationShieldInput/Analysis/Draft`) are primarily consumed only within negotiation workflows.
- Radar interaction telemetry and replay telemetry are primarily audit events with limited downstream product reads.
- Coverage scenario snapshots remain inside coverage-intelligence flows.
- Capital timeline overrides are feature-local assumptions with limited evidence of reuse by other planning engines.
- Timeline UI behavioral state (replay/filter interactions) remains client-local and non-shared.

## Cross-Feature Opportunity Signals

### Room Data Reused Across Tools
- `InventoryRoom.type/profile` and `InventoryItem.roomId` are captured in inventory and room intelligence flows, but downstream risk, coverage, and simulation tools mostly operate without room-context weighting.
- This leaves location-specific context underrepresented in multi-tool prioritization and explainability.

### Maintenance -> Risk
- Maintenance tasks are reused in some downstream features (notably Do-Nothing and portions of Coverage), but core risk scoring does not consistently consume broader maintenance adherence and deferral signals.
- Action completion quality data (photos/notes/provider detail) is captured yet lightly represented in risk-confidence narratives.

### Negotiation -> Financial Intelligence
- Negotiation analyses capture pricing pressure, claim/settlement posture, and draft leverage context.
- These outputs are largely isolated from financial efficiency and savings intelligence surfaces that model household cost posture.

### Timeline -> Behavior Patterns
- Timeline event records are rich (`importance`, `summary`, attachments), while timeline UI engagement patterns remain mostly client-side behavior without broad server-level reuse.
- Replay/radar behavior states exist in adjacent domains, but the combined event-attention pattern is not widely consumed by planning and scoring surfaces.

## Top 10 System Observations

1. **Strength: strong property-centric identity model**
- Most features key by `propertyId`, which creates a reliable join spine for cross-feature synthesis.

2. **Strength: broad capture surface with rich event and artifact models**
- The platform captures structured operational data (tasks, events, policies, savings opportunities, analyses) plus narrative/JSON artifacts.

3. **Strength: asynchronous intelligence snapshots are consistent across tools**
- Multiple tools persist run snapshots (`inputsSnapshot`/`outputsSnapshot` patterns), preserving historical decision context.

4. **Weakness: repeated assumption capture across decision tools**
- Similar risk-financial assumptions are re-entered in coverage, premium optimization, and do-nothing flows with limited shared memory.

5. **Weakness: heavy JSON snapshot usage reduces shared semantic contracts**
- Flexible JSON supports speed but fragments typed reuse and complicates cross-feature comparability.

6. **Weakness: behavioral signals are often write-only telemetry**
- Many interaction events are logged to `AuditLog` without clear product-level readback patterns.

7. **Weakness: action lifecycle is split across overlapping abstractions**
- Checklist, maintenance tasks, orchestration events/completions/snoozes coexist with partial overlap, creating multi-source truth zones.

8. **Leverage point: room-level data quality is high but mostly local**
- Room metadata and room scan outputs have broad contextual value beyond room-specific features.

9. **Leverage point: negotiation and savings outcomes carry financial-intelligence signal**
- These features hold concrete price pressure and follow-through behavior that can enrich risk/score/financial context.

10. **Leverage point: timeline + maintenance + replay together form a latent behavior-risk graph**
- Combined historical events, maintenance adherence, and stress-event replay already provide a strong cross-feature insight substrate.
