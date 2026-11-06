# Ask Cozy Routing Coverage and Calibration

**Date:** November 5, 2026

**Scope:** Findings Implementation Plan, Phase 4 (`ASK_COZY_TECHNICAL_ARCHITECTURE_FINDINGS_IMPLEMENTATION_PLAN.md` §8): measure the deterministic semantic router against the reviewed certification corpus, correct how it is described, and change nothing about routing until a measured gap justifies it.

**Status:** measurement and terminology are done. **No routing behavior changed.** One evidence refresh and one tuning step are waiting on owner decisions (§6).

**Governing documents read:** `AI_HOME_CONCIERGE_ASK_TRUST_ARCHITECTURE_ADDENDUM_FRD.md` (TA2, calibration, certification), `ASK_COZY_MESSAGE_FIRST_FRD.md` MF-013, `AUDIT_METHODOLOGY.md`.

## How claims are labelled

- **Executed:** the real router (safety gate, direct patterns, local classifier, calibration) was run over the corpus and the output observed. It is deterministic and needs no network, database or model. Every number in §2 and §4 is executed, from `npm run report:ask-routing-coverage` and `tests/ask/askRoutingCoverageReport.test.js`.
- **Code-traced:** read in the source, not run.
- These numbers measure the **reviewed certification corpus** (121 independent fixtures and 5 regressions, English only, written to avoid the operation index). They are not production traffic, and they say nothing about routing quality on real homeowner messages.

## 1. What the local classifier is

It is **feature hashing over curated concept groups and character n-grams**. A message becomes a 384-dimension signed vector by hashing (FNV-1a) its words, bigrams, character 3/4/5-grams and the curated concept features into buckets; scores fuse that cosine similarity with typo-tolerant lexical and phrase similarity against the examples each operation owns. It has **no trained weights and no learned semantic representation**. Its reach beyond exact wording comes only from the curated, operation-agnostic concept groups, subword overlap and operation-owned examples. It is not an embedding model, a neural encoder or a vector database.

**Identifiers are kept on purpose.** `embedAskSemanticText`, `embeddingScore`, `embeddingEnabled`, `HYBRID_LOCAL_EMBEDDING` and `ASK_LOCAL_EMBEDDING_VERSION` are stored in telemetry, in the semantic-index version hash and in calibration versions. Renaming them needs a versioned migration that this phase does not specify. Read them as "hashed feature vector".

**Where wording was corrected:** the header of `askSemanticEmbedding.ts`, the `AskRetrievalPath` note in `askRoutingCalibration.ts`, the `embeddingScore` field note in `askSemanticRouter.ts`, `ASK_COZY_MESSAGE_FIRST_FRD.md` MF-013, `ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md`, and the two current-state lines of the Trust addendum (TA2 and the hardening note). A test locks the code wording.

**Where older wording remains, deliberately:** dated audits and plans (`ASK_COZY_CONVERSATIONAL_ARCHITECTURE_AUDIT.md`, `ASK_COZY_INCREMENTAL_IMPLEMENTATION_PLAN.md` and similar) describe what was true when written, and the normative requirement text in the Trust addendum ("embedding retrieval captures semantic paraphrases...") states what implementations are allowed to be. Neither was rewritten. A learned or remote embedding would be a separate design with its own privacy, dependency, fallback and certification decisions (plan §8 step 6); this phase introduces none.

## 2. Measured results (executed)

| | Count | Share |
|---|---|---|
| Fixtures | 126 | |
| Routed to the expected operation | 92 | 73% |
| Routed to a **wrong** operation | **0** | 0% |
| Routed to a wrong operation at HIGH confidence | **0** | |
| Clarification asked (the right operation was offered in all 8) | 8 | 6% |
| Fell through to the remote fallback | 26 | 21% |

By how the answer was reached: 53 by direct pattern, 23 at HIGH confidence, 12 at MEDIUM, 3 by the safety gate (the emergency, restricted-topic and out-of-scope fixtures, which that gate is meant to take), 1 `GROUNDED_GUIDANCE` fixture that is the fallback by design, 34 not resolved.

**The 8 clarifications:** 6 are policy. A write or high-materiality operation must reach the HIGH band to run, so a MEDIUM candidate is clarified by design (`OWNERSHIP_COSTS`, `REFINANCE_RATE_MONITOR`, `QUOTE_COMPARISON_CREATE`, `HVAC_PREFERENCE_SAVE`, `CLAIM_TRANSITION`, `OPERATIONAL_WORK_UPDATE`). 2 are ambiguity between close candidates.

