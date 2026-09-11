# Ask Cozy Conversational Operating Model & Architecture Audit

**Type:** Audit only — no implementation changes made or recommended as concrete designs.
**Scope:** Ask Cozy end-to-end, supporting C2C architecture, and readiness to evolve into a message-first homeowner interaction model.
**Method:** Direct code reading plus five parallel research passes and one empirical routing-trace pass (executed the real routing modules against the five representative messages — see §17). All claims below are cited `path:line` against the working tree at commit `0920999a` unless noted as inferred.
**Note on existing docs:** `apps/CLAUDE.md` describes `prisma/schema.prisma` as "~102KB, 30+ models." The real file is **23,786 lines / ~753KB / 515 models / 728 enums**. That doc is stale; this audit trusts the schema itself, not the doc.
**Prior art found mid-audit:** `docs/architecture/C2C_INTELLIGENCE_AGENTIC_EVOLUTION_ARCHITECTURE.md` ("Stage 3", 1659 lines) already specifies an Intelligence Envelope, an Agent Contract, a Decision-Platform-reuse pattern, and a Specialist Agent Pattern (HVAC repair/replace as the reference implementation). Per prior work in this repo, Phases 0–4 of its implementation plan are shipped. This audit independently rediscovered that HVAC decisioning is the one domain where the full service→registry→orchestrator→specialist-agent chain is real and live — which corroborates that document rather than contradicting it. Where this audit's recommendations touch the same ground (skills/capability layering, proactive dispatch), they are named as extensions of Stage 3's direction, not a competing proposal.

**Revision note:** an external technical review of the initial draft identified five issues, all verified directly against the current code (not taken on faith) and corrected in this revision: (1) the `GroundedAskProposal` confirm path for `ADD_FACT`/`CORRECT_FACT` is not transactional across its status/capture/artifact writes and does not use `AskConfirmationReceipt` — confirmed by reading `groundedAsk.service.ts:130-179`; (2) "disconnected by exactly one line" understated the work — `groundedGuidanceResult` never reads `answer.proposals`, and no fact key or proposal kind exists for a cost/date/provider event — confirmed by reading `askOrchestrator.service.ts:5608-5651` and the full `capturePropertyFact.ts` catalog; (3) §17's routing-vs-downstream claims are now separated into "executed" (routing stage, independently re-run — see reproduction block below) and "code-traced" (downstream text/data-liveness, read from source, not run against a live database); (4) the "radar is invisible to Ask" claim is narrowed to the demonstrated component-scoped-query defect after confirming `intelligenceEnvelopeQuery.service.ts:507`'s domain filter is a no-op when no domain list is supplied; (5) §16's provenance discussion now separates source, capture channel, extraction confidence, and confirmation state as independent axes, and §24 no longer poses a confidence-based confirmation bypass as an open option, since `docs/product/AI_HOME_CONCIERGE_ASK_TRUST_ARCHITECTURE_ADDENDUM_FRD.md` §18 already requires confirmation for every material write unconditionally. The generalizable verification checklist derived from this review is now `docs/architecture/AUDIT_METHODOLOGY.md` — apply it to any future audit of this codebase before publishing.

