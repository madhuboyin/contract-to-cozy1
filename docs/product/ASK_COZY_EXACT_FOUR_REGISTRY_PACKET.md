# Ask Cozy exact-four: actionable-profile registry packet (step 2 draft, for owner review)

**Status:** REVISION 4 (after the owner's third review; weights re-scored and frozen at `actionable-profile-1`, consumer references validated, outdoor dependencies applied; registry module is code-complete but NOT wired) for the C.15.4 step 3 owner review. Nothing in this packet is wired, and no registry code or Prisma schema has been written for it. Step 1 (the pure exact-four policy and diagnostics) is implemented and tested but not called from the live finalizer; the review's four policy findings are fixed (section 0). Governing scope: `ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN.md` Appendix C.15 and Ask Redo FRD §27.7a.

**Evidence labels (per `AUDIT_METHODOLOGY.md` / `feedback_audit_rigor_standards`).** *Executed*: produced by running the code (the fact/consumer tables and completeness examples below were generated from `factCatalog.ts`, `featureRequirementRegistry.ts` and `captureRegistry.ts`). *Code-read*: traced by reading source, not run. *Heuristic*: a grep count, signal only, not proof. Nothing here was exercised against the real backend.

## 0. Revision 2: what changed after owner review

**Step 1 policy fixes (code, tested; still not wired).**
1. *Producers cannot self-promote.* An explicit `slotClass`, a `CONTINUE` tier, a `PENDING_WORK` source or a `continuesPending` trait is now only a **request**. A server-owned `PRODUCER_SLOT_GRANTS` registry decides which classes a producer id may occupy. A request outside the grant is demoted to the grant's fallback, counted (`slotClassDenied`, reason `SLOT_CLASS_DENIED`), and then treated as an ordinary opportunity: cooldown and the one-unrelated-opportunity cap apply. An unregistered producer may only be `HOME_OPPORTUNITY`; the result producer may continue work and fix records but may not claim urgent work or starters.
2. *Confidence is not a why-now signal.* A reserved opportunity needs current-answer ownership, an active-goal match, or a **registered** why-now reason token; confidence (at least 0.5) only qualifies the signal. `REGISTERED_WHY_NOW_REASONS` is intentionally empty until the opportunity producer review in step 4, so no opportunity is "strong" through that path yet.
3. *Unknown completeness fails profile-first.* `null` now runs the same profile-first regime as below 90% and is reported as `completenessUnknown` (even on a full row).
4. *Counters measure executions.* `ask_suggested_actions_exact_four_total{result}` increments exactly once per execution; reasons go to a separate `ask_suggested_actions_exact_four_reasons_total{result,reason}` that must not be summed as an answer count.

**Revision 3 (second owner review).**
- *Producer identity is bound to the registered producer.* `evaluateSuggestedNextActionPool` now overwrites each candidate's `producerId` with the nominations-map key (the finalizer keys by `producer.id`), so a candidate cannot claim another producer's slot grant by naming it. Covered by a test where an unprivileged producer returns a candidate claiming a privileged id; the grant, the denied counter and cooldown eligibility all follow the bound identity, in both the exact-four and the legacy policy.
- *D11 applied.* `location.state` and `location.zipCode` (and `city`) leave the denominator. They stay in the home record and available to consumers; a missing one on a legacy or imported record is a **record-integrity correction**, not profile backfill. Two concepts stay distinct: *record foundation* and *actionable completeness*.
- *D12 applied, with a governed phase definition* (section 5).
- *Hazard/geography facts deferred.* `inFloodZone`, `inHurricaneZone`, `inWildfireZone`, `isCoastal` and `inHistoricDistrict` are removed from the first activation (all five; I did not keep historic district). They are source-backed geographic classifications; a wrong household answer could mislead safety guidance, and "the edit endpoint can write them" is not a reason to ask for them. They return when there is an authoritative lookup or a governed manual-confirmation path with source and evidence semantics. My earlier "household-answered" conclusion from a negative grep was wrong and is withdrawn.
- *Mortgage status:* the new catalog fact and assembler entry are approved; the `UNKNOWN` precondition is enforced atomically with the write (section 9).
- *Registry module drafted* at `suggestedActions/actionableProfileRegistry.ts` (not wired, weights provisional), with `tests/ask/actionableProfileRegistry.test.js`.

**Revision 4 (third owner review).**
- *Candidate contract no longer carries producer identity.* `producerId` is removed from `SuggestedNextActionCandidateSchema`; a candidate that supplies one is invalid. The authoritative registered producer id travels beside the candidate (`producerByCandidate`, and `SelectedCandidate.producerId`), populated from the nominations key. The six handler and recovery call sites that set a descriptive label were updated.
- *Consumer references are bounded and resolved.* Free-form prose is gone. Every consumer is `feature:<KEY>` (must be a real, non-wrapper requirement that requires or enhances the fact) or `evidence:<ID>` (an entry in the new `PROFILE_CONSUMER_EVIDENCE` registry: bounded id, `impact` DECISION or CONTEXT, source file, and per-fact tokens that must appear in that file). Tests resolve every reference, reject orphan evidence entries, and check each evidence entry is declared by the facts it reads. **Limit:** the source check is textual presence (file exists and still names the fact or its Property column); behavioral proof exists only for the executed subset (`actionableProfileConsumerEvidence.test.js`).
- *Outdoor applicability completed.* With `hasPrivateOutdoorSpace = false`, these are not applicable: `outdoorSpaceTypes`, `hasLawn`, `hasIrrigation`, `hasTreesOrShrubs`, `responsibility.landscaping`, `responsibility.treesShrubs`, `responsibility.deckPatioBalcony`. Domain basis: `OutdoorSpaceType` enumerates private yard, balcony, patio, deck, garden bed, shared yard and rooftop; `domain/facts.ts` rejects `false` together with any space type; the `OUTDOOR_SPACE_PROFILE` capture already gates landscaping responsibility on it. `deckPatioBalcony` is included beyond your minimum list because deck, patio and balcony are the enumerated private outdoor space types. **Not** governed (merely uncommon, not impossible): driveway, pool or spa, outdoor faucets, driveway/walkway responsibility.
- *Governor-first.* A dependent whose governing fact is unresolved (unknown, stale or conflicted) stays applicable and counted, but is excluded from the area's `askNowFactKeys` allowlist until the governor is answered; the governor is asked first. A dependent governed from another area waits for that area's flow, so a chip must be offered only when `askNowFactKeys` is non-empty.
- *Weights re-scored and frozen.* One derivable rule (below) replaces the two mixed rules; a test recomputes every weight from the live requirement registry, the evidence `impact` tags and the `safety` flag, and a snapshot hash freezes the registry at `actionable-profile-1`. Base denominator weight is still 100 (44 facts); 11 facts moved.

**Registry packet changes (revision 2).** Section 4 is now the D2 evidence matrix. D6 and the lifecycle schema (sections 5 and 8) are corrected. Decisions D1, D3, D5, D7 are recorded as approved with the requested conditions (section 9); two new decisions (D11, D12) came out of the matrix.

## 1. Findings that change the plan (read first)

1. **The profile-capture launcher is area-scoped, not fact-scoped (code-read).** The operation that opens a profile capture is `PROPERTY_CONTEXT_AREA_CAPTURE` (CONTRIBUTOR floor). It works per area (`CORE, LOCATION, STRUCTURE, EXTERIOR, RESPONSIBILITY, SYSTEMS, SAFETY`), and today its launch actions carry a *message* (`AREA_CAPTURE_MESSAGES[scope]`) rather than a typed scope input. `CAPTURE_FACT_CONFIRM` is the confirm step of a conversational capture, not a launcher, and declares one outcome (`CAPTURE_PROPERTY_FACT`). So profile-gap chips are naturally **one chip per area**, with a bounded outcome per area on `PROPERTY_CONTEXT_AREA_CAPTURE`. Needed work: confirm the handler can take the area as typed launch input so selection never re-parses the message (plan §4: no semantic reclassification).
2. **The area flow asks every fact in the area, including facts nothing consumes (code-read + executed).** The `PROPERTY_RECORD_SUMMARY:CAPTURE_AREA` contract lists every writable fact in those scopes as an enhancement. Of 62 writable, non-sale-prep facts in scope, **26 have a live non-capture consumer in the requirement registry; 36 have none there.** If the denominator uses only consumed facts (C.15.1) but the launched flow still asks the other 76, a chip that says "2 missing" would open a longer flow than it advertised and would collect facts nothing uses. Proposed fix: a server-controlled allowlist of registry fact keys for the area flow, treated like the existing server-controlled `skipFactKeys` (facts outside the allowlist are left out when choosing the next question; nothing is written).
3. **Mortgage status has no Ask capture today (code-read).** `PropertyFinancingProfile.mortgageStatus` (`UNKNOWN | MORTGAGED | NO_MORTGAGE`) exists, but the only registered financing capture is the rate writer (`capturePropertyFinancingFact`, fact `financial.currentMortgage`, `CONTRIBUTOR` floor). There is no status, balance or term capture. C.15.2 requires "confirm status before rate" when applicability is unknown, so a mortgage chip cannot ship until a status capture exists (see decision D5).
4. **Room-light capture is not an Ask capture (code-read, partial).** Light data lives in the Plant Advisor module (`roomPlantAdvisor.*`, `PlantLightLevel`); `InventoryRoom` only has a free-form `profile` JSON. The C.15.1 example "Add light details for the living room" therefore has no registered Ask capture or direct launch yet. Only "Find plants that fit your rooms" (`PLANT_CARE_OUTLOOK`) is launchable today.
5. **A new home starts well below 90% under this definition (executed).** With the proposed weights, a home that has only its creation-time facts scores about 21%, so the profile-first regime is the normal state for most homes until the household has answered roughly 15-20 details. Opportunities will normally be capped at one slot for a long time. That is consistent with C.15.1, but it is the real shape of the product, so it should be a conscious choice.
6. **Viewer-role households can get routine shortages (code-read).** Profile captures need CONTRIBUTOR. For a VIEWER the existing authorization rule makes every profile chip ineligible, so a below-90% viewer can produce a shortage whenever opportunities and starters cannot fill the row. That contradicts "no routine shortages" unless viewers get eligible read-only fill (D7).
7. **Skips are not persisted today (code-read).** `skipFactKeys` is execution-scoped and writes nothing. C.15.1 excludes "reviewed optional skips" from the denominator, which needs durable state (D6).

## 2. Registry shape (versioned data, not handler prose)

Proposed module: `suggestedActions/actionableProfileRegistry.ts`, version `actionable-profile-1`. Per entry: `factKey`, `area` (scope), `materiality` (1-3, derived), `role`, `audience`, `safety`, `consumers[]` (bounded `feature:` / `evidence:` references), `appliesWhen` (one governing fact; the catalog's `notApplicableWhen` is injected at evaluation). A test would cross-check every entry against `PROPERTY_FACT_CATALOG` (key exists, writable, scope matches), `captureRegistry` (capture exists), and `featureRequirementRegistry` (every listed consumer actually requires or enhances the fact). Completeness = sum of materiality of KNOWN applicable registry facts / sum of materiality of applicable registry facts. `STALE`, `CONFLICTED` and `UNKNOWN` count as not known.

## 3. Final weights and facts (re-scored and frozen at `actionable-profile-1`)

**Rule (derivable; verified by test).** Weight **3** = a safety-class fact (`safety.hasSmokeDetectors`, `hasCoDetectors`, `hasFireExtinguisher`, `hasSumpPump`, `hasSumpPumpBackup`, `structure.roofType`) or four or more DECISION consumers; **2** = at least one DECISION consumer; **1** = none. A feature consumer is DECISION when its requirement is `REQUIRED_*` (not `ENHANCEMENT_ACCURACY`); an evidence consumer by its declared `impact`. DECISION means the consumer's output changes eligibility, applicability, risk, a score, an alert or a value estimate; CONTEXT means descriptive context or completeness tracking only (`SERVICE_PRICE_RADAR`, `HOME_DIGITAL_TWIN_QUALITY`, `HOME_DIGITAL_TWIN_BUILDER`). The DECISION/CONTEXT tags and the safety set are judgment calls for your review.

**Base denominator: 44 facts, weight 100** (16 at weight 3, 24 at 2, 4 at 1). Address identity (`state`, `zipCode`, `city`) is excluded by D11 and the five hazard facts by the deferral.

| Fact | Area | Weight | Role | Applies only when | Consumers (`~` = evidence registry entry) |
|---|---|---|---|---|---|
| `responsibility.buildingExterior` | RESPONSIBILITY | 3 | included | - | COVERAGE_INTELLIGENCE, HOA_COMPLIANCE, PERMITS, PROJECTS |
| `responsibility.commonSafety` | RESPONSIBILITY | 3 | included | - | COVERAGE_INTELLIGENCE, HOA_COMPLIANCE, MAINTENANCE, PERMITS |
| `responsibility.hvac` | RESPONSIBILITY | 3 | included | - | COVERAGE_INTELLIGENCE, ENERGY, MAINTENANCE, PERMITS, PROJECTS |
| `responsibility.landscaping` | RESPONSIBILITY | 3 | included | `hasPrivateOutdoorSpace = true` | HOA_COMPLIANCE, MAINTENANCE, PERMITS, PLANT_ADVISOR, PROJECTS |
| `responsibility.plumbing` | RESPONSIBILITY | 3 | included | - | COVERAGE_INTELLIGENCE, MAINTENANCE, PERMITS, PROJECTS |
| `responsibility.roof` | RESPONSIBILITY | 3 | included | - | COVERAGE_INTELLIGENCE, HOA_COMPLIANCE, MAINTENANCE, PERMITS, PROJECTS, PROTECTION |
| `responsibility.sharedSystems` | RESPONSIBILITY | 3 | included | - | COVERAGE_INTELLIGENCE, HOA_COMPLIANCE, PERMITS, PROJECTS |
| `safety.hasCoDetectors` | SAFETY | 3 (safety) | included | - | MAINTENANCE, ~SEASONAL_APPLICABILITY |
| `safety.hasFireExtinguisher` | SAFETY | 3 (safety) | included | - | ~EMERGENCY_APPLICABILITY, ~HEALTH_SCORE, ~HABIT_COACH |
| `safety.hasSmokeDetectors` | SAFETY | 3 (safety) | included | - | MAINTENANCE, PERSONALIZATION, ~SEASONAL_APPLICABILITY |
| `safety.hasSumpPump` | SAFETY | 3 (safety) | included | - | ~EMERGENCY_APPLICABILITY, ~RADAR_IMPACT_RULES, ~RADAR_COMPOUND_RULES |
| `safety.hasSumpPumpBackup` | SAFETY | 3 (safety) | included | `hasSumpPump = true` | ~EMERGENCY_APPLICABILITY, ~RADAR_COMPOUND_RULES |
| `structure.roofReplacementYear` | STRUCTURE | 3 | included | - | ~HEALTH_SCORE, ~RISK_CALCULATOR, ~RADAR_IMPACT_RULES, ~SALE_CASE_MANDATORY, ~PERSONALIZATION_TRAITS |
| `structure.roofType` | STRUCTURE | 3 (safety) | included | - | PROTECTION, ~HEALTH_SCORE |
| `systems.hvacInstallYear` | SYSTEMS | 3 | included | - | ~HEALTH_SCORE, ~RISK_CALCULATOR, ~RADAR_IMPACT_RULES, ~SALE_CASE_MANDATORY, ~HOME_DIGITAL_TWIN_QUALITY |
| `systems.waterHeaterInstallYear` | SYSTEMS | 3 | included | - | ~HEALTH_SCORE, ~RISK_CALCULATOR, ~RADAR_IMPACT_RULES, ~SALE_CASE_MANDATORY |
| `core.dwellingType` | CORE | 2 | included | - | BREAK_EVEN, BUDGET_PLANNER, HIDDEN_ASSETS, HOME_ACTIONS, OWNERSHIP_COSTS, PROPERTY_TAX, TAX_APPEAL, ~CATALOG_APPLICABILITY |
| `core.ownershipForm` | CORE | 2 | prerequisite | - | ~CATALOG_APPLICABILITY, ~BUYER_CHECKLIST |
| `core.propertyUse` | CORE | 2 | included | - | BREAK_EVEN, BUDGET_PLANNER, DO_NOTHING, HIDDEN_ASSETS, HOME_ACTIONS, HOME_SAVINGS, OWNERSHIP_COSTS, SELLER_PREP, SELL_HOLD_RENT, TAX_APPEAL |
| `exterior.hasDrainageIssues` | EXTERIOR | 2 | included | - | ~HEALTH_SCORE, ~RISK_CALCULATOR, ~RADAR_IMPACT_RULES |
| `exterior.hasDriveway` | EXTERIOR | 2 | included | - | ~SEASONAL_APPLICABILITY |
| `exterior.hasIrrigation` | EXTERIOR | 2 | included | `hasPrivateOutdoorSpace = true` | MAINTENANCE, PLANT_ADVISOR, ~SEASONAL_APPLICABILITY |
| `exterior.hasLawn` | EXTERIOR | 2 | included | `hasPrivateOutdoorSpace = true` | MAINTENANCE, ~SEASONAL_APPLICABILITY |
| `exterior.hasOutdoorFaucets` | EXTERIOR | 2 | included | - | ~SEASONAL_APPLICABILITY |
| `exterior.hasPoolOrSpa` | EXTERIOR | 2 | included | - | ~SEASONAL_APPLICABILITY, ~ENERGY_APPLICABILITY, ~BUYER_CHECKLIST |
| `exterior.hasPrivateOutdoorSpace` | EXTERIOR | 2 | included | - | PLANT_ADVISOR, ~SEASONAL_APPLICABILITY |
| `exterior.hasTreesOrShrubs` | EXTERIOR | 2 | included | `hasPrivateOutdoorSpace = true` | MAINTENANCE, ~SEASONAL_APPLICABILITY |
| `exterior.lotSizeSqFt` | EXTERIOR | 2 | included | - | ~PROPERTY_TAX_APPEAL_READINESS |
| `exterior.outdoorSpaceTypes` | EXTERIOR | 2 | included | `hasPrivateOutdoorSpace = true` | ~SEASONAL_APPLICABILITY |
| `responsibility.deckPatioBalcony` | RESPONSIBILITY | 2 | included | `hasPrivateOutdoorSpace = true` | HOA_COMPLIANCE, PERMITS, PROJECTS |
| `responsibility.drivewayWalkways` | RESPONSIBILITY | 2 | included | - | HOA_COMPLIANCE |
| `responsibility.pestControl` | RESPONSIBILITY | 2 | included | - | MAINTENANCE |
| `responsibility.snowIce` | RESPONSIBILITY | 2 | included | - | ~SEASONAL_APPLICABILITY |
| `responsibility.treesShrubs` | RESPONSIBILITY | 2 | included | `hasPrivateOutdoorSpace = true` | ~SEASONAL_APPLICABILITY |
| `safety.hasSecuritySystem` | SAFETY | 2 | included | - | ~HEALTH_SCORE, ~RISK_PREMIUM_OPTIMIZER, ~NEGOTIATION_SHIELD_PREMIUM |
| `structure.electricalPanelAgeYears` | STRUCTURE | 2 | included | - | ~RISK_CALCULATOR, ~RISK_PREMIUM_OPTIMIZER, ~SALE_CASE_MANDATORY, ~HOME_DIGITAL_TWIN_QUALITY |
| `structure.foundationType` | STRUCTURE | 2 | included | - | ~RISK_CALCULATOR, ~RADAR_IMPACT_RULES, ~SERVICE_PRICE_RADAR |
| `systems.coolingType` | SYSTEMS | 2 | included | - | ~HEALTH_SCORE, ~RADAR_IMPACT_RULES, ~SERVICE_PRICE_RADAR, ~HOME_DIGITAL_TWIN_QUALITY |
| `systems.heatingType` | SYSTEMS | 2 | included | - | ENERGY, MAINTENANCE, ~HEALTH_SCORE |
| `systems.waterHeaterType` | SYSTEMS | 2 | included | - | MAINTENANCE, ~HEALTH_SCORE |
| `core.occupancyStatus` | CORE | 1 | included | - | BREAK_EVEN, BUDGET_PLANNER, DO_NOTHING, HIDDEN_ASSETS, HOME_ACTIONS, HOME_SAVINGS, OWNERSHIP_COSTS, SELL_HOLD_RENT, TAX_APPEAL |
| `core.propertySizeSqFt` | CORE | 1 | included | - | PROPERTY_TAX, TAX_APPEAL |
| `core.yearBuilt` | CORE | 1 | included | - | BUDGET_PLANNER |
| `structure.sidingType` | STRUCTURE | 1 | included | - | ~SERVICE_PRICE_RADAR, ~HOME_DIGITAL_TWIN_BUILDER |

**Audience-conditional: 7 facts, weight 14**, counted only while the audience is active (section 5).

| Fact | Area | Weight | Audience / role | Applies only when | Consumers (`~` = evidence registry entry) |
|---|---|---|---|---|---|
| `core.bathrooms` | CORE | 2 | SELLER | - | ~SALE_PREP_VALUE_CATALOG |
| `core.bedrooms` | CORE | 2 | SELLER | - | ~SALE_PREP_VALUE_CATALOG |
| `structure.basementConfiguration` | STRUCTURE | 2 | BUYER | - | ~BUYER_CHECKLIST |
| `systems.hasFireplace` | SYSTEMS | 2 | BUYER | - | ~BUYER_CHECKLIST |
| `systems.hasSolar` | SYSTEMS | 2 | BUYER | - | ~BUYER_CHECKLIST |
| `systems.sewerSystem` | SYSTEMS | 2 | BUYER | - | ~BUYER_CHECKLIST |
| `systems.waterSource` | SYSTEMS | 2 | BUYER | - | ~BUYER_CHECKLIST |

**What moved in the re-score (11 facts).** `core.propertyUse` 3 to 2 (one of its ten consumers is required); `core.dwellingType` 1 to 2 (gates the exterior facts); `structure.electricalPanelAgeYears` 3 to 2 (three decision consumers; see the open item below); `exterior.lotSizeSqFt` 1 to 2; and the seven audience-conditional facts 1 to 2 (each has one decision consumer: a checklist or value item). The base total is unchanged at 100.

**Open judgment for you.** `structure.electricalPanelAgeYears` feeds fire and insurance risk but is not in the safety set, so the rule gives it 2. Adding it to the safety set makes it 3 and the base weight 101.

## 4. D2 evidence matrix for the 36 unconfirmed facts

*Revision 4 note: the materiality shown in this matrix is superseded by the final weights in section 3; the matrix is kept as the evidence record (classification and consumers).*

**Method and labels.** Snapshot mapping is from `prismaAssemblers.ts` (code-read). A consumer is named only where I read the code that branches on the fact. **Executed** means `tests/ask/actionableProfileConsumerEvidence.test.js` (11 tests, passing) runs the consumer with and without the fact and shows the decision change; **code-read** means I read it but did not run it. Grep counts were used only to find candidates. Classification: **included** (named consumer), **prerequisite-only** (governs applicability of consumer-backed facts; enters the denominator), **audience-conditional** (consumer exists only in the buyer or seller track; enters the denominator only for that audience, see D12), **excluded**.

Capture path for every row below is its scalar capture key in `captureRegistry.ts` (for example `CORE_OWNERSHIP_FORM`), launched through the area flow once D3's server-owned mapping exists. The canonical source for every row is the `Property` (or `PropertyExteriorProfile` / `PropertyResponsibility`) column named in the catalog's `canonicalOwner`; snapshot lines are in `prismaAssemblers.ts` 89-367.

| Fact | Named consumer and behavior | Applicability dependency | Proof | Class (materiality) |
|---|---|---|---|---|
| `core.ownershipForm` | `buyerChecklistComposition.service.ts:71-86` decides association-context checklist items; catalog `notApplicableWhen` removes `lotSizeSqFt`, `hasFence`, `hasPoolOrSpa`, `hasOutdoorFaucets` for association ownership | governs four exterior facts | code-read | **prerequisite-only (2)** |
| `core.isPrimary` | none found: the `isPrimary` hits are contacts and coverage-review questions, not `Property.isPrimary` | none | code-read | excluded |
| `core.bedrooms` | `data/salePrepValueCatalog.ts` scales the staging value estimate by bedrooms (seller track); also RentCast-auto-filled (`propertyEnrichmentStatus`) | seller audience | code-read | **audience-conditional: SELLER (1)** |
| `core.bathrooms` | same seller value catalog; RentCast-auto-filled | seller audience | code-read | **audience-conditional: SELLER (1)** |
| `location.city` | AI prompt context (`ai-constants.ts`), seller-prep comps provider, hidden-savings historic rule | none | code-read | excluded: address identity, always set at creation (D11) |
| `location.timezone` | `dailyHomePulse.service.ts` and radar notification preferences read `property.timezone` | none | code-read | excluded from the household questions: derive from geocode (open follow-up) |
| `location.isCoastal` | `seasonal/applicabilityPolicy.ts:173`: unknown asks, false removes coastal seasonal tasks | none | **executed** | **deferred (hazard fact)** |
| `location.inHistoricDistrict` | `hiddenAssets/categoryConfig.ts:181-185` eligibility rule for the historic-district category | none | code-read | **deferred (hazard fact)** |
| `location.inHurricaneZone` | hidden-savings category eligibility (`categoryConfig.ts:119,196`); buyer inspection composition | none | code-read | **deferred (hazard fact)** |
| `location.inFloodZone` | hidden-savings category eligibility (`categoryConfig.ts:120,196`); buyer inspection composition | none | code-read | **deferred (hazard fact)** |
| `location.inWildfireZone` | hidden-savings category eligibility (`categoryConfig.ts:196`); buyer inspection composition | none | code-read | **deferred (hazard fact)** |
| `structure.roofReplacementYear` | health score, risk calculator, Home Event Radar impact (`radarImpactRules.ts:210,250`), personalization trait, sale-case mandatory field (`propertySaleCase.service.ts:924`) | none | code-read | **included (3)** |
| `structure.foundationType` | `riskCalculator.util.ts:157-160` decides whether foundation risk applies; radar impact; service price radar | none | code-read | **included (2)** |
| `structure.basementConfiguration` | `buyerChecklistComposition.service.ts:285` basement checklist items; entry context | buyer audience | code-read | **audience-conditional: BUYER (1)** |
| `structure.sidingType` | service price radar context (`servicePriceRadar.service.ts:197`), digital-twin builder; RentCast-auto-filled | none | code-read | **included (1)** |
| `structure.electricalPanelAgeYears` | `riskCalculator.util.ts:149-152`, `riskPremiumOptimizer.service.ts:993,1001`, sale-case mandatory field, digital twin | none | code-read | **included (3)** |
| `exterior.outdoorSpaceTypes` | `seasonal/applicabilityPolicy.ts:159`: deck task applies only when types include `DECK` | only when `hasPrivateOutdoorSpace = true` | **executed** | **included (2)** |
| `exterior.lotSizeSqFt` | tax-appeal readiness input (`propertyTaxAppealReadiness.service.ts:170,228`); RentCast-auto-filled | catalog rule (attached/association) | code-read | **included (1)** |
| `exterior.hasDriveway` | `seasonal/applicabilityPolicy.ts:149`: false removes driveway tasks | none | **executed** | **included (2)** |
| `exterior.hasFence` | none found beyond property CRUD | catalog rule | code-read | excluded |
| `exterior.hasPoolOrSpa` | seasonal pool tasks (`:144`), `energy/applicabilityPolicy.ts:48`, buyer checklist, energy auditor | catalog rule | **executed** (seasonal) | **included (2)** |
| `exterior.hasOutdoorFaucets` | `seasonal/applicabilityPolicy.ts:214`: freeze-protection task | catalog rule | **executed** | **included (2)** |
| `exterior.hasDrainageIssues` | `radarImpactRules.ts:515-521`, risk calculator, health score | none | code-read | **included (2)** |
| `responsibility.treesShrubs` | `seasonal/applicabilityPolicy.ts:60`: tree tasks removed when association or landlord responsible | follows `hasTreesOrShrubs` | **executed** | **included (2)** |
| `responsibility.snowIce` | `seasonal/applicabilityPolicy.ts:63`: snow tasks removed when association or landlord responsible | climate region | **executed** | **included (2)** |
| `systems.coolingType` | `propertyScore.util.ts:172`: the Systems factor scores only when heating, cooling and water-heater types are all known; radar; price radar | none | code-read | **included (2)** |
| `systems.waterSource` | `buyerChecklistComposition.service.ts:313` well-water checklist items | buyer audience | code-read | **audience-conditional: BUYER (1)** |
| `systems.sewerSystem` | `buyerChecklistComposition.service.ts:326` septic checklist items | buyer audience | code-read | **audience-conditional: BUYER (1)** |
| `systems.hasSolar` | `buyerChecklistComposition.service.ts:339` solar checklist items | buyer audience | code-read | **audience-conditional: BUYER (1)** |
| `systems.hasFireplace` | buyer checklist; RentCast-auto-filled. The seasonal fireplace task reads `installedItemTypes`, not this fact | buyer audience | code-read | **audience-conditional: BUYER (1)** |
| `systems.hvacInstallYear` | health score HVAC age (`propertyScore.util.ts:232`), risk calculator (`:207`), radar impact, digital twin, sale-case mandatory | none | code-read | **included (3)** |
| `systems.waterHeaterInstallYear` | health score (`propertyScore.util.ts:252`), risk calculator, radar impact, sale-case mandatory | none | code-read | **included (3)** |
| `safety.hasSecuritySystem` | health score, `riskPremiumOptimizer.service.ts:493` premium discounts, hidden savings, negotiation shield | none | code-read | **included (2)** |
| `safety.hasFireExtinguisher` | health score, `emergency/applicabilityPolicy.ts:20`, hidden savings, habit coach | none | code-read | **included (3)** safety |
| `safety.hasSumpPump` | radar impact and compound rules, hidden savings, emergency applicability | none | **executed** (radar compound) | **included (3)** safety |
| `safety.hasSumpPumpBackup` | `radarCompoundRules.ts:227`: sump without backup raises the rain-plus-outage insight, unknown backup still raises it | only when `hasSumpPump = true` | **executed** | **included (3)** safety, conditional |

**Outcome (revision 3).** Of the 36: **19 included**, **7 audience-conditional** (5 buyer, 2 seller), **1 prerequisite-only** (`core.ownershipForm`), **4 excluded** (`isPrimary`, `city`, `timezone`, `hasFence`), **5 deferred** (the hazard/geography facts). With the 24 in section 3 that is 43 included facts plus 1 prerequisite in the base denominator (44 facts, weight 100), and 7 audience-conditional facts that join only while their audience is active. The section 3 weights above were set by the earlier rule; the materiality column here uses an extended rule for facts with no registry classification: **3** = safety or four or more distinct consumer families, **2** = gates a decision or applicability, **1** = context or enhancement. I would re-score section 3 under the same rule before freezing weights (D1 says not to freeze yet).

**Hazard-zone flags (deferred, revision 3).** The seasonal `isCoastal` consumer was executed and is real, but consumer evidence is not enough: these are geographic classifications that need an authoritative source or a governed confirmation path with evidence semantics. The earlier inference that they are household-answered because the property edit path writes them was wrong and is withdrawn.

**Prerequisites confirmed by the matrix (D1).** `core.dwellingType` and `core.ownershipForm` gate four exterior facts today; `exterior.hasPrivateOutdoorSpace` gates `outdoorSpaceTypes` and, through `seasonal/applicabilityPolicy.ts:159-165`, the deck decision (executed); `responsibility.landscaping`/`hasTreesOrShrubs` gate their tasks. Safety facts, HVAC and water-heater install years and roof replacement year all have named multi-consumer evidence and are therefore not low-weight or excluded. Not yet verified: whether RentCast enrichment fills enough of the `RENTCAST_SUPPORTED_FACT_KEYS` set (bedrooms, bathrooms, lot size, heating, cooling, roof type, foundation, siding, fireplace, pool) that these rarely appear as gaps; that affects which chips surface, not the denominator.

**Always excluded (by C.15.1):** derived or read-only facts (`location.county`, `countyFips`, `geocoded`, `climateRegion`, `structure.roofAgeYears`, `systems.hasCooling`, `core.activationStatus`); product setup state (`product.*`); operational-record existence (`maintenance.tasks`, `inspection.*`, `coverage.activeClaims`, `risk.*`, `recalls.*`, `events.*`, `guidance.*`, `compliance.*`, `projects.*`, financial scenarios and reports); `salePrep.*`.

**Relational facts needing a coverage definition (not in the 26):** `systems.installedItemTypes`, `inventory.items`, `rooms.list`, `coverage.insurancePolicies`, `coverage.warranties`. C.15.1 allows "rooms and major inventory coverage" but does not define it. Proposal for review: count only `systems.installedItemTypes` (consumed by `HOME_SAVINGS`, `HIDDEN_ASSETS`, `MAINTENANCE`), satisfied when each applicable major system category has at least one inventory item or an explicit "none" confirmation. Rooms and warranties stay out of the denominator until a consumer-backed definition is approved.

## 5. Applicability, stale/conflicted, skips, roles

- **Applicability** uses the catalog's `notApplicableWhen` (four exterior facts for attached or association dwellings). Proposed additions, each needing a rule and a fixture: `responsibility.*` for an attached unit already carry association semantics, so no change; `hasIrrigation`/`hasLawn`/`hasTreesOrShrubs` become inapplicable when `hasPrivateOutdoorSpace = false` (the Plant Advisor requirement contract uses the same condition for its own applicability; applying it to these facts is a new rule that needs your approval); `responsibility.landscaping` follows `hasPrivateOutdoorSpace`. A condition on an unknown fact never disqualifies (existing rule).
- **Outdoor dependencies (reviewed, revision 4).** See section 0. Seven facts are governed by `hasPrivateOutdoorSpace = true`; unknown-governor behavior is governor-first (`askNowFactKeys`). One review item remains: `responsibility.treesShrubs` is arguably also governed by `hasTreesOrShrubs = true` (the seasonal policy reads it only after trees are present); the registry supports one governor per fact, so chaining is not modeled yet.
- **Audience phase (D12, governed signals only).** `BUYER` is active when a buyer workflow or checklist is active for the property, or an explicit active buyer goal is recorded; `SELLER` when a sale case is active, or an explicit active selling goal is recorded. Both active apply the union; neither excludes all seven conditional facts from numerator and denominator. The audience is **never** inferred from property type, generic homeowner status or speculative intent. When an audience activates the denominator grows and completeness may fall; `computeActionableCompleteness` returns `audiences` and `denominatorVersion` (`actionable-profile-1:BASE`, `...:BUYER`, `...:SELLER`, `...:BUYER+SELLER`) so a change is explainable and testable. Open work for step 4: the adapter that reads those governed signals (the registry takes `activeAudiences` as an input and does not read them itself).
- **Stale and conflicted** facts remain in the denominator as not known. Chip copy differs only in wording ("Confirm" vs "Add"); both launch the same area capture.
- **"Doesn't apply" and skips (D6, revised).** A preference never becomes applicability. "Doesn't apply" enters a **governed applicability flow**: it is offered only where a supported, validated state makes the fact inapplicable (for example `hasPrivateOutdoorSpace = false` removes the deck/landscaping chain, or ownership form becomes association), and the user records that state itself; the fact leaves the denominator only because that validated applicability fact changed. Where no such state exists, "Doesn't apply" behaves exactly like "Not now": a 30-day cooldown on the lifecycle record, with the fact **staying in the denominator**. There is no `DOESNT_APPLY` or `NOT_RELEVANT`-based durable exclusion. The `skipFactKeys` mechanism stays execution-scoped and writes nothing.
- **Roles.** The area-capture floor is CONTRIBUTOR and is enforced by the existing authorization eligibility rule. No separate role logic in the registry.

## 6. Outcome and launch mapping

| Item | Proposal |
|---|---|
| Launch operation | `PROPERTY_CONTEXT_AREA_CAPTURE`, `START_WORKFLOW`, typed area input |
| Server-owned mapping (D3) | `outcomeKey -> area scope -> permitted fact keys`, owned by the registry. The client sends neither a scope nor a fact list; selection resolves both from the stored action's outcome key, and the message text is display-only. The chip's count is the number of currently applicable, allowlisted, unresolved facts in that area |
| Outcome keys (7) | `CAPTURE_CORE_DETAILS`, `CAPTURE_LOCATION_DETAILS`, `CAPTURE_STRUCTURE_DETAILS`, `CAPTURE_EXTERIOR_DETAILS`, `CAPTURE_RESPONSIBILITY_DETAILS`, `CAPTURE_SYSTEMS_DETAILS`, `CAPTURE_SAFETY_DETAILS`, declared in `SUGGESTED_ACTION_OUTCOMES` |
| Semantic identity | operation + `START_WORKFLOW` + property + null entity + area outcome, so seven areas are seven distinct, deduplicable actions (checked against `suggestedNextActionSemanticKey`) |
| Missing-fact mapping | `MISSING_FACT_CAPTURES` gains `CONTEXT_CAPTURE` rows from each included fact to its area outcome (capture kind already exists in the type) |
| Chip label | outcome-led and concrete: "Add the 3 missing safety details" style, naming the area and the count of registry facts missing, never "Add details" |
| Completion | selecting records `selectedAt`; the area capture's receipt records `completedAt`; durable suppression uses the lifecycle record, because today's `completedSemanticKeyHashes` is session-scoped |
| Mortgage | not mapped until D5 is decided |

## 7. Score, ordering and worked examples

**Ordering inside the profile class** (implemented in step 1): materiality of the area's highest-materiality missing fact, descending, then the shared deterministic order (outcome key, then message). Because chips are per area, I propose area `materiality` = the maximum materiality among its missing registry facts, and a registry `areaOrder` (`SAFETY, SYSTEMS, STRUCTURE, RESPONSIBILITY, EXTERIOR, CORE, LOCATION`) as the tie-break. Step 1's policy currently falls back to outcome-key order on a tie, so using `areaOrder` needs a small optional `slotRank` field on the candidate (D4).

**Completeness examples** (illustrative, computed from the draft registry; base denominator is 44 facts, weight 100; 90% means at least 90 known weight; `tests/ask/actionableProfileRegistry.test.js` runs the first and last):

| Home state | Known weight | Completeness | Regime |
|---|---|---|---|
| `propertyUse`, `dwellingType`, `occupancyStatus`, `propertySizeSqFt`, `yearBuilt` known | 7 | 7% | below 90%: profile-first, at most one opportunity |
| Everything answered except `roofType` and `hasIrrigation` | 95 | 95% | at or above 90%: opportunities may fill |
| A buyer audience activates on the home above (adds 5 conditional facts, weight 10) | 95 of 110 | 86.4% | falls below 90%: activation legitimately lowers completeness and reports `denominatorVersion` `actionable-profile-1:BUYER` |

A creation-only home is now at 7% rather than 21%: with D11 the score no longer includes address facts, so most homes will spend a long time profile-first. That is the intended reading of D11, but it makes the first activation heavily profile-weighted.

**Acceptance example from C.15.3** (current answer has no other compact continuation, home below 90%): four actions = up to three distinct area captures (for example safety, systems, responsibility) plus one strongly relevant opportunity. This needs at least three areas with missing registry facts; a home with creation-time facts only has gaps in every area except part of CORE and LOCATION, so it qualifies, but I have not measured real homes. The opportunity slot depends on the opportunity producer (step 4).

## 8. Lifecycle record and cooldown defaults (IMPLEMENTED in `schema.prisma` and `askSuggestedActionLifecycle.service.ts`; needs `prisma db push`; not wired)

**Implemented (step 5).** The model below is in `prisma/schema.prisma` exactly as drafted (with `User` and `Property` cascade relations and the table name `ask_suggested_action_lifecycles`). `suggestedActions/askSuggestedActionLifecycle.service.ts` records offers, selection, completion and explicit dismissal and loads the suppressed lifecycle keys; the exact-four policy now takes `cooldownLifecycleKeys` (operation + outcome + entity scope) instead of semantic hashes, because that is the record's identity. Writes are best effort and fail open; every extension of suppression is a single raise-only conditional update, so concurrent offers can only lengthen a cooldown and an offer never shortens a longer "Not now". A failed read applies no cooldown and reports `ok: false`. Curated starters get no hard cooldown; they rotate softly (see the step 5 review corrections below). Not yet decided or built: the dismissal endpoint and its authorization, and the "Doesn't apply" routing, which belong to the producers step.

**Step 5 review corrections (owner review of lifecycle persistence; implemented, not wired).**
1. *Every offer is persisted.* `recordSuggestedActionOffers` now records current-work, urgent, exact-record, owned-opportunity and curated-starter offers; only a class with an offer cooldown also gets `suppressedUntil`. Selection and completion therefore always find a row. Because a row alone does not help if the policy still exempts those classes, the loader now returns **two** sets: `cooldownKeys` (offer cooldown or explicit dismissal; cooldown-exempt granted classes ignore them) and `completedKeys` (non-repeatable completions; applied to **every** class, including urgent work and the exact record).
2. *An offer can no longer re-bind "Not relevant".* `contextFingerprint` is the dismissal fingerprint: only a dismissal writes it, offers never do, and a later "Not now" clears it. A regression test reproduces the exact sequence (dismiss at fp-1, state changes to fp-2, the action is re-offered, it must not be suppressed again). `NOT_RELEVANT` now **requires** a non-empty fingerprint (the write is refused otherwise), and a stored `NOT_RELEVANT` without one never suppresses. When the caller cannot supply the current fingerprint the dismissal is respected.
3. *Ownership and active-goal signals are no longer producer-controlled.* `ProducerSlotGrant` gains `mayClaimCurrentResultOwnership` and `mayClaimActiveGoalMatch` (default false). A denied claim is cleared and counted (`signalClaimsDenied`, reason `SIGNAL_CLAIM_DENIED`). The cleared value drives the unrelated-opportunity cap, the reserved opportunity slot and the offer cooldown. The policy returns an `evaluated` array aligned with `selected`, and `offersFromExactFour` builds lifecycle offers from it, so the lifecycle never reads a raw candidate claim. The result producer may claim ownership (its candidates are built from the answer in front of the homeowner) but not a goal; unregistered producers may claim neither.
4. *Curated starters: soft seven-day rotation, no hard cooldown.* Every starter offer is persisted; starters sort least recently offered first (never offered, then stale, then recent), and the oldest still fills the row so rotation cannot create a shortage. `loadLifecycleState` returns `lastOfferedAtMs` and takes `rotationIdentities` so starter rows come back even when nothing suppresses them. The policy reports `startersWithinRotationWindow`.

**Decisions I made on top of the review (please check).**
- *Durable completion now applies to cooldown-exempt actions*, as the review requires. The risk: a completed exact-record action (for example "Add the brand") stays suppressed even if that detail is later removed and becomes missing again. Today the nominating handler would not re-nominate a filled field, so the practical exposure is small, but a state-change boundary (a context-version fingerprint on completion) is the right later fix.
- *Explicit dismissal is honored only for non-exempt granted classes by the policy.* The endpoint rules below keep dismissal off the exempt classes, so the two agree.

**Dismissal endpoint: required before activation (not built).** (a) Verify property access and that the user owns the source action. (b) Resolve identity (operation, outcome, entity) from the persisted action, never from request fields. (c) Allow `NOT_RELEVANT` only for eligible opportunity and starter outcomes, never profile facts. (d) Route "Doesn't apply" through governed applicability where a validated state exists, otherwise treat it as `NOT_NOW`. (e) Require the server-computed material-state fingerprint for `NOT_RELEVANT`.

FRD §27.7a fixes the fields. Two review corrections: the identity is **user + property + operation + outcome + entity scope** (the reason code is metadata, so a changed explanation cannot create a parallel row and bypass cooldown), and the timestamps say what they are. Persisting a result is an **offer**, not proof of display, so the first activation defines **offer-based cooldown** and does not call it an impression. (A client impression event would be a later upgrade: add `impressionAt` and move the clock start; the cooldown table below would not change.)

```prisma
model AskSuggestedActionLifecycle {
  id            String   @id @default(cuid())
  userId        String
  propertyId    String
  operationId   String
  outcomeKey    String
  // Non-null so the composite unique key works; empty string = not entity-scoped.
  entityType    String   @default("")
  entityId      String   @default("")
  // Metadata only: last bounded reason token offered. Never part of identity.
  lastReasonCode String?
  firstOfferedAt DateTime
  lastOfferedAt  DateTime
  offerCount     Int      @default(0)
  selectedAt    DateTime?
  completedAt   DateTime?
  dismissedAt   DateTime?
  dismissalReason AskSuggestedActionDismissalReason?
  suppressedUntil DateTime?
  contextFingerprint String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([userId, propertyId, operationId, outcomeKey, entityType, entityId])
  @@index([userId, propertyId, suppressedUntil])
}

enum AskSuggestedActionDismissalReason {
  NOT_NOW
  NOT_RELEVANT
}
```

`DOESNT_APPLY` is removed (D6). No label, message or raw text is stored. `contextFingerprint` hashes the material state (for example the unresolved registry fact keys for an area).

| Event | Rule |
|---|---|
| Unrelated opportunity **offered** | `suppressedUntil = lastOfferedAt + 7 days` |
| Missing-profile chip **offered** | `suppressedUntil = lastOfferedAt + 24 hours` |
| "Not now" (and "Doesn't apply" with no validated applicability state) | `suppressedUntil = dismissedAt + 30 days`; fact stays in the denominator |
| "Not relevant" (opportunities only) | suppressed until `contextFingerprint` changes; never applies to a profile fact's denominator membership |
| Completed | semantic suppression via `completedAt`, unless the outcome is registry-repeatable |
| Current-answer, urgent, exact-record | no generic offer cooldown (step 1 exempts these granted classes) |

**Operational notes.** (a) A settled answer upserts up to three cooldown-governed rows; one batched write after the answer is persisted, off the critical path, failing open (a failed write never changes the row), since production is a Raspberry Pi. (b) Because cooldown starts at offer time, an offer the client never rendered still suppresses that outcome; accepted for the first activation. (c) The record is per user, as FRD §27.7a specifies. (d) The cooldown exemption follows the **granted** slot class, so a producer cannot dodge cooldown by claiming a protected class (section 0, item 1).

## 9. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | Inclusion rule, facts and weights | Conditionally approved earlier. **Re-scored and frozen at `actionable-profile-1` in revision 4** (section 3); needs your confirmation of the DECISION/CONTEXT tags, the safety set and the `electricalPanelAgeYears` call. Applicability prerequisites and the HVAC, water-heater, roof and safety evidence are in the registry and the matrix |
| D2 | Verify the 36 before the registry | **Done** (section 4); revision 3 split: 19 included / 7 audience-conditional / 1 prerequisite / 4 excluded / 5 deferred hazard facts |
| D3 | One chip per area | **Approved**, as server-owned mappings: `outcomeKey -> area scope -> permitted fact keys`. The client never supplies a fact list and message text never determines scope; the chip's count includes only currently applicable, allowlisted, unresolved facts |
| D5 | Mortgage in first activation | **Approved**; design below |
| D6 | "Doesn't apply" | **Revised** per review (section 5): governed applicability flow, otherwise "Not now" with the fact kept in the denominator |
| D7 | Viewer households | **Approved**: build VIEWER-eligible read-only opportunities and curated starters; add a viewer fixture proving four after deduplication and cooldowns; if the inventory cannot reliably reach four, **do not activate exact-four** |
| D8 | Cooldown schema and defaults | **Revised** (section 8); needs re-approval |
| D4 | Tie-break among equal-materiality areas | Open: registry `areaOrder` via optional `slotRank` |
| D9 | Relational coverage: `systems.installedItemTypes` only | Open |
| D10 | Drop the room-light chip from first activation | Open |
| D11 | Exclude always-present address identity facts (`state`, `zipCode`, `city`) from the actionable-completeness denominator so the score measures information a household can still add | **Approved**. They stay in the home record and available to consumers; a missing one on a legacy or imported record is a record-integrity correction, not profile backfill |
| **D12** | Audience-conditional facts enter the denominator only while their audience is active, from governed signals (section 5) | **Approved** with the phase definition |

**D5 design (mortgage first activation).**
- **Status capture (new, small).** A governed capture that writes `PropertyFinancingProfile.mortgageStatus` only from `UNKNOWN` to `MORTGAGED` or `NO_MORTGAGE`; a change from a known status is a normal edit elsewhere, never a chip. `markPropertyAsHavingNoMortgage` (`financing.service.ts:139`) already exists but it wipes every mortgage field, which is safe from `UNKNOWN` and destructive otherwise, so the capture must refuse any non-`UNKNOWN` source state. The write should follow the dedicated-writer pattern of `capturePropertyFinancingFact` (evidence plus property change, CONTRIBUTOR floor, idempotency) and not the bare service call; the bare `upsertProfile` path writes neither.
- **Rate capture.** Offered only when status is `MORTGAGED`, the rate is missing or stale, and there is a deterministic typed launch for the rate capture (the existing `capturePropertyFinancingFact` writer is the target). It must not route through a refinance questionnaire. Balance and term are deferred.
- **Snapshot gap (approved).** The fact catalog has `financial.currentMortgage` (rate) and `financial.financingProfile`, but no fact exposing status. A new catalog fact (for example `financial.mortgageStatus`) and assembler entry are approved so mortgage applicability is visible to every consumer; this is step 4 catalog work.
- **Atomic precondition.** The `UNKNOWN` check must be part of the write, not a read followed by a write, because the `NO_MORTGAGE` transition is destructive. Shape: one conditional update (`updateMany` where `propertyId` matches **and** `mortgageStatus = UNKNOWN`) and treat a zero count as "already set, nothing changed"; for a property with no profile row, a `create` guarded by the unique `propertyId` where a conflict is also treated as "already set". Do not reuse `markPropertyAsHavingNoMortgage` as is: it upserts unconditionally and clears mortgage fields. A concurrency test (two simultaneous captures, one stale) belongs in step 4.
- **Ordering.** status (when `UNKNOWN`) before rate; `NO_MORTGAGE` suppresses all mortgage chips.

**D5 implemented (step 6; not wired).**
- *Catalog and assembler.* `financial.mortgageStatus` is a FINANCIAL-scope fact owned by `PropertyFinancingProfile.mortgageStatus`, not writable through the generic scalar writer. The financial assembler emits it: `UNKNOWN` is exposed as a null value (so the fact is UNKNOWN until answered), `MORTGAGED` and `NO_MORTGAGE` are KNOWN, and a status never goes stale on a timer. `financial.financingProfile` keeps its previous content (status is its own fact, not a new field on that row), so its context version does not shift.
- *Atomic capture.* `capturePropertyMortgageStatus` (CONTRIBUTOR floor) performs only `UNKNOWN -> MORTGAGED` or `UNKNOWN -> NO_MORTGAGE`. The precondition is the `WHERE` clause of a single conditional `UPDATE`, not a read followed by a write. It runs in one transaction: evidence create (idempotency gate), supersede, ensure the 1:1 row (`createMany ... skipDuplicates`, so a concurrent creator never aborts the transaction), the conditional transition, then the property-change emit. A refused transition throws and rolls back the evidence row. The post-refusal read only classifies the reason: `ALREADY_SET`, `CONFLICT_STATUS` or `CONFLICT_DETAILS`.
- *NO_MORTGAGE never wipes.* Its `WHERE` also requires every mortgage detail field to be empty and both flags false, so a rate captured earlier refuses it as `CONFLICT_DETAILS` instead of being erased; `markPropertyAsHavingNoMortgage` is not reused.
- *Concurrency test.* Eight simultaneous mixed captures yield exactly one transition, one evidence row and one change, with every loser classified and nothing written. A control test shows a read-then-write implementation double-writes under the same interleaving, so the test can catch the race. **Limit:** the fake models row lock, atomic conditional update, rollback and interleaving, but it is not Postgres; a real concurrent run against your database is the true verification.
- *New finding before the rate chip.* `financial.currentMortgage` is built only when `currentMortgageBalanceCents` is non-null, so a rate captured alone (the existing writer sets only `interestRateBps`) leaves that fact UNKNOWN. The rate chip's "rate missing" predicate must therefore read `interestRateBps` from `financial.financingProfile`, not the `currentMortgage` fact, or it will keep asking after a successful capture. Decide in step 8 whether to fix the assembler instead.
- *Not built here (step 8):* the registered Ask launch and outcome for status (`MORTGAGE_STATUS` capture), the typed rate launch, and the mortgage ordering (status before rate; `NO_MORTGAGE` suppresses all mortgage chips).

**D7 follow-through.** The step 4 exit gate is a fixture (VIEWER role, below 90% and at or above 90%, with cooldowns active) that yields exactly four after deduplication, plus a count of how many VIEWER-eligible read-only opportunities and starters exist. If that count cannot cover the worst case, exact-four stays off.

## 10. Not covered here

The opportunity catalogue and its "why now" signals (ownership outlook, plants, continuity, mortgage) belong to step 4 and need their own review; Home Continuity stays out of generic backfill. Step 2 registry code (module, mappings, score fixtures) is still intentionally not written: D1 says the fact set and weights are not frozen, and D11 and D12 change the denominator. It is generated from sections 3 and 4 once those are settled.