**The 26 fallbacks:** nine are buyer-journey operations (`BUYER_PLAN_STATUS`, `BUYER_DEADLINES`, `BUYER_DOCUMENT_READINESS`, `BUYER_INSPECTION_REVIEW`, `BUYER_MOVE_STATUS`, `BUYER_FINANCING_READINESS`, `BUYER_CONTRACT_TIMELINE`, `BUYER_NEGOTIATION_READINESS`, `BUYER_LOAN_ESTIMATES`), three are HVAC decision operations, two are inspection operations, and the rest are single operations. **In 24 of 26 the expected operation was ranked first by raw retrieval score** (25 within the top three), with a calibrated confidence between 0.00 and 0.56 and a band of LOW (17) or MEDIUM (9).

Coverage: all 118 message-routable operations are indexed, every one has at least one routing fixture, and every one owns hard-negative examples.

## 3. What the measurements mean

1. **The router's ordering is good and its answers are conservative.** No wrong route at any confidence. The cost is recall: about one fixture in five does not get a deterministic answer and goes to the remote fallback, where the principle is that a model call is the last resort.
2. **The shortfall is calibration, not retrieval.** 24 of 26 fallbacks have the right operation first. The confidence curve maps a raw score of 0.3 to 0.4 to a calibrated value near or under the execution threshold, because the evidence rows pair each correct candidate with its strongest wrong competitor at similar raw scores. That is a property of how the curve is derived, so adding examples would raise raw scores but would also be tuning against the very corpus that is meant to be an independent holdout.
3. **The documented remedy for coverage misses is examples, not architecture** (MF-013), written by someone other than the person who wrote the fixtures. See §5.

## 4. Calibration evidence has drifted (executed)

The Trust addendum requires calibration rows whose raw scores "are recomputed exactly in certification". The existing test enforces this but stops at the first mismatch, so it hid the extent. The report lists all of them: **4 of 121 fixtures** no longer match live scoring.

| Fixture | Operation | Stored strongest competitor | Live strongest competitor |
|---|---|---|---|
| 015 | `REFINANCE_RATE_MONITOR` | `HOME_DEADLINE_MONITOR` .3509 | `REFINANCE_COMMAND` .396 |
| 065 | `DOCUMENT_PROMOTION_CONFIRM` | `HOME_CHANGE_SUMMARY` .6381 | `PROPERTY_SUMMARY` .6131 |
| 075 | `NEIGHBORHOOD_CHANGE_FEED` | `PAST_HAZARD_EXPOSURE` .25 | `COMMUNITY_UPDATES` .2661 |
| 121 | `COMMUNITY_UPDATES` | no rows at all | `HOME_EVENT_RADAR_FEED` .2461 |

The expected operation's own score is unchanged in every case.

### Effect of refreshing those four rows (executed, then reverted)

I applied the refresh, measured it on the whole corpus and the calibration curves, and reverted it. Thresholds are fixed constants per operation kind, so only the raw-to-confidence curve moves.

| Curve | Effect |
|---|---|
| MATERIAL | Identical |
| WRITE | Slightly **stricter**: confidence falls at 38 raw-score points by at most 0.025; no threshold crossed in the permissive direction |
| READ | Confidence **rises** at 52 raw-score points by up to 0.213; reads become executable at lower raw scores (execution threshold crossed upward over 14 raw-score points) |

| Corpus outcome | Before | After refresh |
|---|---|---|
| Correct | 92 | 93 |
| Wrong operation | 0 | 0 |
| Clarification | 8 | 14 |
| Remote fallback | 26 | 19 |

Row level: four fixtures that fell back are now answered directly (`BUYER_INSPECTION_REVIEW`, `BUYER_MOVE_STATUS`, `INTELLIGENCE_ENVELOPE_QUERY`, `PERMIT_TRACKER_STATUS`); three more move from fallback to a clarification that offers the right operation (`BUYER_DOCUMENT_READINESS`, `BUYER_NEGOTIATION_READINESS`, `INSPECTION_NEGOTIATION_PACKAGE`); and **three fixtures that routed correctly now clarify** (`INSPECTION_REPORT_FINDINGS`, `INSPECTION_REPORT_COMPARE`, `ENVIRONMENT_REPORT`).

**Why those three regress.** The refreshed READ curve is a plateau near 0.50 across raw scores of roughly 0.3 to 0.5, so a clear leader (raw 0.49) and its runner-up (raw 0.34) get nearly the same calibrated confidence (0.5075 against 0.5021), inside the ambiguity margin, and the router asks a question it did not need to ask. This is a weakness of deriving the curve by pooling few rows. The refresh makes it visible; how large a plateau the committed curve has was not measured.