**Revision note 2:** a second review pass found five more issues in the first revision, all independently verified against the code before this correction: (1) §7 incorrectly claimed command writes never parse message text for field values — `extractMaintenanceTaskInput`, `extractMaintenanceCompletionInput`, and `extractHouseholdInvitationInput` (`askOrchestrator.service.ts:586,859,1017`) do real, bounded, regex-based extraction of title/date/recurrence/cost/email/role; the gap is *general* open-vocabulary extraction, not extraction as a category, and §9/§23's "structured extraction" assessment moved from 0 to 1 accordingly; (2) §8's provenance recommendation still proposed a lower-ranked `AI_CHAT` source type after §16 had already established that source and channel must stay separate — reconciled across §8, the matrix, and Opportunities, and added a caution against repurposing `PropertyFactEvidence.confidence` for extraction uncertainty without checking its existing consumers; (3) §11 claimed `GROUNDED_GUIDANCE` fallback answers get "zero next-action suggestions" — false; `groundedGuidanceResult` always returns `suggestions: [answer.nextAction]` with a non-empty string; the real limitation is that it's generic and not capability-derived, corrected in §11 and in §23's readiness table; (4) §6/§18/§20/§23/the Final Question treated three routing misses as proof of a structural inability to understand novel phrasing — revised to distinguish demonstrated coverage/calibration gaps (Scenarios D, E — an operation exists but wasn't matched, not shown to be unfixable with more patterns) from the one genuinely structural gap (Scenario C — no catalog operation exists for the fact shape at all, regardless of phrasing), and to state a new extraction stage as one possible remedy rather than a demonstrated necessity; (5) the routing reproduction pointed at a `trace.ts` that was never checked into the repo — its complete contents are now embedded directly in §17, independently re-run to confirm the same output.

---

## 1. Executive Summary

Ask Cozy is not a thin chatbot bolted onto C2C — it is a **10,150-line orchestrator** (`apps/backend/src/services/ask/askOrchestrator.service.ts`) sitting on top of a deterministic-first routing engine, a ~25-operation closed command registry for writes, a structured ~20-block presentation contract, and direct calls into several real domain services (refinance radar, sell/hold/rent, HVAC repair/replace decisioning, guidance journeys). It is considerably more architecturally mature than "Ask Cozy = a chat UI over an LLM."

But it is built for a different interaction model than the one this audit evaluates against. Today's Ask Cozy is a **closed-intent command console with a natural-language front end**: every answer and every write must match one of a fixed catalog of ~40 pre-registered operations via regex-then-embedding classification. Once an operation is matched, several write operations (maintenance task creation/completion, household invitations) do parse the message for a fixed, small field set via regex — real, bounded extraction, not nothing (§7). But free text that doesn't match a known intent — a completed-action statement ("I replaced my roof..."), a hedge ("I'm thinking about selling next year"), a causal question ("is my roof at risk because of the storms...") — falls through to a single generic fallback (`GROUNDED_GUIDANCE`) whose one LLM call is contractually forbidden from inventing content and can only select among facts *already recorded* in structured tables. Neither path extracts an open-ended, previously-unregistered fact from the user's own words into the property's persistent record.

The single biggest concrete finding, **corrected after review**: the write path for turning a stated fact into a persisted, provenance-tagged record is real and mostly built, but it is not a one-line fix and it has its own unresolved defect. `answerGroundedAsk` hardcodes `proposals: []` (`groundedAsk.service.ts:115`), so nothing today populates a proposal from the message — but even if it did, `groundedGuidanceResult` (`askOrchestrator.service.ts:5608-5651`) never reads `answer.proposals` when building response blocks, so a populated proposal still would not reach the user without a second change. And the confirm path itself (`confirmGroundedAskProposal`, `groundedAsk.service.ts:130-179`) is not transactionally sound: for `ADD_FACT`/`CORRECT_FACT`, the proposal-status update, the `capturePropertyFact` write, and the `GroundedAskArtifact` creation are three separate statements, not one transaction (contrast with the `CREATE_TASK`/`COMPARE_OPTIONS`/`UPLOAD_EVIDENCE` branch three functions down, which *is* wrapped in `prisma.$transaction`). If `capturePropertyFact` succeeds but artifact creation then fails, the catch block resets the proposal to `PENDING` (`:172-178`) while the fact write has already committed — a retry calls `capturePropertyFact` again and can create a second `PropertyFactEvidence` row for the same claim. This path also never touches `AskConfirmationReceipt`, unlike the domain-command registry. Separately, the roofing example in this audit's brief (a completed event with a date, a cost, and a provider) does not map onto `ADD_FACT`/`CORRECT_FACT` at all: `capturePropertyFact`'s catalog (`capturePropertyFact.ts`) has `structure.roofReplacementYear` but no cost/expense/amount field anywhere in it, and `GroundedAskProposal`'s kind enum has no event-shaped kind (only `ADD_FACT`, `CORRECT_FACT`, `CREATE_TASK`, `START_JOURNEY`, `COMPARE_OPTIONS`, `UPLOAD_EVIDENCE`, `ADD_NOTE`) that could hold a cost+date+provider triple. Net: this is real, substantially-built infrastructure with a genuine head start — but closing the gap requires an extraction stage, a proposal-consumption change in the orchestrator, a transactional fix, and (for event-shaped facts) a new proposal kind, not a single unblocking line.

Similarly, severe-weather/hazard intelligence (Home Event Radar → `PropertyRadarMatch`/`PropertyRadarCompoundInsight`, including a compound rule apparently built for exactly "is my roof at risk from storms") exists in code and, for the specific case traced here, is unreachable from Ask for two stacked reasons: routing never gets there for natural phrasing (Scenario D falls to `GROUNDED_GUIDANCE`), and even a matching component-scoped query is scoped to the wrong Intelligence Envelope domain — `resolveAskEnvelopeQueryScope` hardcodes `ASSET_LIFECYCLE` for any message matching a component keyword (roof/foundation/exterior/interior/site), excluding `WEATHER`, where the radar data actually lives (`envelopeMappingRegistry.ts:60-83`). **This audit verified the scope defect in code but did not query a live database to confirm `PropertyRadarMatch` rows are actually populated for any property** — "live and populated" below should be read as "the rule and domain mapping exist and are wired to write these tables," not as an observed runtime fact. It is also narrower than "radar is invisible to Ask": `resolveAskEnvelopeQueryScope` returns an *unrestricted* scope (`{}`, no domain filter) when the message contains no component keyword, and `intelligenceEnvelopeQuery.service.ts:507`'s domain filter only excludes when a domain list is present — so non-component-scoped envelope queries are not shown to exclude `WEATHER` by this audit's evidence. The demonstrated defect is specific to component-scoped queries, not envelope queries in general.

**Verdict: YES, WITH SIGNIFICANT REFACTORING.** The domain-service layer, the event/notification backbone, the structured response contract, and the fact-provenance model are sound enough to build on. What's missing is not new infrastructure so much as: (1) a genuine free-text extraction stage layered next to (not replacing) the deterministic router, (2) wiring that extraction into the already-built `capturePropertyFact` path, (3) generalizing the one working proactive-push pattern (`askNotificationContinuation.service.ts`) from 2 callers to all detection systems, and (4) breaking the single-file orchestrator into an actual capability-invocation layer so new domains don't require another hand-written branch in a 10K-line switch statement. Full reasoning in §23.

---

## 2. Current Ask Cozy Architecture

```
User
 │
 ▼
Frontend: AIChat.tsx (floating shell, apps/frontend/src/components/AIChat.tsx)
 │  mounted globally in apps/frontend/src/app/(dashboard)/layout.tsx
 ▼
AskWorkspace.tsx (1707 lines) — stateful workflow UI, not a chat transcript
 │  api.createAskExecution() / submitAskCapture() / confirmAskExecution()
 ▼
POST /api/ask/executions*  (apps/backend/src/routes/ask.routes.ts)
 │  middleware: authenticate + requireAskEligibleAccount (account-level gate)
 ▼
ask.controller.ts — thin: Zod-validate, forward
 ▼
askOrchestrator.service.ts :: createAskExecution (~line 6828)  [10,150 lines total]
 │
 ├─ 1. Safety-first routing pass (resolveAskRoutingCascade) BEFORE property access
 ├─ 2. Property/household-role access check (ensurePropertyAccess, :512)
 ├─ 3. Idempotency check (clientRequestId)
 ├─ 4. AskSession / AskExecution row created (RECEIVED)
 ├─ 5. Bounded follow-up rewrite (resolveAskFollowUpMessage, :6901)
 ├─ 6. Routing cascade (regex → embedding/lexical → hierarchical skill routing)
 │      askRoutingCascade.ts → askOperationRegistry.ts → askSemanticRouter.ts
 │      → resolveHierarchicalSkillRouting (:6922, services/skills/*)
 ├─ 7. Dispatch: ~40-branch switch → domain service call
 │      (refinanceRadarService, sellHoldRentService, hvacRepairReplaceEngine,
 │       guidanceJourneyService, decisionThreadService, homeActionsResult,
 │       queryIntelligenceEnvelope, ASK_DOMAIN_COMMAND_REGISTRY writes, …)
 ├─ 8. Result synthesis: askResultSynthesis.service.ts
 │      → ONE constrained Gemini call (synthesizeAskResult) rephrases only
 ├─ 9. Trust/answer validation (askAnswerTrustValidator, askSemanticAnswerValidator)
 └─ 10. Map to AskExecutionResponse: ~20-variant AskPresentationBlock union
 ▼
Response rendered by AskWorkspace.tsx's BlockView as cards/tables/timelines
 + typed next-action suggestions, filtered by askSuggestionPolicy.ts
```

A second, fully separate LLM chat surface exists in the backend (`gemini.service.ts:sendMessageToChat` → `POST /api/gemini/chat`) with a defined frontend client method (`client.ts:1061`) — but **no React component calls it**. It is dead code, not an alternate live path. All findings below concern the `ask/executions` path only.

---

## 3. Current Request/Response Flow

**Request shape:** `{ message, propertyId, sessionId?, clientRequestId, ... }` — a single free-text field plus structured routing/session metadata. There is no multi-message array; each turn is a fresh `AskExecution` row, not an append to a running transcript sent to an LLM.

**Routing (empirically verified, not just read):**
1. `resolveAskRoutingCascade` (`askRoutingCascade.ts:46-152`) first runs a **regex cascade** (`resolveAskOperation`, `askOperationRegistry.ts:460-665`) against ~40 hand-written patterns (e.g. `refinanceAnalysisPattern`, `homeActionsPattern`, `sellHoldRentAnalysisPattern`).
2. If nothing matches, it defaults to `GROUNDED_GUIDANCE` at confidence 0.55 (`askOperationRegistry.ts:664`) and tries a **local embedding + lexical hybrid classifier** (`askSemanticRouter.ts`) against positive/hard-negative example phrases per operation.
3. A message only executes as a specific operation if it clears `localRoutingMinimumConfidence` (0.42) with a `routingAmbiguityMargin` (0.1) over the runner-up (`askOperationalControls.ts:70-71`) — stricter floors apply to WRITE/high-materiality operations.
4. Anything under that floor — or that collides with a semantically-similar but wrong operation (see §17, Scenario E) — falls to `GROUNDED_GUIDANCE`: a single, tightly-scoped LLM call that selects only among facts *already present* in structured context, never extracts new ones.

**Response shape:** a discriminated union `AskPresentationBlock` (`apps/backend/src/productFramework/ask/ask.contract.ts`, mirrored in `apps/frontend/src/features/ask/types.ts:16-39`) with ~20 variants: `SUMMARY, GROUPED_LIST, TABLE, CAPABILITY_LIST, EVIDENCE, BOUNDARY, MONITOR, WORKFLOW_PROGRESS, METRIC_ROW, TIMELINE, COMPARISON, DECISION_TRACE, DECISION_PROGRESS, SCENARIO_COMPARISON, PREFERENCE_REFERENCE, WHY_NOW, RECOMMENDATION_CHANGE, CHANGE_SUMMARY, PRIORITY_LIST, OUTCOME_SUMMARY, ASSUMPTIONS, LIMITATION, EMPTY_STATE, ERROR_STATE`, plus a status enum (`ANSWERED`/`READY_WITH_LIMITATIONS`/`NEEDS_CONTEXT`/`UNAVAILABLE`/`NOT_APPLICABLE`), `captureRequests` (slot-filling prompts), and `suggestions`/`actions` (next steps). This is a real generative-UI contract, not a text bubble with markdown.

---

## 4. Existing C2C Capability Map

Classification is **(a) clean, importable, no HTTP/UI coupling** vs **(b) coupled to its own controller/route**, based on direct code inspection of each domain's service entry points.

| Domain | Core service | Ask-reachable today? | Classification |
|---|---|---|---|
| Guidance | `GuidanceStepResolverService`, `GuidanceDerivedDataService` (`services/guidanceEngine/`) | Yes — imported by 11 controllers **and** `askOrchestrator.service.ts:111` | (a) |
| Refinance | `RefinanceRadarService.evaluateProperty` (`refinanceRadar/refinanceRadar.service.ts:415`) | Yes — direct call, `askOrchestrator.service.ts:5169`/`:6186` | (a), reference example |
| Sell/Hold/Rent | `SellHoldRentService.estimate` (`services/sellHoldRent.service.ts:243`) | Yes — `askOrchestrator.service.ts:4975`/`:6188` | (a) |
| Seller readiness (comps, condition, staging) | `SellerPrepService.getOverview/getComparables/getSellerReadinessReport` (`sellerPrep/sellerPrep.service.ts:29`) | **No** — grepped for all non-self callers; only referenced by its own controller (`sellerPrep.controller.ts`) and one monetization lead controller (`sellerPrep/monetization/lead.controller.ts:3`), never by `services/ask/*` | (b), gap |
| Coverage | `services/coverageGap.service.ts` | Yes — adapter `coverage.review` → `COVERAGE_GAPS` (`skillAdapterRegistry.ts:53`) | (a) |
| Maintenance | `PropertyMaintenanceTaskService` | Yes — adapters `maintenance.status`/`.create`/`.complete`/`.update` → `MAINTENANCE_STATUS`/`MAINTENANCE_TASK_*` (`skillAdapterRegistry.ts:30-33`) | (a) |
| HVAC repair/replace decision | `hvacRepairReplaceEngine.service.ts:126,241` + `decisionThreadService`/`decisionPreferenceService`/`outcomeObservationService` | Yes — full chain via `askDomainCommandRegistry.ts:77-83` and `agentRuntime.service.ts` specialist | (a), most complete example |
| Permits (readiness summary) | `permitTrackerService.getPermitSummary` + `listRenovationCases` (`renovationCase/`) | Yes — `askOrchestrator.service.ts:121,196,3300` (`RENOVATION_PERMIT_READINESS`) | (a) — but see note below |
| Renovation advisor (permit/licensing/tax/jurisdiction evaluation engine) | `homeRenovationAdvisor/` (`evaluationEngine.service.ts` + permit/licensing/tax/jurisdiction evaluators, own `advisorSession.repository.ts`) | **No** — zero references anywhere under `services/ask/` or `productFramework/ask/` (grepped directly) | (b), unwired island — naming collision risk: `RENOVATION_PERMIT_READINESS` sounds like it uses this engine; it does not |
| Home Event Radar (hazards, weather, tax, air quality) | `radarQuery.service.ts` | **No** direct import; only indirectly via one Envelope adapter, itself unreachable in practice (see §17D) | (b)-ish: clean service, but zero callers from Ask |
| Personalization engine | `application/getModuleRecommendations.usecase.ts` et al. (`modules/personalization/`) | **No** — zero imports under `services/ask` | (a) internally, but an island |
| Home Operations (work-item state machine) | `modules/homeOperations/` usecases | Only indirectly, as a write-target/dedup mechanism from `homeActions.service.ts`, not queried by Ask for reads | (b)-ish |
| Incidents, Home Habit Coach | own orchestrators/evaluators | No | (b) |

**Layering verdict:** Tier 1 (Domain Services) is solid where it's been built. Tier 3 (Ask Orchestration) exists and calls Tier 1 directly for several domains. **Tier 2 — a uniform, generic "invoke this capability by ID" indirection — is missing.** `services/skills/` supplies naming, versioning, routing, and governance metadata for that tier (manifests, `skillRegistry.ts`, `skillRouter.ts`, `skillExecutionBinding.ts`) but **no execution dispatcher**: every operation is still a hand-written branch calling a hand-picked function inside `askOrchestrator.service.ts`. Adding a new capability today means editing the 10K-line file, not registering a handler.

---

## 5. Current Integration Map

| Integration | Provides | Persisted? | Ask access today | Participates in decisions? | Reuse quality |
|---|---|---|---|---|---|
| **RentCast** | Structural property facts (year built, systems, roof/foundation type, lot) | Yes — `Property`, `PropertyExteriorProfile`, `PropertyFactEvidence`, `PropertyExternalIdentity` | Indirect — Ask reads resulting `Property` columns directly (`askOrchestrator.service.ts:3602-3609`) but never touches the client, mapper, or evidence/provenance layer | Feeds canonical record only | Clean service class, ready to extend |
| **Weather – OpenWeatherMap** | Freeze/heavy-rain nudges | No (30-min cache only) | No | Yes (home pulse/discovery) | Clean, small |
| **Weather – Open-Meteo** | Current/hourly/10-day/30-day-history conditions | No (cache only) | No | Environment Report feature only | Clean, small |
| **Weather – NWS severe alerts** | Active alerts → radar-scored property risk | Yes, by design (`RadarEvent`, `PropertyRadarMatch`) — runtime population not queried in this audit | **No**, for the demonstrated component-scoped-query path (routing + domain-scope gap, see §17D); non-component-scoped envelope queries were not shown to exclude it | Yes, heavily (`radarImpactRules.ts`) | Clean pipeline, biggest blind spot for Ask found in this audit |
| **Mortgage rates (FRED)** | 30yr/15yr benchmark snapshots | Yes (`MortgageRateSnapshot`) | **Yes, direct** | Yes | Reference-quality |
| **Refinance engine** | Rate-gap/savings/break-even analysis | Yes (`PropertyRefinanceRadarState`) | **Yes, direct**, with real graceful-degradation states | Yes | Reference-quality |
| **Permits (Accela/Socrata)** | Permit status/summary | Yes | Indirect via summary service | Yes (renovation readiness) | Clean adapter-per-vendor |
| **AirNow / OpenFEMA / USGS / tax assessor / community** | Hazard & local-context signals | Yes (`RadarEvent`/feature tables) | No | Yes (radar scoring) | Clean, generic adapter contract (`adapterConformance.ts`); one gateway (`radarQuery.service.ts`) would unlock all at once |

The refinance/mortgage integration is the model to imitate: one engine, called identically by the dashboard route and by Ask, with genuine `NOT_APPLICABLE` / `NEEDS_CONTEXT` (with slot-filling) / `UNAVAILABLE` handling rather than a generic disclaimer. The Radar/hazard family is the opposite case: a fully built pipeline that is invisible to Ask for the one query shape this audit traced end-to-end (component-scoped, §17D) — whether it is populated at runtime, and whether it is invisible for every query shape, was not independently verified here.

---

## 6. Message-First Interaction Readiness

**A. Multi-turn conversation.** `AskSession` groups `AskExecution` rows with a sliding `expiresAt`; each turn is a full structured execution, not a chat-log entry (`prisma/schema.prisma:7920,7939`). A limited "bounded follow-up" rewrite exists (`resolveAskFollowUpMessage`, `askOrchestrator.service.ts:6901`) for short continuations like "only show urgent ones," referencing the last execution — this is not general multi-turn context carryover, it's a narrow rewrite heuristic. **Score: usable foundation, not general-purpose multi-turn state.**

**B. Intent understanding.** Hybrid, but weighted overwhelmingly deterministic: regex first, local (non-LLM) embedding/lexical classification second, confidence-gated execution, and a fixed operation catalog (~40 entries, ~25 of them writes). This is precise and auditable for known intents. **Demonstrated, not inferred:** three of five representative messages (C, D, E) failed to route to the correct operation against the current regex patterns and example corpus (§17). **What this does and doesn't establish:** it shows the current pattern/example coverage is insufficient for these five phrasings — it does not establish that a regex-plus-local-embedding architecture is structurally incapable of ever recognizing paraphrases of a known domain. Scenario E's case (`SELL_HOLD_RENT_ANALYSIS` exists and is reachable via more explicit phrasing) looks like a coverage/calibration gap fixable by adding patterns or hard-negative examples; Scenario C's case (no operation exists at all for "report a completed event with a cost") is a different, more structural gap — there is no operation to route to regardless of phrasing, because the closed enum has no member for that fact shape. This audit distinguishes the two failure modes but did not test whether additional patterns/examples close C or D's gaps; that is worth verifying before concluding a new extraction mechanism is necessary rather than sufficient.

**C. Context retrieval.** Real and reasonably centralized: `getAggregationPropertyContext`/`getAggregationContextEnvelope` (`services/aggregationContext/context.ts`) assembles a fact map (`KNOWN`/`MISSING`, source, confidence, observedAt), and `queryIntelligenceEnvelope` pulls domain-specific data through typed adapters. Fragmentation exists at the edges: Home Event Radar, Home Operations, Home Habit Coach, and the personalization engine each maintain their own read paths that the aggregation context does not fold in.

---

## 7. Conversational Data Capture Readiness

**Does not exist today, but the write-safe path to build it on does.** Concretely:

- No entity extraction from free text into arbitrary domain fields.
- No LLM call in the live path is permitted to introduce new facts — both live Gemini call sites (`selectAskRemoteFallbackTypedClaims`, `synthesizeAskResult`) are explicitly instructed not to invent content and are architecturally incapable of writing.
- A **mostly-built, unused proposal-and-confirm scaffold** exists: `GroundedAskProposal`/`GroundedAskArtifact` (`prisma/schema.prisma:8089/8112`), `createGroundedAskProposal`/`confirmGroundedAskProposal` (`groundedAsk.service.ts:119-179`), calling `capturePropertyFact(propertyId, userId, factKey, {value, sourceType:'USER_REPORTED', confidence:0.9})` — a real, provenance-tagged write. It is disconnected from conversation because `answerGroundedAsk` hardcodes `proposals: []` (`groundedAsk.service.ts:115`) **and** because `groundedGuidanceResult` never reads `answer.proposals` even if populated (`askOrchestrator.service.ts:5608-5651`) — two independent breaks, not one.
- The scaffold itself has a real defect, not just an empty input: for `ADD_FACT`/`CORRECT_FACT`, `confirmGroundedAskProposal` performs the proposal-status update, the `capturePropertyFact` write, and the `GroundedAskArtifact` creation as three separate, non-transactional statements (`groundedAsk.service.ts:145-179`) — unlike the `CREATE_TASK`/`COMPARE_OPTIONS`/`UPLOAD_EVIDENCE` branch, which correctly wraps all three in `prisma.$transaction` (`:212-274`). A failure between the fact write and the artifact write leaves a committed fact behind a `PENDING` proposal, and a client retry can duplicate the evidence write. This path also does not use `AskConfirmationReceipt`.
- The scaffold's `GroundedAskProposal.kind` enum (`ADD_FACT`, `CORRECT_FACT`, `CREATE_TASK`, `START_JOURNEY`, `COMPARE_OPTIONS`, `UPLOAD_EVIDENCE`, `ADD_NOTE`) has no kind shaped for a completed event with a date, cost, and provider — the exact shape of this audit's own roof-replacement example. `capturePropertyFact`'s factKey catalog has `structure.roofReplacementYear` but no cost/amount/expense field at all (grepped the full catalog). `ADD_FACT` can capture "the roof was replaced in 2024" but has nowhere to put "$14,500" or "ABC Roofing."
- **Correction:** an earlier draft of this section claimed writes through the 25-command registry are gated by slot-filling forms "never by parsing the triggering message's free text for field values." That is false, and it was checkable by reading the handler code, not just the registry: `extractMaintenanceTaskInput` (`askOrchestrator.service.ts:859-873`) regex-parses a message for a task title, priority, due date (including relative dates — "tomorrow," "next week," "in N days," via `extractMaintenanceDueDate`, `:834-844`), recurrence frequency (`extractMaintenanceFrequency`, `:846-853`), and estimated cost, before falling back to a capture form only for what it couldn't parse. `extractMaintenanceCompletionInput` (`:1017-1032`) does the same for a completion's actual cost. `extractHouseholdInvitationInput` (`:586-593`) regex-parses an email address and a role from the message. This is real, working, **bounded** extraction — one write operation, a fixed small set of fields, plain regex, always followed by a review/confirm step (`AskConfirmationReceipt`, idempotency-leased) before the write executes. What's actually missing is **general** conversational fact/event extraction: an open vocabulary of facts (not one of ~3 pre-registered field sets), triggered by matching an operation via routing rather than parsing after the fact, and targeting the property's persistent record rather than one in-flight command's parameters. §23's "Structured extraction" score is revised accordingly (see below) — this is not a 0.

**Gap, precisely stated:** four things are missing, not one — (1) general LLM-structured extraction of candidate property facts/events from the message (a materially harder problem than the bounded regex extraction above, since it needs an open vocabulary and NLU rather than a handful of fixed patterns), (2) a proposal-consuming code path in the orchestrator's response builder, (3) a transactional fix to the fact-proposal confirm path, and (4) an event-shaped proposal kind (and corresponding factKey/field support) for facts that carry a date, amount, and party rather than a single scalar value.

---

## 8. Persistent Home Knowledge Assessment

C2C does **not** have one universal knowledge store — it has **independently reinvented the same idea** (typed source, confidence, observed/verified/superseded) at least four times, at different scopes:

| Model | Scope | Provenance vocabulary |
|---|---|---|
| `PropertyFactEvidence` (`schema.prisma:4489-4505`) | Canonical `Property`/`PropertyExteriorProfile`/`PropertySalePrepProfile`/`PropertyResponsibility` fields | `PropertyFactSourceType` (`:237-244`): USER_REPORTED / DOCUMENT / INSPECTION / PUBLIC_RECORD / INTEGRATION / SYSTEM_DERIVED |
| `HomeEvent` (`:7424-7543`) | Homeowner timeline/history | `sourceBadge` (`HomeScoreProvenanceBadge`, `:7415-7422`), `observationKind` (`:7370-7376`), separate `sourceType` (`:7394-7401`) |
| `SignalProvenance` (`~6350-6420`) | Orchestration/incident/notification signals | own `sourceType`; `confidence` field's own comment admits ambiguity: *"0..1 (or 0..100) – pick one convention"* (`:6372`) |
| `ExtractedFactCandidate` (`:5210-5232`) | Document/OCR extraction | `reviewStatus`/`confidence`; promotes directly into `Warranty`/`Expense`/`InsurancePolicyTerm`, bypassing `PropertyFactEvidence` entirely |

A `grep` for `"confidence"` across the backend returns **308 files** — the concept is pervasive but ungoverned.

**One genuine unifying layer exists downstream:** `PropertyChange` (`schema.prisma:16225-16272`), fed by `canonicalChangeReconciliation.service.ts`, which fans in `HomeEvent`, `PropertyFactEvidence`, `Document`, `Claim`, `ProjectRecord`, and `PropertyMaintenanceTask` into one change ledger for homeowner briefing — by reference, not by copying payloads. This is the closest thing to "coherent home knowledge" in the codebase, but it's a change-feed, not a source of truth.

**Conflict handling is real, not last-write-wins, but asymmetric:** `propertyEnrichment.service.ts:198-242` (`decideFactMerge`) explicitly protects USER_REPORTED/DOCUMENT/INSPECTION facts from being silently overwritten by RentCast's PUBLIC_RECORD data. But `capturePropertyFact.ts:283-334` always lets a direct user edit win unconditionally, with no reverse check — reasonable for that direction, but it means priority logic isn't symmetric across all four vocabularies above.

**Recommendation (per the audit's own instruction not to reach for a new store reflexively): do not build a new universal fact store.** Extend `PropertyFactEvidence`, and reuse `PropertyChange`'s existing ingestion of `PropertyFactEvidence` writes to get chat-captured facts into the briefing/notification surface for free. **Correction (reconciled with §16):** an earlier draft of this recommendation proposed a single new `AI_CHAT` source-type value ranked below `USER_REPORTED`/`DOCUMENT`/`INSPECTION` — this conflates channel (chat vs. form vs. document) with source (who supplied the information) and would rank a homeowner's own confirmed statement below the same statement typed into a form, for no principled reason. What the schema needs instead is a **capture-channel** field (or equivalent) that is independent of `sourceType` — a chat-captured fact from the homeowner is still `USER_REPORTED`, just via a different channel and (until confirmed) with its own extraction-confidence value. `decideFactMerge`'s priority-ladder *pattern* is still the right template to extend, but the extra dimension it should rank is confirmation state / extraction confidence, not "arrived via chat." Also note: `PropertyFactEvidence.confidence` was not designed for "how sure was the extraction step" — before repurposing it for that meaning, its existing consumers (starting with `decideFactMerge` and any UI that reads it) need to be checked for what they currently assume `confidence` means, since a field is not automatically reusable across two different notions of certainty. The real gap is `factKey` allowlisting (~55 keys today) — extend the catalog for facts that map to real columns, and add a narrow, explicitly-untyped overflow table only for facts with no canonical home yet (mirroring how `PropertySalePrepProfile` was added for the same reason).

---

## 9. Capture → Format → Store Assessment

| Pipeline stage | Exists? | Evidence |
|---|---|---|
| Extract candidate facts from message | **Bounded only** | Regex-based command-parameter extraction is real for ~3 write operations (`extractMaintenanceTaskInput`, `extractMaintenanceCompletionInput`, `extractHouseholdInvitationInput`, `askOrchestrator.service.ts:586,859,1017`) — a fixed, small field set per operation, post-routing. **General** fact/event extraction into the property's persistent record (open vocabulary, not tied to one command) does not exist; both live Gemini calls are selection/rephrase-only, never extraction |
| Map to domain schema | Partial | `capturePropertyFact.ts` factKey→field mapping exists but only reachable from structured callers today |
| Validate | Yes | Zod schemas throughout the command registry; `PropertyFactEvidence` typed fields |
| Determine confidence | Yes (multiple, ungoverned scales — see §8) | |
| Determine if confirmation required | Yes, two non-equivalent mechanisms | `GroundedAskProposal` confirm flow (fact-shaped writes, **not transactional**, no `AskConfirmationReceipt`); `AskConfirmationReceipt` (25-command registry, idempotency-leased, transactional) |
| Persist | Yes, but not atomically for facts | `capturePropertyFact` → `PropertyFactEvidence`; committed independently of the `GroundedAskProposal`/`GroundedAskArtifact` status writes around it (`groundedAsk.service.ts:145-179`) |
| Update context | Yes | `PROPERTY_FACT_CHANGED` domain event → `intelligenceRecompute` |
| Use immediately in subsequent reasoning | Yes, architecturally | Aggregation context reads `PropertyFactEvidence` on next turn |

`capturePropertyFact` itself is transactionally sound in isolation (`propertyEnrichment.service.ts` emits its domain event inside the same transaction as the write, and `capturePropertyFact.ts`'s own write is a single transaction). The gap is at the seam one level up: the *caller* (`confirmGroundedAskProposal`'s `ADD_FACT`/`CORRECT_FACT` branch) does not enclose that call together with its own proposal-status and artifact writes in one transaction, unlike its sibling branches in the same file. The pipeline is missing its first stage (extraction) and has a real correctness gap at the confirm/persist seam — not a clean "everything downstream already works."

---

## 10. Response Architecture Assessment

Already strong. The ~20-variant `AskPresentationBlock` union plus typed `status`, `captureRequests`, and `suggestions`/`actions` is a genuine structured/generative-UI contract, not plain text (§3). It already supports explanation (SUMMARY), tables, timelines, comparisons, decision traces, priority lists, evidence citations, and boundaries/limitations. A message-first evolution should **add block types** (e.g., a proactive-insight block, a fact-confirmation block) rather than replace this contract.

---

## 11. Contextual Next-Action Readiness

Partial. `askSuggestionPolicy.ts` suppresses repeated suggestions; a generic "related capabilities" append (`getRelatedCapabilities`/`buildCapabilityCatalog`) fires on clean `ANSWERED` responses with no outstanding captures. But it is gated narrowly (only fires for operations registered in `OPERATIONS_BY_CAPABILITY`) and several scenarios show it not firing where it plausibly should. **Correction:** an earlier draft claimed `GROUNDED_GUIDANCE` fallback answers get "zero next-action suggestions" — that's false; `groundedGuidanceResult` always returns `suggestions: [answer.nextAction]` (`askOrchestrator.service.ts:5651`), and `answerGroundedAsk` populates `nextAction` with a non-empty string in every branch (e.g., "Add or verify the relevant home facts before relying on this answer for a material action."). The real limitation is that this suggestion is one **generic, hardcoded-per-branch guidance string**, not a contextually-generated, capability-derived next action tied to a specific relevant operation or page — `GROUNDED_GUIDANCE` has no entry in `OPERATIONS_BY_CAPABILITY`, so it never gets the same treatment as an answered operation would. The sell/hold/rent answer has the same shape of gap: it never surfaces a Seller Prep link even though one exists elsewhere in the code (§17 E). Next actions today are **hand-picked static strings per operation** (present, but not absent, for the fallback path), not generated from "response + context + missing info + relevant capabilities," as the target model requires.

---

## 12. Existing Skill/Capability Architecture

See §4 for the full layering analysis. Summary: `services/skills/` is a real, invoked governance/routing layer — 26+ named skill packages, each with a manifest, autonomy/risk policy, and an entry in `skillAdapterRegistry.ts` (56 declared adapters as of this audit, each with a `canonicalOwner`, `effect: READ|MUTATION_PREPARATION`, `idempotencyPolicy`, `timeoutMs`, `retrySafety` — `skillAdapterRegistry.ts:29-94`). Verified directly: `buildSkillExecutionBinding` (`skillExecutionBinding.ts:72-114`) constructs and hash-pins a **descriptive** binding — which skill/operation/policy-version/adapter/dependency-status applied — and `validateSkillExecutionBinding` (`:132-175`) checks one for staleness. Neither function calls the adapter's underlying service. So this layer has **no execution indirection**: it decides *which* operation is authorized to run and produces an auditable, versioned record that it did, but the actual function call is still one of ~40 hardcoded branches in `askOrchestrator.service.ts`. `productFramework/capabilities` is a **navigation catalog** (deep links for suggestion cards), not a skill-execution registry, despite the name. `services/tools/` is two math utility files. `services/agents/` has exactly one real specialist (`agentRuntime.service.ts` for HVAC repair/replace) — matching the Stage 3 architecture doc's stated pattern of HVAC as the reference implementation, not a generic agent framework.

**This matches §18's warning almost exactly:** the codebase has NOT proliferated per-domain agents. It has one working specialist (HVAC) built to a documented, reusable pattern. The gap is Tier 2 (generic capability invocation), not agent sprawl.

---

## 13. Proactive Intelligence Readiness

Two mature detect→evaluate→surface systems exist, plus several smaller bespoke ones, all terminating in one genuinely reusable notification core:

- **Home Event Radar** (`apps/backend/src/modules/homeEventRadar/`): cron/job ingestion → geo-matching → per-user notification-policy decision → in-app `Notification` + email/push delivery. Zero direct Ask imports; reachable only indirectly and, per §17D, not effectively in practice.
- **Intelligence Envelope / Home Intelligence recompute** (`services/intelligenceRecompute/`, `services/intelligenceEnvelope/`): a durable `DomainEvent` outbox (not pub/sub — one event routes to exactly one handler), polled every 30s, materializing per-consumer read models with access control. Pull-only from Ask's side (`INTELLIGENCE_ENVELOPE_QUERY`).
- **The one real proactive-to-Ask bridge:** `askNotificationContinuation.service.ts` (`createAskNotificationContinuation`) pre-populates an `AskSession`/`AskExecution` (SUMMARY + WORKFLOW_PROGRESS blocks) and returns a deep link straight into that conversation. Used by exactly **two** callers today — `maintenanceReminder.service.ts:113` and `refinanceRateMonitor.service.ts:144` — while Home Event Radar, Incidents, and Home Habit Coach all notify via plain feature-page deep links instead.
- `NotificationService.create()` is the one universal core every producer already funnels through (category/urgency mapping, dedup, channel routing) — it is the natural fan-out point to generalize the Ask-continuation pattern from.

**Lean: EXTEND, not replace.** The outbox/poller/envelope/notification stack is sound. The gap is a missing generic hook: every notification producer should be able to call the equivalent of `createAskNotificationContinuation` as a standard last step, not a bespoke one.

---

## 14. Three-Jobs Assessment

**Job 1 — "Tell me what needs my attention."** Partially supported. `HOME_ACTIONS` (routes deterministically, confidence 0.96 on natural phrasing — the one scenario that works well end-to-end) pulls from a real governed feed (`getHomeActionFeed`) that already deduplicates against Home Operations work items. But it **excludes Home Event Radar and severe-weather signals entirely** (confirmed by grep — zero references in the feed's summary sources) and only loosely touches Home Operations (as an output sink, not an input). The "attention" picture Ask can give today is missing the external/hazard half of what the platform actually knows.

**Job 2 — "Help me make the right home decision."** Best-supported job. Refinance analysis and HVAC repair/replace decisioning are genuinely complete, decision-platform-backed experiences with real graceful degradation (missing-data slot-filling, not disclaimers). Sell/hold/rent is a solid financial model but stops short of seller-readiness content that lives in an unwired sibling service.

**Job 3 — "When something major happens."** Weakest. No scenario traced shows Ask picking up a live external event (a storm, a permit change, a rate move outside the two wired monitors) and proactively starting a guided conversation about it. The infrastructure to do this (§13) exists; the wiring from "something happened" to "Ask opens with it" does not, beyond the two existing bespoke callers.

---

## 15. LLM Boundary Assessment

The LLM boundary here is unusually disciplined, not accidental:

- **Routing/intent classification:** deterministic (regex) + local, non-LLM embedding classifier. No LLM call in the classification path.
- **Answer synthesis:** `synthesizeAskResult` — a single Gemini call, `temperature: 0.1`, explicit system instruction *"Never add facts, advice, numbers, dates, links, actions, or conclusions"* — pure rephrasing of an already-computed, already-validated payload.
- **Fallback claim selection:** `selectAskRemoteFallbackTypedClaims` — structured JSON output (`responseSchema`, `temperature: 0`), instructed *"Select only relevant entries from candidates... invent nothing."* Selects, never generates.
- **Domain decisions:** deterministic engines (refinance math, HVAC decision engine) — the LLM is not the source of the recommendation, only (optionally) narration around it.

This is close to the target principle stated in the request ("the LLM should not become the database or the sole source of domain truth") almost by construction. The corresponding cost is exactly the gap this audit centers on: because no LLM call is trusted to introduce new information, there is currently no path from free text to a new fact. The fix is not to loosen these existing boundaries — it's to add one new, equally constrained LLM stage (structured extraction, schema-validated, confidence-scored, confirmation-gated) rather than relaxing the ones that already work.

---

## 16. Conversational Write Safety Assessment

Infrastructure for exactly the source/confidence distinctions the audit asks about already exists, just not wired to conversation:

- `PropertyFactSourceType` (USER_REPORTED / DOCUMENT / INSPECTION / PUBLIC_RECORD / INTEGRATION / SYSTEM_DERIVED) has no value for "arrived via a chat message" — but this audit initially conflated two axes that should stay separate: **who supplied the information** (a homeowner's own statement is still `USER_REPORTED` regardless of the UI surface they used) versus **which channel captured it** (a typed form field vs. a parsed chat message vs. a document upload). A homeowner-confirmed chat statement should not automatically receive lower authority than the same fact typed into a form purely because of the channel — the two need independent fields (or an independent enum), not a single value that conflates "chat" with "less trustworthy." A third, also-distinct axis is **extraction uncertainty** (how confident the NLP/LLM step was that it correctly identified the value) and a fourth is **confirmation state** (has a human affirmed this specific claim). Any schema change here should model these as separate dimensions.
- `confidence: Float?` on `PropertyFactEvidence` already supports a scored, non-binary certainty level per fact, and could hold the "extraction uncertainty" dimension above independently of source/channel.
- `decideFactMerge`'s priority ladder demonstrates a working conflict-resolution *pattern* (rank public-record data below user/document/inspection) that a capture-channel or extraction-confidence dimension could plug into — but this audit does not treat that as settled; see the open question in §24.
- `GroundedAskProposal`'s confirm-before-persist flow provides the shape of an "ask before committing an uncertain claim" mechanism, but — corrected from an earlier draft of this audit — it does **not** use `AskConfirmationReceipt` or an idempotency lease; that mechanism belongs to the separate 25-command registry (`askDomainCommandRegistry.ts`). The fact-proposal flow's own confirm step has the non-atomicity defect described in §7/§9 and should be hardened, not assumed safe, before being reused as the model for conversational fact capture.
- What's absent: any mechanism to distinguish "I replaced the roof in 2024" (explicit) from "I think it was around 2024" (hedged) from "the listing said 2024" (attributed to a third party) at the extraction stage — because no extraction stage exists yet to make that distinction in the first place. Per the point above, this is a question of extraction-confidence and source-attribution, not of picking a lower-trust "chat" source bucket.
- **Existing governance constraint this audit must not contradict:** `docs/product/AI_HOME_CONCIERGE_ASK_TRUST_ARCHITECTURE_ADDENDUM_FRD.md` states unconditionally that "material writes shall retain confirmation and idempotency" (§18, "Canonical execution boundary") — confirmation for a material write is not something the addendum makes conditional on confidence. Any future design for conversational fact capture needs to treat confirmation-before-persist as a fixed requirement for material facts, and use confidence only to decide things like default-selected values or whether to proactively ask a clarifying question — not whether to skip confirmation.

---

## 17. Representative Scenario Traces

**What was actually executed vs. what was read:** only the **routing stage** (`resolveAskRoutingCascade`, which is pure/deterministic and needs no database) was run for all five scenarios below — this yields real, reproducible `stage`, `operationId`, `confidence`, and candidate scores. Everything about **downstream behavior** — the exact fallback text `answerGroundedAsk` returns, whether any `PropertyRadarMatch` rows exist for a given property, what a live property's known facts would be — was *not* executed against a database and is **code-traced** (read from source, not observed at runtime). The two are labeled separately below; earlier drafts of this audit blurred them together.

**Reproduction:** the trace script was not checked into the repo in the previous revision — that was a real gap (nothing to actually rerun). Its complete contents are below; save it as `apps/backend/trace.ts` and run from `apps/backend/`:

```ts
// apps/backend/trace.ts — save here and run from apps/backend/. Not part of the
// application; a standalone script for reproducing this audit's routing trace.
import { resolveAskRoutingCascade } from './src/services/ask/askRoutingCascade';

const scenarios: Record<string, string> = {
  A: 'What needs my attention?',
  B: 'Should I refinance my mortgage?',
  C: 'I replaced my roof last summer for $14,500.',
  D: 'Is my roof at risk because of the storms we had recently?',
  E: "I'm thinking about selling next year.",
};

for (const [label, message] of Object.entries(scenarios)) {
  try {
    const decision = resolveAskRoutingCascade(message, { propertyId: 'trace-property-id' });
    console.log(`--- Scenario ${label}: "${message}" ---`);
    console.log(JSON.stringify({
      stage: decision.stage,
      operationId: decision.operation.operationId,
      confidence: decision.operation.confidence,
      requiresClarification: decision.requiresClarification,
      topCandidates: decision.candidates.slice(0, 3),
    }, null, 2));
  } catch (error) {
    console.log(`--- Scenario ${label}: "${message}" ---`);
    console.log('ERROR', error instanceof Error ? error.stack : error);
  }
}
```

Run with (no database, no environment variables required — `resolveAskRoutingCascade` and its dependencies are pure):
```
cd apps/backend
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
  npx ts-node --transpile-only trace.ts
```
The `TS_NODE_COMPILER_OPTIONS` override is required because this repo's `tsconfig.json` sets `module: "NodeNext"`, which `ts-node` otherwise refuses to pair with a plain `moduleResolution`. Delete `apps/backend/trace.ts` after use — it is a diagnostic script, not application code, and should not stay checked in.

Run against commit `41b5f567` for this revision (immaterial to routing — no `services/ask/*` files changed since `0920999a`, when the original trace was taken); full output for all five scenarios:

| Scenario | Stage | Operation | Confidence | Top raw-confidence candidate |
|---|---|---|---|---|
| A | DETERMINISTIC | `HOME_ACTIONS` | 0.96 | — (direct regex match) |
| B | DETERMINISTIC | `REFINANCE_ANALYSIS` | 0.97 | — (direct regex match) |
| C | REMOTE_FALLBACK → `GROUNDED_GUIDANCE` | (none clears floor) | 0.55 (fallback default) | `REPLACEMENT_GUIDANCE` rawConfidence 0.1549, band LOW |
| D | REMOTE_FALLBACK → `GROUNDED_GUIDANCE` | (none clears floor) | 0.55 (fallback default) | `INVENTORY_LOOKUP` rawConfidence 0.1625/conf 0.187, `BUYER_DEADLINES` rawConfidence 0.1667, band LOW |
| E | REMOTE_FALLBACK → `GROUNDED_GUIDANCE` | (none clears floor) | 0.55 (fallback default) | `HVAC_PREFERENCE_SAVE` rawConfidence 0.6119/conf 0.5, band MEDIUM |

### A. "What needs my attention?"
Regex match: `homeActionsPattern` (`askOperationRegistry.ts:387`) → **`HOME_ACTIONS`**, confidence 0.96. Dispatches to `homeActionsResult` (`askOrchestrator.service.ts:3787`) → `getHomeActionFeed` (`homeActions.service.ts:1188`), a real governed feed that dedupes against Home Operations work items and appends a `PRIORITY_LIST` block. **Missing:** zero references to `radar`/`RadarEvent`/`PropertyRadarMatch` anywhere in the feed's source files — severe weather and hazard signals are structurally excluded from "what needs my attention" today. Nothing persisted (read-only). Next-action suggestions are three fixed re-filter strings, not generated from context.

### B. "Should I refinance my mortgage?"
Regex match: `refinanceAnalysisPattern` → **`REFINANCE_ANALYSIS`**, confidence 0.97. Dispatches to `refinanceAnalysisResult` (`:5110`) → `refinanceRadarService.evaluateProperty`. Genuinely graceful degradation, confirmed: `NOT_APPLICABLE` if no mortgage; `NEEDS_CONTEXT` with a real slot-filling `captureRequests` group (`FINANCING_PROFILE_REFINANCE_INPUTS`) if financing data is incomplete; `UNAVAILABLE` if the market rate snapshot is missing. No material gap found — this is the reference-quality path.

### C. "I replaced my roof last summer for $14,500."
**Executed:** all regexes miss (the closest, `replacementPattern`, requires the literal substring `"replace "` with a trailing space; "replaced" doesn't match). Semantic classifier's best candidates (`REPLACEMENT_GUIDANCE` rawConfidence 0.1549, `HVAC_DECISION_START` rawConfidence 0.1366) are all in the `LOW` band, far under the 0.42 execution floor. Falls to **`GROUNDED_GUIDANCE`**.

**Code-traced, not executed against live data:** `answerGroundedAsk` (`groundedAsk.service.ts:53-117`) would call `selectAskRemoteFallbackTypedClaims` against whatever facts the property's `PropertyFactEvidence`/aggregation context actually holds; for a property with no matching known facts, the code path returns the line *"The current Living Home Record does not contain a supported severity, deadline, or cost comparison for this question."* This was not run against a real property's data in this audit — it is read from the fallback-text branch in source, not an observed output.

**Persistence, corrected:** nothing is persisted either way, but not simply because of one unset field. Even setting aside that `proposals` is hardcoded to `[]`: (1) `groundedGuidanceResult` doesn't read `answer.proposals` if it were populated (`askOrchestrator.service.ts:5608-5651`); (2) `confirmGroundedAskProposal`'s `ADD_FACT`/`CORRECT_FACT` path is not transactional across the proposal-status, fact-capture, and artifact writes (`groundedAsk.service.ts:145-179`); and (3) neither `capturePropertyFact`'s factKey catalog nor `GroundedAskProposal.kind` has a slot for "$14,500" or "ABC Roofing" — only `structure.roofReplacementYear` exists, with no cost/provider equivalent. Closing this gap requires extraction, an orchestrator change, a transactional fix, and new fact/proposal surface area — four changes, not one.

### D. "Is my roof at risk because of the storms we had recently?"
**Executed:** no regex match; semantic candidates (`BUYER_DEADLINES` rawConfidence 0.1667, `INVENTORY_LOOKUP` rawConfidence 0.1625) all `LOW`. Falls to `GROUNDED_GUIDANCE` — same code-traced fallback-text path as C, not independently re-verified for this scenario.

**Code-traced, narrower than originally stated:** even in the hypothetical where phrasing had matched the envelope-observation route, `resolveAskEnvelopeQueryScope` (`askEnvelopeQueryScope.ts:18-26`) matches "roof" against its `COMPONENT_PATTERNS` and, for that case only, hardcodes `domains: ['ASSET_LIFECYCLE']` — while a compound rule named `SEVERE_WEATHER_OPEN_ROOF_ISSUE` is mapped to Envelope domain **`WEATHER`** (`envelopeMappingRegistry.ts:60-83`), so a component-scoped roof query would exclude it. This audit did **not** query a live database to confirm any `PropertyRadarMatch` rows actually exist for a real property — "the evidence exists" means the rule and domain mapping are present in code, not that this audit observed populated data. This finding is also narrower than "radar is excluded from Ask": when a message has **no** component keyword, `resolveAskEnvelopeQueryScope` returns `{}` (no domain filter at all), and `intelligenceEnvelopeQuery.service.ts:507`'s filter (`if (query.domains?.length && !query.domains.includes(item.domain)) return false;`) only excludes a domain when one is explicitly listed — so non-component-scoped envelope queries are not shown by this audit to exclude `WEATHER`. The demonstrated defect is specific to component-keyword-scoped queries (roof/foundation/exterior/interior/site), not envelope queries in general.

### E. "I'm thinking about selling next year."
No regex match (`sellHoldRentAnalysisPattern` requires an explicit modal like should/could/would near sell/hold/rent). The semantic classifier's top match is actually **`HVAC_PREFERENCE_SAVE`** (0.612, `MEDIUM`) — a hard-negative collision, because that unrelated HVAC-preference feature's example corpus includes ownership-horizon phrasing ("planning to sell in N months"). It resolves to `UNSUPPORTED` (its own confidence floor, being a WRITE operation, exceeds its score) and falls to the same `GROUNDED_GUIDANCE` disclaimer as C/D. More explicit phrasing ("Should I sell or rent this home?") *does* route correctly to `sellHoldRentAnalysisResult` → `SellHoldRentService.estimate` — but that path never touches `sellerPrep/` (no comps, no cosmetic condition, no staging checklist), and no guaranteed Seller Prep deep link appears in the response's suggestions (a `/seller-prep` href exists elsewhere in the file but is only used by the correction/retry flow).

**Cross-cutting takeaway:** three of five representative homeowner messages — arguably the three most central to the "message-first" vision (reporting an event, asking a risk question, expressing an intention) — miss routing on natural phrasing (executed finding) and land on the same generic disclaimer path (code-traced). In two of the three cases (C, D), meaningful ingredients of a better answer exist in the codebase — a partially-built fact-write path for C, a hazard-scoring rule and domain mapping for D — but neither is a finished, verified-working ingredient: C's write path has a real transactional defect and no event-shaped capture slot, and D's fix depends on data this audit did not confirm is populated at runtime.

---

## 18. Architectural Bottlenecks

1. **Single-file orchestrator.** `askOrchestrator.service.ts` at 10,150 lines directly imports ~50 domain services. Every new capability is a new branch in the same file. This is the primary scaling bottleneck for adding both new domains and new interaction modes (proactive push, extraction).
2. **The operation catalog is a fixed enum with no member for "report a completed event with a cost."** This is distinct from the routing-coverage misses in Scenarios D and E (where an operation exists but wasn't matched — possibly closable with more patterns/examples, not tested here): for Scenario C, no amount of additional regex or embedding-example tuning invents a new catalog entry. Closing that specific gap needs either a new operation added to the enum (staying inside today's paradigm) or a categorically different, open-vocabulary extraction mechanism — this audit does not establish which is required, only that the enum has no current member for this fact shape.
3. **`askEnvelopeQueryScope.ts`'s hardcoded domain mapping** silently excludes weather/hazard data from otherwise-correct component-scoped queries (roof/foundation/exterior/interior/site) — a narrow but consequential coupling bug in the architecture, not just a missing feature. (Whether that excluded data is actually populated at runtime was not independently verified in this audit.)
4. **Four independent provenance vocabularies** (`PropertyFactEvidence`, `HomeEvent`, `SignalProvenance`, `ExtractedFactCandidate`) mean "how sure are we and who said so" is answered differently depending on which subsystem wrote the data — a real obstacle to a single confidence-aware conversational-capture pipeline.
5. **Proactive-to-Ask is bespoke per trigger type** (2 callers of `createAskNotificationContinuation`), not a property of the notification system as a whole.

---

## 19. Technical Debt Relevant to This Direction

- The orphaned `/api/gemini/chat` path (`sendMessageToChat`, dead frontend reference) and the orphaned `/api/gemini/proposals*` route (`groundedAsk` proposals, unreachable from any UI) represent a previous, abandoned attempt at something close to this audit's target — free-text chat and fact-proposal capture — that was built and then not finished/wired. Worth treating as a partially-built asset, not dead weight to delete outright, since (per §7/§17C) the proposal-and-confirm machinery is exactly what's needed.
- `SignalProvenance.confidence`'s self-documented ambiguity ("0..1 (or 0..100) – pick one convention") is a small but real landmine for anyone building confidence-aware logic on top of it.
- `sellerPrep/` and `modules/personalization/` are both clean, well-built, and completely isolated from Ask — genuine "should already be capabilities, aren't yet" cases rather than architecture problems.

---

## 20. KEEP / EXTEND / REFACTOR / REPLACE Matrix

| Component | Verdict | Reasoning |
|---|---|---|
| `askOrchestrator.service.ts` pipeline (routing → resolve → execute → synthesize) | **REFACTOR** | Sound conceptually; the single-file breadth of domain imports is the problem, not the pipeline shape |
| Conversation storage (`AskSession`/`AskExecution`/`AskExecutionEvent`) | **EXTEND** | Well-suited audit/versioning bones; needs a true multi-message concept alongside "execution" |
| Deterministic intent routing (regex + local embedding) | **KEEP** for the closed-command surface (precise, auditable, cheap). Demonstrated gap: missed 3/5 sample phrasings (§17 C/D/E) — some of that may be closable by adding patterns/examples for paraphrases of *existing* operations (not demonstrated either way by this audit); what more patterns definitionally cannot do is create a new *operation* for a fact shape the enum has no member for (Scenario C). A new extraction path is one possible way to close that second gap, not the only one, and not shown here to be necessary |
| Response contract (`AskPresentationBlock` union) | **KEEP** | Already extensible; add block types, don't replace |
| `services/skills/` (manifests, routing, governance) | **REFACTOR** | Keep the registry/governance concept; replace "every operation is a hand-written branch" with a real `capability.invoke(id, input)` indirection |
| `productFramework/capabilities` | **KEEP as what it is** | A navigation/discovery catalog; don't mistake it for a skill-execution layer in future design |
| `decisionPlatform` + HVAC specialist agent pattern | **KEEP/EXTEND** | The one place the full target pattern (service → registry → orchestrator → specialist) is real; extend the pattern to other domains rather than inventing a new one |
| `services/tools/` | **KEEP** | Exactly what it claims: shared math |
| `personalization` module | **EXTEND (integrate)** | Internally clean; missing only an Ask-facing caller |
| `sellerPrep/` | **EXTEND (wire)** | Service is UI-decoupled already; needs a new Ask operation, not new business logic |
| `homeRenovationAdvisor/` | **EXTEND (wire) or REFACTOR (consolidate)** | Rich, UI-decoupled evaluation engine; currently a same-domain sibling of the thinner `permitTracker`/`renovationCase` pair Ask actually calls under `RENOVATION_PERMIT_READINESS` — decide whether to wire this engine in as a deeper follow-up operation or fold the thinner pair into it, rather than maintaining both |
| `PropertyFactEvidence` + `capturePropertyFact` | **EXTEND** | Add a capture-channel field independent of `sourceType` (not a new lower-ranked `AI_CHAT` source — see §8/§16), extend the merge-priority pattern to rank confirmation state/extraction confidence, extend factKey catalog |
| `GroundedAskProposal`/`capturePropertyFact` write path | **EXTEND (connect + harden)** | Substantially built, but needs a transactional fix at the confirm/persist seam, an orchestrator-side change to actually surface proposals, and a new proposal kind for event-shaped facts (date+cost+provider) before it should be the reuse target |
| Provenance/confidence vocabulary (4 parallel versions) | **REFACTOR (consolidate)** | Converge toward `PropertyFactEvidence`'s shape over time; don't add a 5th |
| `PropertyChange` audit/change-feed | **KEEP as the integration point** | Already the one real fan-in layer; extend its reconciliation service for new sources |
| Home Event Radar / Intelligence Envelope / notification core | **EXTEND** | Sound outbox/poller/read-model stack; missing a generic push-to-Ask fan-out |
| `askNotificationContinuation.service.ts` | **EXTEND (generalize)** | Proven pattern, 2 callers; make it the standard suffix for every notification producer |
| `askEnvelopeQueryScope.ts` domain hardcoding | **REFACTOR** | Narrow but consequential; fix the ASSET_LIFECYCLE/WEATHER mismatch and generalize scope resolution |
| Orphaned `/api/gemini/chat`, `/api/gemini/proposals*` | **REPLACE their routing, reuse their machinery** | Dead as live endpoints; the underlying `groundedAsk`/proposal code is an asset to wire in, not delete |

---

## 21. Critical Gaps

1. **No free-text fact-extraction stage.** The single highest-leverage gap — but downstream of it, validation and context-update are solid while confirmation/persistence for fact proposals has its own transactional defect (§7/§9/§16) and no slot for event-shaped facts (date+cost+provider). Both need fixing regardless of when extraction is added.
2. **Proactive push is bespoke (2 of 8+ trigger types), not systemic.**
3. **Component-scoped radar/hazard envelope queries exclude `WEATHER`** due to a hardcoded `ASSET_LIFECYCLE` domain mapping in `resolveAskEnvelopeQueryScope` — confirmed in code for roof/foundation/exterior/interior/site-keyword queries specifically. This audit did not establish that radar is broadly invisible to Ask, nor did it confirm live `PropertyRadarMatch` data exists for any real property — both would need runtime verification, not just code reading.
4. **No generic capability-invocation layer** — new domains require editing a 10K-line file.
5. **Four incompatible provenance/confidence vocabularies** make a unified "how sure are we, who said so" answer impossible without consolidation.
6. **`sellerPrep/`, `personalization/`, and `homeRenovationAdvisor/` are unwired islands** relative to Ask, despite being clean internally. The renovation case is the most deceptive of the three: `RENOVATION_PERMIT_READINESS` already exists as a working Ask operation, but it calls the thin `permitTracker.service.ts`/`renovationCase/` pair, not the considerably richer `homeRenovationAdvisor/` evaluation engine (permit/licensing/tax/jurisdiction evaluators) — a naming collision that could lead future engineers to assume renovation guidance is more capable through Ask than it actually is.

---

## 22. Opportunities Already Present in the Codebase

- `GroundedAskProposal` + `capturePropertyFact` — a substantial part of the conversational-write safety mechanism the audit calls for is already built (schema, validation, provenance fields) and gives a real head start, though the confirm/persist seam needs a transactional fix and an event-shaped proposal kind before it should be trusted as the reuse target (§7/§9/§16).
- `decideFactMerge`'s source-priority arbitration is a working template for how a new confirmation-state/extraction-confidence dimension should be ranked — not for ranking "chat" as a lower-trust source (§8/§16 correction).
- `askNotificationContinuation.service.ts` is a working, proven template for "background detection becomes a pre-loaded Ask conversation" — it just needs more callers.
- The refinance/mortgage integration is a working template for "integration as a directly-callable Ask capability with real degraded-state handling," worth replicating for other domains (seller prep, radar/hazards).
- The HVAC decision-platform + specialist-agent chain is a working, documented (Stage 3 doc) template for "decision domain as a full vertical slice," worth replicating rather than redesigning.
- `PropertyChange`'s reconciliation service is already the fan-in point that would make any new fact source (including chat) show up in existing homeowner-facing history/briefing UI for free.

---

## 23. Overall Readiness Assessment

### Readiness scoring (0 = nonexistent, 5 = already well aligned)

| Area | Score | Evidence basis |
|---|---:|---|
| Message interaction (structural) | 3 | Real request/response plumbing, but intent-shaped not chat-shaped |
| Multi-turn state | 2 | `AskSession`/`AskExecution` groups turns; only narrow follow-up rewrite, no general context carryover |
| Intent understanding | 2 | Excellent for the closed catalog (0.96–0.97 confidence on matches); missed 3/5 sample phrasings (§17 C/D/E) — demonstrated coverage gap for this sample, not shown to be a structural ceiling on paraphrase recognition in general |
| Context assembly | 3 | Real aggregation-context service; fragmented at the edges (radar, home operations, personalization not folded in) |
| Property context | 4 | `PropertyFactEvidence` + aggregation context is a strong foundation |
| Structured extraction | 1 | Bounded, regex-based command-parameter extraction exists and works for ~3 write operations (§9); general open-vocabulary fact/event extraction into the property record does not exist in the live path |
| Conversational persistence | 3 | Solid execution/session/event model; no raw multi-message transcript concept |
| Home knowledge model | 2 | Real building blocks, but 4 parallel provenance vocabularies, no single source of truth |
| Response structure | 4 | Genuinely strong, extensible generative-UI contract |
| Next-action generation | 2 | A suggestion always exists (`GROUNDED_GUIDANCE` never returns zero — §11 correction), but it's a static, hardcoded-per-operation/per-branch string, not generated from context + missing info + relevant capabilities as the target model requires |
| Skill/capability reuse | 2 | Governance/routing layer real; no execution indirection |
| Domain-service accessibility | 3 | Several domains cleanly callable (refinance, sell/hold/rent, HVAC); several clean-but-unwired (sellerPrep, personalization) |
| Integration reuse | 3 | Refinance is reference-quality; radar/hazard family fully built but unreachable from Ask for the one query shape traced end-to-end (§17D) |
| Proactive intelligence | 2 | Two mature detect/evaluate engines exist; push-to-Ask is 2 bespoke callers, not systemic |
| Background execution | 4 | Durable outbox, poller, real notification transport — solid infrastructure |
| LLM boundaries | 4 | Unusually disciplined; deterministic-first by design, LLM confined to select/rephrase |
| Conversational-write safety | 2 | Proposal/confirm/provenance scaffold exists and is unpopulated by extraction, but the confirm/persist step itself has a real non-atomicity defect (§7/§9/§16) that needs hardening before reuse, not just a populator |
| Observability | 3 | `AskExecutionEvent`, `AskTrustReviewCandidate`, routing-quality evaluator all present |
| Testing/evaluation | 3 | `askRoutingQualityEvaluator`/`askTrustCertificationCorpus` show a real evaluation discipline for routing |
| Three-job alignment | 2 | Job 2 strong, Job 1 partial, Job 3 weak (§14) |

### Final Question

**Can the current Ask Cozy/C2C architecture reasonably evolve into a message-first homeowner operating interface where users communicate primarily through natural language, Cozy retrieves relevant home context, provides personalized intelligence, captures and structures new information from conversation, persists that information safely, continuously improves the home's knowledge, and guides each interaction toward relevant next actions?**

**YES, WITH SIGNIFICANT REFACTORING.**

Not "no" — because the hard, expensive-to-build parts already exist and are largely sound: a disciplined LLM boundary, a real domain-service layer for several core decisions, a structured/extensible response contract, a durable event/notification backbone, and — with real head start, though not yet transactionally hardened — a fact-provenance and confirm-before-persist scaffold. None of this needs to be thrown away, and the request's own instruction not to reach for a new universal knowledge store or a new agent-per-domain pattern is validated by what's already here: `PropertyFactEvidence` and the HVAC decision-platform pattern are the right shapes to extend, not replace.

Not a clean "yes" — because the architecture's center of gravity (a closed, deterministic-first intent catalog dispatched from a single 10,150-line file) is built for a fundamentally different interaction model than "understand arbitrary natural language and structure whatever new information it contains." Three of the five representative scenarios in this audit missed routing on the tested phrasing today (§17 C/D/E) — but not for the same reason: D and E involve operations that already exist (`INTELLIGENCE_ENVELOPE_QUERY`'s component route, `SELL_HOLD_RENT_ANALYSIS`) that simply weren't matched by the current regex/example set, which this audit did not establish is unfixable by adding more of the same; C involves a fact shape (a completed event with a date, amount, and party) that has no catalog operation at all, regardless of phrasing, which the current closed-enum design cannot address without either a new enum member or a categorically different extraction path. Closing the full gap needs: something in the C category (a new operation or an open-vocabulary extraction stage — this audit does not establish which), a real capability-invocation layer (not another orchestrator branch), a generalized proactive-push hook (not two more bespoke callers), and a consolidation pass across four parallel provenance vocabularies. That is genuine, non-trivial refactoring — but it is refactoring *of* and *around* a foundation that is already largely correct, not a rebuild.

---

## 24. Recommended Next Stage

Per the instructions for this audit, no target architecture or implementation plan is proposed here. The factual baseline above supports, at minimum, these follow-on design questions for the next stage of work (not decisions, just the decisions this audit surfaces as now answerable):

1. How should a structured-extraction stage sit alongside the existing deterministic router — as a fallback like `GROUNDED_GUIDANCE` today, or as a parallel first-class classification path?
2. What does `capability.invoke(operationId, input)` need to look like to let `askOrchestrator.service.ts` shrink from a dispatcher-that-also-imports-everything to a true thin orchestrator over `services/skills/`?
3. How should capture channel (chat vs. form vs. document), extraction confidence, and confirmation state be modeled as independent fields rather than folded into a single new source-type value — and, separately, what should extraction confidence be used for, given that `docs/product/AI_HOME_CONCIERGE_ASK_TRUST_ARCHITECTURE_ADDENDUM_FRD.md` §18 already requires confirmation for every material write unconditionally? (Confidence should inform things like default value selection or whether to proactively clarify — not whether confirmation happens at all.)
4. Which notification producers (Home Event Radar first, given it's the most complete and most disconnected) should be generalized onto the `askNotificationContinuation` pattern first?
5. Is a provenance-vocabulary consolidation (toward `PropertyFactEvidence`'s shape) worth doing as its own slice before or alongside conversational capture, given how many subsystems it touches?