**Safety guardrails hold under the refresh:** no wrong route, MATERIAL unchanged, WRITE not looser, and no write or high-materiality operation newly executes.

## 5. What was and was not done to routing

- **Not changed:** thresholds, weights, synonym groups, operation examples, the calibration evidence, the semantic-index version.
- **Not added:** no paraphrase or hard negative. The 26 fallback fixtures (19 after the refresh) are real gaps, but writing phrases that make these specific holdout fixtures pass would contaminate the independent corpus, and the plan asks for independently reviewed additions. The corpus integrity validator already rejects an example that equals a fixture sentence; it cannot detect one that merely paraphrases it.
- **Added (measurement only):** `npm run report:ask-routing-coverage`, 10 tests (`askRoutingCoverageReport.test.js`) that lock the mechanism wording, the safety-gate behavior, the quality floor (no wrong route; at least 100 of 126 reach an answer or a clarification that offers the right operation; at most 26 fallbacks), the per-kind thresholds, and a drift ratchet that fails if any fixture beyond the four known ones drifts.

## 6. Decisions for the owner

- **OD-4.1: refresh the four calibration rows?** *Recommendation: yes.* The Trust addendum requires exact recomputation and a certification test is red without it. The measured effect is a net gain (7 fewer remote fallbacks, 4 more direct answers) with three regressions to clarification and no safety loosening. If yes, apply the four-row change below, expect the numbers in §4, tighten the floors in the test, and empty the known-drift set.
  **Applied and reverted (2026-11-05).** The refresh was applied and the full Ask suite run. It fixed the drift certification test but caused three routing regressions, so it was reverted and OD-4.1 stays open. "Is my digital will valid for my estate?" routed to `HOME_DIGITAL_WILL` instead of `GROUNDED_GUIDANCE` (a wrong route); "Show my intelligence envelope" and "Show my inspecion findings" fell to `GROUNDED_GUIDANCE` instead of `INTELLIGENCE_ENVELOPE_QUERY` and `INSPECTION_FINDINGS`. The "nothing else changes" assumption was wrong. The refresh can only go in together with operation-owned hard negatives and examples for those cases, reviewed independently (OD-4.2), then re-measured.
- **OD-4.2: who writes and independently reviews paraphrases and hard negatives** for the fallback operations in §2 (buyer journey first)? They must not be drawn from the holdout fixtures. Until a reviewer exists, none are added.
- **OD-4.3: study the calibration plateau.** Deriving the READ curve by isotonic regression on pooled rows flattens the 0.3 to 0.5 range, which both causes fallbacks and, after a refresh, unneeded clarifications. Candidates include judging ambiguity on the raw-score margin or smoothing the curve. That changes calibration methodology and needs its own design, impact run and certification; it is not part of this phase.

```diff
-  ['015-competitor', '015', 'HOME_DEADLINE_MONITOR', .3509, false]
+  ['015-competitor', '015', 'REFINANCE_COMMAND', .396, false]
-  ['065-competitor', '065', 'HOME_CHANGE_SUMMARY', .6381, false]
+  ['065-competitor', '065', 'PROPERTY_SUMMARY', .6131, false]
-  ['075-competitor', '075', 'PAST_HAZARD_EXPOSURE', .25, false]
+  ['075-competitor', '075', 'COMMUNITY_UPDATES', .2661, false]
+  ['121-expected', '121', 'COMMUNITY_UPDATES', 0.4039, true], ['121-competitor', '121', 'HOME_EVENT_RADAR_FEED', 0.2461, false],
```

(in `apps/backend/src/services/ask/askRoutingCalibrationEvidence.ts`; the evidence version hash and every `calibrationVersion` string change automatically.)

## 7. Not done

- Production traffic: none of this measures real messages. The corpus is English only, one language is certified, and there is no production-correction data in the repository.
- Dense or remote embeddings, `pgvector`, and any new dependency. They remain a separate proposal requiring a privacy and data-flow decision, a deterministic fallback, new cross-operation certification and a latency budget from Phase 3.
- Safety routing was not touched: the safety gate and direct-intent stages still run ahead of semantic classification (`resolveAskRoutingCascade`).

## Reproduce

```
cd apps/backend
npm run report:ask-routing-coverage -- --out /tmp/routing-report.json
node --test tests/ask/askRoutingCoverageReport.test.js
```
