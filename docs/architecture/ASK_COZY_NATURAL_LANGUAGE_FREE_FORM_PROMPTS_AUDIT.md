# Ask Cozy: Natural Language & Free-Form Prompts Comprehensive Audit (Revision 9)

**Date:** 2026-11-08  
**Scope:** End-to-end audit of Ask Cozy prompt handling (`apps/frontend/src/components/ask/*` and `apps/backend/src/services/ask/*`)  
**Governing Documents Read:**
- [`docs/architecture/AUDIT_METHODOLOGY.md`](../architecture/AUDIT_METHODOLOGY.md) (Items 1–20 verification standard)
- [`docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md`](../product/ASK_COZY_INLINE_WORKSPACE_FRD.md) (specifically Revisions 1.520–1.538: the 2026-11-07 natural-language routing review and screenshot retests)
- [`docs/architecture/ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md`](../architecture/ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md) (Phase 4 126-fixture certification measurement & `OD-4.1`–`OD-4.3`)
- [`docs/architecture/ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md`](../architecture/ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md) (§5 Architecture Principles, §7 Router vs. Conversational Understanding, §9 `SEARCH_ASSISTANT` Context Scope)

---

## How Claims Are Labelled (`AUDIT_METHODOLOGY.md` §1)

- **[Executed]:** Code, scripts, handlers (with in-memory stubbed Prisma/access dependencies), or pure functions were run in this workspace (`node apps/backend/scripts/ask-routing-sweep.js` and reproducible `node -e` commands over `resolveAskRoutingCascade`, `capabilityInvoke`, `ASK_ROUTING_CERTIFICATION_FIXTURES`, `ASK_DISCOVERY_BINDINGS`, `CARD_ENTRY_BINDINGS`, `normalizeAskMessage`, and `askSemanticConcepts`) and the output was observed. No live database or network connection was used.
- **[Code-traced]:** Verified by reading the TypeScript source files and tracing branches, types, and callers, but not executed end-to-end because the path requires live database state or an external Gemini network call.
- **[Inferred]:** Extrapolated from code structure or corpus distributions where production traffic telemetry is unavailable.
- **[Product Decision]:** A behavioral trade-off governed by product policy rather than a code defect (`AUDIT_METHODOLOGY.md` §5, §8).

---

## 1. Executive Summary & Baseline Measurements

### 1.1 Current Measured Routing Baseline **[Executed]**

Two offline corpora measure free-form natural-language routing in `apps/backend`:

1. **690-Prompt Natural-Language Sweep (`node apps/backend/scripts/ask-routing-sweep.js` over `apps/backend/tests/fixtures/askRoutingCorpus.js`, 108 operations):**
   - In the initial 2026-11-07 sweep (`ASK_COZY_INLINE_WORKSPACE_FRD.md` Revision 1.520), the router scored **286 / 642 hits (44.5%)** with **94 misroutes (14.6%)**.
   - Following Revisions 1.520–1.538 (steps 1–7 of the 2026-11-07 routing review and screenshot groups 1–7), executing `node apps/backend/scripts/ask-routing-sweep.js` at audit time (2026-11-07, before Phases 1–4 below) produced **[Executed]**:

| Outcome | Count (of 690) | Share | Stage Breakdown **[Executed]** |
| :--- | ---: | ---: | :--- |
| **Hit (`hit`)** — expected or equivalent operation | **371** | **53.8%** | `306` via `DETERMINISTIC` regex (`44.3%`), `65` via `LOCAL_CLASSIFIER` (`9.4%`) |
| **Fallback (`fb`)** — `REMOTE_FALLBACK` (`GROUNDED_GUIDANCE`) | **203** | **29.4%** | All `203` fell through Stage 2 regex and Stage 3 classifier thresholds |
| **Misroute (`mis`)** — routed to a wrong operation | **67** | **9.7%** | `35` via `DETERMINISTIC` regex hijack (`5.1%`), `32` via `LOCAL_CLASSIFIER` (`4.6%`) |
| **Clarification (`clarOk`)** — offered the right operation | **31** | **4.5%** | Stage `CLARIFICATION` where expected/equivalent op is in top-3 options |
| **Clarification (`clarBad`)** — right operation not offered | **18** | **2.6%** | Stage `CLARIFICATION` where expected/equivalent op is absent from options |

   - **Current figures, after Phases 1–4 and the review fixes (2026-11-08) [Executed]:** hit **409 (59.3%)**, fallback **186 (27.0%)**, misroute **48 (7.0%)**, clarification **47** (30 offer the right option, 17 do not). The table above and the counts in Section 2 are the audit-time figures the root-cause ranking was derived from; each Phase Results subsection in Section 4 gives what changed.

2. **126-Fixture Certification Corpus (`ASK_ROUTING_CERTIFICATION_FIXTURES` in `askTrustCertificationCorpus.ts`, documented in `ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md` §2) [Executed]:**
   - **92 / 126 (73.0%)** route to the expected operation (`53` deterministic, `23` HIGH confidence, `12` MEDIUM, `3` safety gate, `1` `GROUNDED_GUIDANCE`).
   - **0 / 126 (0.0%)** route to a wrong operation.
   - **8 / 126 (6.3%)** ask for clarification (offering the right operation in all 8).
   - **26 / 126 (20.6%)** fall through to `REMOTE_FALLBACK` (with the expected operation ranked #1 by raw retrieval score in **24 of 26**, and within top-3 in **25 of 26**).

### 1.2 Why Fixed Starters Succeed While Free-Form Prompts Fail **[Executed + Code-traced]**

Fixed starter prompts and free-form typed prompts differ in two ways:

1. **Curated Wording Tested Against Stage 2 Regexes (`launch: 'MESSAGE'`):**  
   In `apps/backend/src/services/ask/askCapabilityBindings.ts:105-265`, **55 of 60** discovery bindings use `launch: 'MESSAGE'`. Running all 55 `question` strings through `resolveAskRoutingCascade` without `launchContext` confirms that **55 / 55 (100%)** hit their target operation via Stage 2 `DETERMINISTIC` regexes **[Executed]**, because `askExplorerRegistry.ts:186-188` asserts at module load that every `MESSAGE` binding resolves deterministically **[Code-traced]**. Similarly, all 8 starter prompts in `CalmLanding.tsx:61-105` and `ConciergeHome.tsx:153-163` hit their target operation via Stage 2 `DETERMINISTIC` rules **[Executed]**.
2. **Direct Operation Context Binding (`launchContext.operationId`):**  
   When a user clicks a starter pill or capability card that supplies `launchContext.operationId` (`AskWorkspace.tsx:367-375`, `useAskRequest.ts:80-102`), `createAskExecution.ts:309-312, 411-428, 568-571` binds `declaredItemActionOperationId` at confidence `1.0` and sets `skipSemanticAnswerRelevance: true` **[Code-traced]**.  
   Running the **40** `CARD_ENTRY_BINDINGS` (`askCapabilityBindings.ts:18-103`) and **5** non-`MESSAGE` discovery bindings through `resolveAskRoutingCascade` *without* `launchContext.operationId` shows **[Executed]**:
   - At audit time **38 / 40 (95.0%)** of `CARD_ENTRY_BINDINGS` matched by message text, while **2 / 40 failed** without `launchContext.operationId` (**both fixed in Phase 1, `fcb9efb5`: 40 / 40 now route by message text, asserted by `cardEntryBindingsRouting.test.js` [Executed]**):
     - `home-records` (`"Show this home’s records"`, expected `PROPERTY_SUMMARY`) falls to `REMOTE_FALLBACK` (`GROUNDED_GUIDANCE`).
     - `claims` (`"Show my claims"`, expected `INCIDENT_CLAIM_STATUS`) misroutes to `WORK_OVERVIEW` via `LOCAL_CLASSIFIER`.
   - **3 / 5** non-`MESSAGE` discovery bindings (`understand-add-detail` -> `CLARIFICATION`, `maintain-diy-start` -> `DIY_PROJECTS` instead of `DIY_TEMPLATE_BROWSE`, `maintain-diy-continue` -> `DIY_PROJECTS` instead of `DIY_PROJECT_GUIDE`) require their declared `operationId` or `selectorId` (`AskTargetSelectorId`) to reach their target operation **[Executed]**.

When a homeowner types a free-form question in the composer (`AskWorkspace.tsx:391`), `promptContext` is `undefined` **[Code-traced]** and the phrasing is not restricted to the phrases encoded in `askOperationRegistry.ts`.

---

## 2. Ranked Root-Cause Analysis

Root causes 1-3 are ranked by the number of affected prompts in the 690-prompt sweep (`askRoutingCorpus.js`). Root Cause 4 is **not** on that scale: it is an unquantified exposure (operations without a contract), listed after the ranked causes because the offline sweep runs no handlers and so cannot count refusals. **Counts and command outputs in this section are as measured at audit time (2026-11-07); where a later phase changed one, the line says so and gives the current value.**

### Root Cause 1 (Rank 1 — 203 / 690 prompts, 29.4%): Local Router Fallthrough to `REMOTE_FALLBACK` **[Executed]**

Out of 690 free-form prompts in `askRoutingCorpus.js`, **203 (29.4%)** miss Stage 2 regexes (`resolveAskOperation` in `askOperationRegistry.ts:1552-1965`) and do not clear Stage 3 `LOCAL_CLASSIFIER` confidence/margin thresholds (`classifyAskCandidates` in `askSemanticRouter.ts:340-416`), landing in `REMOTE_FALLBACK` (`GROUNDED_GUIDANCE`) **[Executed]**.

#### Sub-causes Verified by Execution and Code Tracing:
1. **Sparse Example & Wording Coverage in Specific Operation Families **[Executed]**:**  
   In `node apps/backend/scripts/ask-routing-sweep.js`, the worst-performing operations by fallback count are buyer-journey reads (`BUYER_CONTRACT_TIMELINE` 6/6 fb, `BUYER_TITLE_ESCROW_READINESS` 5/6 fb, `BUYER_DEADLINES` 5/6 fb, `BUYER_FINANCING_READINESS` 5/6 fb, `BUYER_DISCLOSURE_FUNDS_READINESS` 4/6 fb, `BUYER_PLAN_STATUS` 4/6 fb), `PROJECT_TRACKER_PROJECTS` (5/6 fb), `INSPECTION_FINDING_UPDATE` (4/6 fb), `INSPECTION_NEGOTIATION_PACKAGE` (4/6 fb), `NEIGHBORHOOD_CHANGE_FEED` (4/8 fb), `APPLIANCE_FAILURE_RISK` (4/8 fb), and `HOME_ACTIONS` (4/10 fb) **[Executed]**. As noted in `ASK_COZY_INLINE_WORKSPACE_FRD.md` Revision 1.527, each operation owns a median of four positive examples **[Code-traced]**.
2. **Candidate Ranking vs. Confidence Thresholds (`didYouMean.ts`) **[Executed]**:**  
   Across the 203 `REMOTE_FALLBACK` prompts in the 690-prompt sweep **[Executed]**:
   - **94 / 203 (46.3%)** rank the expected (or equivalent) operation **#1** in `decision.candidates`.
   - **138 / 203 (68.0%)** rank the expected (or equivalent) operation within the **top 3**.
   - Revision 1.529 (`apps/backend/src/services/ask/support/didYouMean.ts:56-93`) recovers from `REMOTE_FALLBACK` when `GROUNDED_GUIDANCE` finds no supported claim by offering up to 3 candidates with calibrated confidence `>= 0.10` (`offerDidYouMean`) **[Code-traced]**. On the 203 fallback prompts, **194 / 203 (95.6%)** have at least one candidate `>= 0.10`, and **120 / 203 (59.1%)** include the right operation in those top-3 options **[Executed]**—leaving **83 / 203 (40.9%)** where `"Did you mean one of these?"` does not include the expected operation.
3. **Why Naive Threshold Lowering Fails **[Executed]**:**  
   In `ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md` §4 (`lines 84, 99`), the `READ` isotonic calibration curve (`askRoutingCalibration.ts:47-76`) exhibits a plateau around `~0.50` across raw scores `0.30–0.50`. However, testing a heuristic promotion rule (`rawConfidence >= 0.36 && topRaw / secondRaw >= 1.25`) across both corpora demonstrates why uncalibrated threshold loosening is unsafe **[Executed]**:
   - On the 126-prompt certification corpus, it promotes `9` prompts (`9` hits, `0` misroutes) **[Executed]**.
   - On the 690-prompt sweep corpus, it promotes `23` prompts: **16 hits (69.6%) and 7 new misroutes (30.4% false-accept rate)** **[Executed]**, which fails the CI regression ratchet (`tests/ask/routingSweepRatchet.test.js`) and confirms Revision 1.529's finding that lowering confidence thresholds routes nearly as many prompts wrong as right.
4. **Morphological Mismatches in `stem()` and `containsPhrase()` **[Executed]**:**
   - In `apps/backend/src/services/ask/askSemanticRouter.ts:75-80`:
     ```ts
     function stem(token: string): string {
       if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
       if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
       if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
       return token;
     }
     ```
     For words where adding `-ing` dropped a trailing silent `e` (e.g., `"replacing"` -> `"replac"` vs. `"replace"` -> `"replace"`, `"making"` -> `"mak"` vs. `"make"` -> `"make"`, `"moving"` -> `"mov"` vs. `"move"` -> `"move"`), `stem()` produces different stems so `tokens()` does not match them **[Executed]**. (Note: `"fixing"` has length 6 and stems to `"fix"`, matching `"fix"`.)
   - In `apps/backend/src/services/ask/askSemanticEmbedding.ts:65-72`:
     ```ts
     function containsPhrase(normalized: string, phrase: string): boolean {
       return ` ${normalized} `.includes(` ${phrase} `);
     }
     ```
     `containsPhrase` checks space-bounded whole words against the **unstemmed** `normalized` string **[Code-traced]**. Running `askSemanticConcepts` confirms that `askSemanticConcepts(normalizeAskMessage('replace my furnace').normalized)` returns `['replace', 'hvac']`, whereas `askSemanticConcepts(normalizeAskMessage('replacing my furnace').normalized)` returns `['hvac']`—missing the `'replace'` concept group because `'replacing'` is not in the `'replace'` phrase list (`['replace', 'replacement', 'repair', 'fix', 'install new', 'swap out', 'worth fixing', 'keep or replace']`) **[Executed]**.

---

### Root Cause 2 (Rank 2 — 67 / 690 prompts, 9.7%): Stage 2 & Stage 3 Misroutes to Wrong Operations **[Executed]**

Nearly 10% of the 690-prompt sweep (**67 prompts**) routes to a **wrong** operation rather than clarifying or falling back **[Executed]**:
- **35 / 67 (52.2% of misroutes)** occur at Stage 2 (`DETERMINISTIC` regex rules in `askOperationRegistry.ts:1552-1965`) where an overly broad regex captures another operation's phrasing before Stage 3 runs **[Executed]**.
- **32 / 67 (47.8% of misroutes)** occur at Stage 3 (`LOCAL_CLASSIFIER` in `askSemanticRouter.ts`) where a competing operation clears the `HIGH` confidence band **[Executed]**.
- The top hijacking operations across the 690-prompt sweep are **[Executed]**:
  - `QUOTE_COMPARISON_REVIEW` (`6` hijacks)
  - `CAPABILITY_DISCOVERY` (`6` hijacks)
  - `PROPERTY_SUMMARY` (`4` hijacks)
  - `MAINTENANCE_STATUS` (`4` hijacks)
  - `MAINTENANCE_BUDGET_FORECAST` (`4` hijacks)
  - `HOME_CHANGE_SUMMARY` (`4` hijacks)
  - `SAVINGS_OPPORTUNITIES` (`3` hijacks)
  - `INSPECTION_REPORTS` (`3` hijacks)

When a prompt misroutes to a wrong operation, the homeowner either sees an irrelevant domain card or gets blocked by `validateAskSemanticAnswerRelevance` (`askSemanticAnswerValidator.ts`), which turns the misroute into `"I’m not sure I understood that"` or `ASK_UNVERIFIABLE_ANSWER_TEXT` **[Code-traced]**.

---

### Root Cause 3 (Rank 3 — 49 / 690 prompts, 7.1%): Clarifications Missing the Expected Operation (`18 clarBad`, `31 clarOk`) **[Executed]**

In the 690-prompt sweep, **49 prompts** stop at Stage `CLARIFICATION` (`"What would you like to focus on?"`). In **31 of 49 (`clarOk`)**, the expected operation is among the offered choices, requiring one extra click; in **18 of 49 (`clarBad`, 2.6% of corpus)**, the expected operation is absent from the offered candidates (`decision.candidates.slice(0, 3)`), leaving the homeowner without a button for their intended action **[Executed]**.

---

### Root Cause 4 (unranked, unquantified risk — 62 / 85 non-fallback routable `READ` operations had no canonical contract at audit time; 50 after Phase 3; 50 / 86 at commit `c6c2f16d`): Post-Execution Semantic Answer Relevance Refusals **[Executed count of operations; refusal frequency NOT measured]**

> An uncovered operation is exposure, not an observed failure. The number of prompts actually refused is unknown and cannot be compared with the 203 fallbacks, 67 misroutes or 49 clarifications above.

After an operation handler builds an answer, `createAskExecution.ts:563-595` runs `validateAskAnswerTrustPipeline` (`askAnswerTrustValidator.ts:364-450`), which calls `validateAskSemanticAnswerRelevance` (`askSemanticAnswerValidator.ts:48-322`) unless `skipSemanticAnswerRelevance` is set (which applies to declared item actions / `launchContext.operationId` or `routedDeterministically && isAskHonestLimitationResult(result)`, Revision 1.526) **[Code-traced]**.

- **Reproducible Coverage Count **[Executed]**:**  
  Command:
  ```bash
  node -e '
  const path = require("node:path");
  const BACKEND = path.resolve("apps/backend");
  process.env.TS_NODE_TRANSPILE_ONLY = "true";
  process.env.TS_NODE_PROJECT = path.join(BACKEND, "tsconfig.test-cache.json");
  require(path.join(BACKEND, "node_modules/ts-node/register"));
  const { ASK_OPERATION_DEFINITIONS } = require(path.join(BACKEND, "src/services/ask/askOperationRegistry.ts"));
  const { CANONICAL_ANSWER_BLOCK_ID_PREFIXES } = require(path.join(BACKEND, "src/services/ask/support/canonicalAnswerBlocks.ts"));
  const inlineOps = new Set(["INVENTORY_LOOKUP","PROPERTY_SUMMARY","WORK_OVERVIEW","SAVED_RESULTS","MAINTENANCE_STATUS","COVERAGE_GAPS","SAVINGS_OPPORTUNITIES","OWNERSHIP_COSTS","HOME_ACTIONS","HOME_CHANGE_SUMMARY","HOME_STATUS_BOARD","SELLER_PREP_CHECKLIST","QUOTE_COMPARISON_REVIEW","CAPITAL_RESERVE_PLAN","REFINANCE_ANALYSIS","HOME_UPGRADE_SCENARIOS","ENVIRONMENT_REPORT",...Object.keys(CANONICAL_ANSWER_BLOCK_ID_PREFIXES)]);
  const routableRead = Object.values(ASK_OPERATION_DEFINITIONS).filter(d => d.messageRoutable && d.semantic.effect === "READ" && !d.safetyClass.endsWith("_BOUNDARY"));
  const nonFallbackRead = routableRead.filter(d => d.operationId !== "GROUNDED_GUIDANCE");
  console.log({ routableReadWithFallback: routableRead.length, nonFallbackRead: nonFallbackRead.length, covered: nonFallbackRead.filter(d => inlineOps.has(d.operationId)).length, uncovered: nonFallbackRead.filter(d => !inlineOps.has(d.operationId)).length });
  '
  ```
  Output at audit time: `{ routableReadWithFallback: 86, nonFallbackRead: 85, covered: 23, uncovered: 62 }` **[Executed]**. After Phase 3 (`b300a3ff`) the same command prints `{ routableReadWithFallback: 86, nonFallbackRead: 85, covered: 35, uncovered: 50 }` **[Executed 2026-11-08]**.
  - Including `GROUNDED_GUIDANCE`, there are **86** message-routable `READ` operations (matching Revision 1.528's count of 86), or **85** non-fallback `READ` operations.
  - **23 of 85 (27.1%)** have an explicit canonical answer contract in `askSemanticAnswerValidator.ts:97-248` (17 operations) or `support/canonicalAnswerBlocks.ts:8-17` (6 operations: `REPLACEMENT_GUIDANCE`, `CAPABILITY_DISCOVERY`, `PLANT_CARE_OUTLOOK`, `MATERIAL_SPECS_LIST`, `HOME_TIMELINE_EVENTS`, `NEIGHBORHOOD_CHANGE_FEED`) **[Executed]**. (Three additional operations in `AUTHORED_GUIDE_RESULT_CODES`—`HOME_BASICS_GUIDE`, `SEASONAL_HOME_CARE`, `HIRING_GUIDE`—have `messageRoutable: false`.)
  - **62 of 85 (72.9%)** non-fallback message-routable `READ` operations do not have a canonical block contract entry **[Executed]**.
- **Consequence **[Code-traced]**:** For those 62 operations, `validateAskSemanticAnswerRelevance` compares the question's words against the rendered answer blocks (`questionAnswerScore`) and competing operations' `answerPositiveExamples`. As documented in `ASK_COZY_INLINE_WORKSPACE_FRD.md` Revisions 1.528, 1.535, and 1.538, valid handler answers whose vocabulary differs from the user's question can score `UNKNOWN` or `FAIL` and be replaced by a clarification or `ASK_UNVERIFIABLE_ANSWER_TEXT`. (How often the remaining 62 operations fail on live property data is **not measured** because the offline sweep does not run DB-backed handlers.)

---

### Root Cause 5 (Rank 5 — Handler-Level Entity & Token Filtering): Post-Routing Mismatches **[Executed + Code-traced]**

1. **`REPLACEMENT_GUIDANCE` (`apps/backend/src/services/ask/handlers/miscHandlers.handler.ts:188-221`) **[Executed]**:**
   - In `askOperationRegistry.ts:1354-1358, 1934-1935`, `REPLACEABLE_NON_HVAC_ITEM` (`line 1354`), `KEEP_OR_REPLACE_INTENT` (`line 1357`), and `itemKeepOrReplacePattern` (`lines 1358, 1934-1935`) route repair/replace and longevity questions about 17 non-HVAC item terms (`microwave`, `oven`, `stove`, `cooktop`, `refrigerator`, `fridge`, `freezer`, `dishwasher`, `washer`, `washing machine`, `dryer`, `water heater`, `garbage disposal`, `roof`, `garage door`, `sump pump`, `dehumidifier`) plus HVAC terms to `REPLACEMENT_GUIDANCE`.
   - `apps/backend/tests/ask/itemHealthWording.test.js:1-49` tests **only `resolveAskRoutingCascade`** (confirming routing to `REPLACEMENT_GUIDANCE`), not `replacementGuidanceResult` (`miscHandlers.handler.ts`) **[Code-traced]**.
   - Inside `replacementGuidanceResult` (`miscHandlers.handler.ts:188-203`), only 7 item groups have regex branches (`hvac|furnace|air conditioner|heat pump`, `refrigerator|fridge`, `water heater`, `roof|roofing`, `washer|washing machine`, `dryer`, `dishwasher`). For any other item (`microwave`, `oven`, `stove`, `cooktop`, `freezer`, `garbage disposal`, `garage door`, `sump pump`, `dehumidifier`), `aliases` falls back to `[query]` (`line 195`).
   - **Reproducible Handler Execution **[Executed]**:**
     ```bash
     node -e '
     const path = require("node:path");
     const BACKEND = path.resolve("apps/backend");
     process.env.TS_NODE_TRANSPILE_ONLY = "true";
     process.env.TS_NODE_PROJECT = path.join(BACKEND, "tsconfig.test-cache.json");
     require(path.join(BACKEND, "node_modules/ts-node/register"));
     const { prisma } = require(path.join(BACKEND, "src/lib/prisma.ts"));
     const propertyAccessService = require(path.join(BACKEND, "src/services/propertyAccess.service.ts"));
     const { capabilityInvoke } = require(path.join(BACKEND, "src/services/ask/capabilityHandlerRegistry.ts"));
     require(path.join(BACKEND, "src/services/ask/handlers/miscHandlers.handler.ts"));
     propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: "p1", userId: "u1", role: "OWNER", isOwner: true });
     (async () => {
       prisma.inventoryItem.findMany = async () => [{ id: "i1", name: "Kitchen Microwave", category: "APPLIANCE", assetType: "MICROWAVE", brand: "GE", model: "JES1145", condition: "GOOD", installedOn: null, purchasedOn: null, expectedExpiryDate: null, updatedAt: new Date("2026-01-01T00:00:00Z") }];
       const recorded = await capabilityInvoke("REPLACEMENT_GUIDANCE", { userId: "u1", propertyId: "p1", sessionId: "s1", executionId: "e1", message: "Is my microwave still good?" });
       prisma.inventoryItem.findMany = async () => [];
       const unrecorded = await capabilityInvoke("REPLACEMENT_GUIDANCE", { userId: "u1", propertyId: "p1", sessionId: "s1", executionId: "e2", message: "Do I need a new microwave?" });
       console.log({ recordedTitle: recorded.blocks[0].title, recordedReason: recorded.reasonCode, unrecordedTitle: unrecorded.blocks[0].title, unrecordedActions: unrecorded.blocks[0].actions.map(a => a.label) });
     })();
     '
     ```
     Output at audit time, before Phase 1 **[Executed]**:
     ```json
     {
       "recordedTitle": "Tell me which item you mean",
       "recordedReason": "REPAIR_REPLACE_ITEM_NOT_IN_HOME_RECORD",
       "unrecordedTitle": "Tell me which item you mean",
       "unrecordedActions": ["Add an inventory item"]
     }
     ```
     - **Now (after Phase 1, `fcb9efb5`) [Executed 2026-11-08]:** the unrecorded call returns `I don’t have a microwave recorded for your home yet`. The recorded call no longer returns `Tell me which item you mean`: the matched microwave continues into `evaluateFeatureContext`, which throws under this stubbed Prisma (the harness limit below), so this snippet now ends in an error for that call. `itemHealthWording.test.js` covers the not-found and ambiguous outcomes.
     - **Harness limit **[Executed]**:** This harness exercises only the *not-found* outcomes. A recorded item whose name does match (e.g., a bare `"Microwave"`) passes item matching and then continues into a DB-backed property-context lookup (`evaluateFeatureContext`, `miscHandlers.handler.ts:244`), which throws under the stubbed Prisma. So the matched-path behavior (Branch A) is **[Code-traced]**, not executed.
     - **Why both fail **[Executed + Code-traced]**:**
       1. When `"Kitchen Microwave"` is on record and the user asks `"Is my microwave still good?"`, `query` is `"microwave still"` (`line 188`). At line `199`, `containsWholeWord(itemText(item), "microwave still")` is `false` and `containsWholeWord("microwave still", "Kitchen Microwave")` is `false` (whereas a single-word `item.name === "Microwave"` passes via `containsWholeWord("microwave still", "Microwave")`), so `"Kitchen Microwave"` is not matched and returns `REPAIR_REPLACE_ITEM_NOT_IN_HOME_RECORD` (`"Tell me which item you mean"`).
       2. When no microwave is on record and the user asks `"Do I need a new microwave?"`, `aliases[0] === query` (`line 202`), so `namedNoun` is `null` and the handler returns `"Tell me which item you mean"` instead of `"I don’t have a microwave recorded for your home yet"` (unlike `"Do I need a new roof?"`, which returns `"I don’t have a roof recorded for your home yet"`).
2. **`INVENTORY_LOOKUP` (`apps/backend/src/services/ask/handlers/inventory.handler.ts:41-58, 272-304`) **[Code-traced]**:**
   - `inventory.handler.ts:272` calls `findSpecificInventoryAlias(message)` from `apps/backend/src/services/ask/support/inventoryItemAliases.ts:7-24` (the 12-entry `INVENTORY_ITEM_ALIASES` list).
   - When `specific` is `undefined` and `!genericList`, lines `282, 296-303` initialize `let matches = allItems;` and, if `tokens.length > 0`, score each item by how many tokens from `inventorySearchTokens(message)` match via substring `inventoryItemSearchText(item).includes(token)` (`line 299`), keeping items tied for `topScore`.
   - Substring `.includes(token)` at line `299` is intentional so plurals and stems match (e.g., `"dishwashers"` in a tag or `"appliance"` against `"appliances"`), and if `INVENTORY_QUERY_STOP_WORDS` were broadened to strip all words in a query (`tokens.length === 0`), the `else if (!genericList && tokens.length)` guard at line `296` would be skipped and `matches` would remain `allItems` (returning the entire inventory for a question like `"What's still working?"`) **[Code-traced]**. Therefore, `inventory.handler.ts:299` should keep `.includes(token)` and predicate adjectives (`working`, `still`, `broken`) should **not** be added to `INVENTORY_QUERY_STOP_WORDS`.

---

### Root Cause 6 (Rank 6 — Multi-Turn Continuity): Rigid Follow-Up Prefix Regex **[Code-traced]**

In `apps/backend/src/services/ask/askFollowUpContext.ts:55-97`, `FILTER_CONTINUATION_PATTERN` only matches follow-up messages starting with:
```ts
/^(?:only|just|now\s+show|now\s+only\s+show|instead\s+show|filter\s+to|show\s+only|and\s+only)\b/i
```
Follow-up turns phrased as questions—such as *"What about the overdue ones?"* or *"Which ones are in the kitchen?"*—do not match `FILTER_CONTINUATION_PATTERN` and are routed without prior turn filter continuation **[Code-traced]**. (Not measured by `askRoutingCorpus.js`, which is single-turn.)

---

## 3. Architectural Constraints & Design Boundaries (`ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md`)

A review of the governing architecture documents establishes five constraints that any enhancement plan must respect:

1. **Deterministic Routing Is Primary; Model Routing (`ASK_MODEL_ROUTER_ENABLED`) Requires `--model` Sweep Evidence Before Enabling **[Code-traced + Product Decision]**:**
   - Per `ASK_COZY_INLINE_WORKSPACE_FRD.md` Revision 1.527 (`line 25`), `askModelRouter.ts` (`ASK_MODEL_ROUTER_ENABLED=false` in `askOperationalControls.ts:65`) was built to classify the ~29% fallback and ~7% clarification turns among up to 10 read-only local candidates, without seeing home data.
   - It is **intentionally off by default** until `node apps/backend/scripts/ask-routing-sweep.js --model` is run with a valid `GEMINI_API_KEY` to measure accuracy, new misroutes, latency, and cost.
2. **Model Router Must Remain Strictly Read-Only (`operation.semantic.effect === 'READ'`) **[Code-traced]**:**
   - In `askModelRouter.ts:44-51` and Revision 1.527, `isAskModelRoutableOperation` restricts the model router to `READ` operations and excludes write, `GOVERNED_WORKFLOW`, monitor, and boundary operations. Revision 1.520 documented multiple write misroutes (`routingWriteIntentGuards.test.js`); allowing an LLM classifier to trigger write or workflow-initiation operations would add a new misroute path.
3. **`SEARCH_ASSISTANT` Context Scope (`aggregationContext/context.ts:26-46`) Is Deliberately Narrow **[Code-traced]**:**
   - As documented in the inline comment at `apps/backend/src/services/aggregationContext/context.ts:26-46` and `ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md` §9 (`lines 209-216`), `SEARCH_ASSISTANT` is scoped to `['CORE', 'LOCATION', 'STRUCTURE', 'EVENTS', 'PRODUCT_CONTEXT']` so that conversational capture of `STRUCTURE` and `EVENTS` facts is reachable on subsequent turns, while domain capabilities (`INVENTORY`, `MAINTENANCE`, `COVERAGE`, `RISK`, `FINANCIAL`, `PROJECTS`, `SYSTEMS`) are owned by deterministic domain handlers via operation-declared context providers.
   - Widening `SEARCH_ASSISTANT` to 7 additional scopes is **rejected**: it would turn `GROUNDED_GUIDANCE` into a shadow LLM answer engine competing with deterministic domain services (violating Architecture Principles #2 and #9), send substantially more homeowner financial/coverage/inventory data to Gemini, and increase DB queries and token usage on fallback turns.
4. **General Guidance When a Property Is Selected (`groundedAsk.service.ts:112`) Is a Product Decision, Not a Bug **[Product Decision]**:**
   - In `groundedAsk.service.ts:112`, `const generalGuidance = context ? null : await approvedGeneralGuidance(input.message);` suppresses generic catalog/Knowledge Hub answers when a property is selected (`context !== null`), returning `"Nothing in your home record answers this"` followed by Revision 1.529's `"Did you mean one of these?"` (`offerDidYouMean`).
   - Whether to offer a clearly badged general-guidance fallback when *both* property claims and `offerDidYouMean` candidates are empty (`9 / 203` fallback prompts in the sweep **[Executed]**) is an **open product decision** for the owner, not a defect.
5. **Inline Workspace Calm UX (`ASK_COZY_INLINE_WORKSPACE_FRD.md`) **[Product Decision]**:**
   - Ask Cozy already provides starter pills (`CalmLanding.tsx`, `ConciergeHome.tsx`), topic discovery (`ExploreWithCozy.tsx`, `askDiscoveryTopics.ts`), target selectors (`launch: 'SELECTOR'` with `AskTargetSelectorId` in `askCapabilityBindings.ts:115-120`), and post-turn recovery (`offerDidYouMean`). Adding a composer autocomplete dropdown or "Mad-Libs" slot bar would duplicate existing discovery surfaces without fixing backend routing.

---

## 4. Evidence-Backed Enhancement Plan & Phased Roadmap

Every phase below is ordered by measured impact and risk, preserves standing architectural boundaries, and requires `node apps/backend/scripts/ask-routing-sweep.js --check` (`npm run test:ask:routing`). `npm run report:ask-routing-coverage` is required only for phases that change the local classifier, synonym groups or calibration evidence (Phase 2); Phases 1, 3 and 4 record the checks they actually ran (sweep, contract tests, related-test batch, typecheck) and did not run the coverage report.

### Phase 1: Deterministic Handler Fixes & Starter Parity (No LLM or Scope Change, Gated by the Ratchet)

1. **Unify `replacementGuidanceResult` with `findSpecificInventoryAlias` (`apps/backend/src/services/ask/handlers/miscHandlers.handler.ts:188-203`):**
   - **Problem **[Executed]**:** `REPLACEABLE_NON_HVAC_ITEM` (`askOperationRegistry.ts:1354`) and `itemKeepOrReplacePattern` (`askOperationRegistry.ts:1358, 1934-1935`) route 17 non-HVAC item terms to `REPLACEMENT_GUIDANCE`, whereas `replacementGuidanceResult` (`miscHandlers.handler.ts:189-195`) only has regex branches for 7 item groups and falls back to `[query]` for `microwave`, `oven`, `stove`, `cooktop`, `freezer`, `garbage disposal`, `garage door`, `sump pump`, and `dehumidifier`—failing on multi-word recorded names (`"Kitchen Microwave"`) and leaving `namedNoun = null` when the item is unrecorded (`lines 202-210`).
   - **Fix Details:**
     1. **Keep the HVAC branch first:** `INVENTORY_ITEM_ALIASES` (`support/inventoryItemAliases.ts:7-20`) has no HVAC entry, so the existing HVAC check (`/\b(?:hvac|furnace|air conditioner|heat pump)\b/i.test(message) ? ['hvac', 'furnace', 'air conditioner', 'heat pump']` at `miscHandlers.handler.ts:189`) must remain ahead of `findSpecificInventoryAlias(message)` so HVAC items still resolve all four HVAC terms and hand off to `hvacDecisionStartResult` (`line 241`) or set `namedNoun = 'HVAC system'` (`line 202`).
     2. **Use `findSpecificInventoryAlias(message)` for the 12 shared alias groups, and handle `garage door` in `replacementGuidanceResult` only:** Keep `INVENTORY_ITEM_ALIASES` (`support/inventoryItemAliases.ts:7-20`) unchanged so `INVENTORY_LOOKUP`'s single-vs-multiple entity disambiguation (`inventory.handler.ts:272, 354`) is not altered for garage doors; add an explicit `/\bgarage door\b/i.test(message) ? ['garage door']` branch in `replacementGuidanceResult` after `findSpecificInventoryAlias(message)`.
     3. **Preserve the user's spoken noun in `namedNoun`:** Because an `InventoryItemAlias` entry can group multiple words (e.g., `{ test: /\b(?:oven|stove|cooktop)\b/i, terms: ['oven', 'stove', 'cooktop'] }` or `['washer', 'washing machine']`), setting `namedNoun` to `specific.terms[0]` would reply `"I don’t have an oven recorded"` when the user asked about a `"stove"`. Instead, select the matched term that actually appears as a whole word in `message.toLowerCase()` (`aliases.find((term) => containsWholeWord(message.toLowerCase(), term)) ?? aliases[0]`) so `"Do I need a new stove?"` sets `namedNoun = 'stove'`.
2. **Fix `CARD_ENTRY_BINDINGS` Free-Form Message Parity (`apps/backend/src/services/ask/askCapabilityBindings.ts:21, 30` & `askOperationRegistry.ts`):**
   - **Problem **[Executed]**:** Two `CARD_ENTRY_BINDINGS` messages fail when typed or re-sent without `launchContext.operationId`: `"Show this home’s records"` (`home-records`, expected `PROPERTY_SUMMARY`, currently `REMOTE_FALLBACK`) and `"Show my claims"` (`claims`, expected `INCIDENT_CLAIM_STATUS`, currently misrouted to `WORK_OVERVIEW`).
   - **Fix:** Add deterministic routing coverage in `askOperationRegistry.ts` for `"show (this )?home's records"` -> `PROPERTY_SUMMARY` and `"show my claims"` -> `INCIDENT_CLAIM_STATUS`, and add a unit test asserting all 40 `CARD_ENTRY_BINDINGS` messages resolve to their declared `operationId`.

**Deferred on purpose (not in Phase 1):** `INVENTORY_LOOKUP` stop-word additions and the whole-word change at `inventory.handler.ts:299`. There is no executed repro of a sibling item being hidden, substring matching is intentional (plurals/stems), and broadening the stop words can empty `tokens` and return the whole inventory (Root Cause 5, item 2). Revisit only with a stubbed-`inventoryService` repro showing a real failing query.

**Phase 1 Test & Verification Plan:**
- Extend `apps/backend/tests/ask/itemHealthWording.test.js` to test `replacementGuidanceResult` (`capabilityInvoke('REPLACEMENT_GUIDANCE', ...)`) with:
  1. Multi-word recorded item names (`"Kitchen Microwave"`, `"Basement Dehumidifier"`).
  2. Unrecorded items where the user says a secondary alias (`"Do I need a new stove?"` -> `"I don’t have a stove recorded for your home yet"`, `"Do I need a new microwave?"` -> `"I don’t have a microwave recorded for your home yet"`).
  3. HVAC precedence (`"Should I replace my furnace?"` -> `HVAC` branch).
- Add a unit test (`apps/backend/tests/ask/cardEntryBindingsRouting.test.js`) verifying all 40 `CARD_ENTRY_BINDINGS` messages route to their declared `operationId`.
- Run `node apps/backend/scripts/ask-routing-sweep.js --check` to verify the baseline ratchet passes.

#### Phase 1 Results (implemented 2026-11-08, commit `fcb9efb5`) **[Executed + Code-traced]**

**Done:** both items.
1. `replacementGuidanceResult` (`miscHandlers.handler.ts`) now resolves every item the router sends it: HVAC wording keeps its own branch first, the 12 shared alias groups go through `findSpecificInventoryAlias`, `garage door` has a local branch, and an unrecorded item is named as the homeowner said it (`stove`, not `oven`). Item 2 (`CARD_ENTRY_BINDINGS`): `home-records` and `claims` now route by message text in `askOperationRegistry.ts`.
2. Tests: `itemHealthWording.test.js` gained handler-level tests (unrecorded item named as spoken, HVAC precedence, two recorded microwaves ask which one with multi-word names matched); `cardEntryBindingsRouting.test.js` asserts all 40 `CARD_ENTRY_BINDINGS` messages route to their declared operation (1 test, passes **[Executed]**).

| Measure | Before Phase 1 | After |
| :--- | ---: | ---: |
| 690-prompt sweep hits | 371 (53.8%) | **372 (53.9%)** |
| 690-prompt sweep misroutes | 67 | **66** |
| `CARD_ENTRY_BINDINGS` routing by message text | 38 / 40 | **40 / 40** |

**Not done / not verified:** `INVENTORY_LOOKUP` changes were deferred on purpose (see above). The matched-single-item path continues into a DB-backed property-context lookup, which the stubbed-Prisma tests cannot reach; only the not-found and ambiguous outcomes are tested. **Gaps found afterwards by external review and fixed in the Revision 9 review fixes below:** the handler's HVAC branch did not include `ac` / `a/c unit` (which the router sends here), and an item named by brand and model did not match its asset type when the type is stored with underscores (`WATER_HEATER`).

---

### Phase 2: Reduce the 67 Misroutes & 203 Fallbacks in the Deterministic & Local Router (Gated by Holdout & Ratchet)

Target the top failure classes measured in `node apps/backend/scripts/ask-routing-sweep.js` (`67` misroutes + `203` fallbacks):

1. **Tighten the Top 6 Hijacking Operations (`35` `DETERMINISTIC:mis` + `32` `LOCAL_CLASSIFIER:mis` **[Executed]**):**
   - Inspect the `35` deterministic regex hijacks and `32` local classifier misroutes from `node apps/backend/scripts/ask-routing-sweep.js --misses`, starting with the top hijackers:
     - `QUOTE_COMPARISON_REVIEW` (`6` hijacks)
     - `CAPABILITY_DISCOVERY` (`6` hijacks)
     - `PROPERTY_SUMMARY` (`4` hijacks)
     - `MAINTENANCE_STATUS` (`4` hijacks)
     - `MAINTENANCE_BUDGET_FORECAST` (`4` hijacks)
     - `HOME_CHANGE_SUMMARY` (`4` hijacks)
   - Add targeted negative guards to the Stage 2 regexes causing the `35` `DETERMINISTIC:mis` failures and hard negatives (`negativeExamples`) for the `32` `LOCAL_CLASSIFIER:mis` failures.
2. **Address Top Fallback Families (`203` `REMOTE_FALLBACK` prompts **[Executed]**) with Holdout Discipline:**
   - Focus on the operations with `0/6` to `2/6` hit rates in the sweep (`BUYER_CONTRACT_TIMELINE`, `BUYER_TITLE_ESCROW_READINESS`, `BUYER_DEADLINES`, `BUYER_FINANCING_READINESS`, `BUYER_DISCLOSURE_FUNDS_READINESS`, `BUYER_PLAN_STATUS`, `PROJECT_TRACKER_PROJECTS`, `INSPECTION_FINDING_UPDATE`, `INSPECTION_NEGOTIATION_PACKAGE`, `HOME_TIMELINE_EVENTS`, `DOCUMENT_LOOKUP`, `COVERAGE_GAPS`).
   - **Anti-Overfitting & Holdout Guardrail:**
     - Cap additions in `askOperationSemanticPackages.ts` at **at most 2–3 general domain phrases per operation** (maintaining the existing 4–7 positive examples per operation).
     - Do not copy sentences or n-gram fragments from `askTrustCertificationCorpus.ts` (enforced by the corpus integrity test) or directly paste test strings from `askRoutingCorpus.js`.
     - Before authoring regex or example changes for a batch of operations, create a separate held-out evaluation fixture file (`tests/fixtures/askRoutingHoldoutCorpus.js`, 2–3 unseen paraphrases per target operation written before inspecting misses) and evaluate `node apps/backend/scripts/ask-routing-sweep.js --corpus=tests/fixtures/askRoutingHoldoutCorpus.js` alongside the 690-prompt baseline sweep and the 126-fixture certification report.
3. **Fix Morphological Stemming in `askSemanticEmbedding.ts` & `askSemanticRouter.ts` (Gated by Both Corpora):**
   - Test matching `SEMANTIC_SYNONYM_GROUPS` over stemmed tokens (or adding common inflected forms such as `'replacing'`, `'leaking'`, `'insuring'`, `'refinancing'` to `SEMANTIC_SYNONYM_GROUPS` in `askSemanticEmbedding.ts:13-63`) so `askSemanticConcepts('replacing my furnace')` matches `'replace'`.
   - **Constraint:** Because changing `askSemanticEmbedding.ts` shifts raw scores in `askRoutingCalibrationEvidence.ts` (see `ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md` §4), any change to `SEMANTIC_SYNONYM_GROUPS` or `stem()` must pass both `npm run report:ask-routing-coverage` (`askRoutingCoverageReport.test.js`) and `node apps/backend/scripts/ask-routing-sweep.js --check`.

**Phase 2 Test & Verification Plan:**
- Run `node scripts/ask-routing-sweep.js --check` from `apps/backend` (whole default corpus only; the script rejects `--check` combined with `--corpus`), then `node scripts/ask-routing-sweep.js --corpus=tests/fixtures/askRoutingHoldoutCorpus.js` (report-only, not part of the ratchet; the file now exists, with `askRoutingHoldoutCorpus2.js` beside it), and `node scripts/run-tests-chunked.js tests/ask/askRoutingCoverageReport.test.js` before and after each batch (run all commands from `apps/backend`: `--corpus` resolves against the working directory, and plain `node --test` from the repo root cannot resolve the TypeScript imports); record verified improvements with `--write-baseline`.

#### Phase 2 Results (implemented 2026-11-08, commits `a7add690` and `4de820aa`) **[Executed]**

**Done:** deterministic (Stage 2) pattern widening for 11 of the 12 target fallback families, in `askOperationRegistry.ts`. Buyer family (`a7add690`): `BUYER_DEADLINES`, `BUYER_FINANCING_READINESS`, `BUYER_PLAN_STATUS`, `BUYER_TITLE_ESCROW_READINESS`, `BUYER_DISCLOSURE_FUNDS_READINESS`, `BUYER_CONTRACT_TIMELINE`. Non-buyer family (`4de820aa`): `PROJECT_TRACKER_PROJECTS`, `INSPECTION_FINDING_UPDATE`, `HOME_TIMELINE_EVENTS`, `DOCUMENT_LOOKUP`, `COVERAGE_GAPS`. Also added two held-out corpora (`askRoutingHoldoutCorpus.js`, `askRoutingHoldoutCorpus2.js`).

**Not done:** item 3 (stemming / synonym groups), `INSPECTION_NEGOTIATION_PACKAGE` (it has no deterministic route and overlaps Negotiation Shield and `BUYER_NEGOTIATION_READINESS`; left on purpose). (`HOME_TIMELINE_EVENTS`' "what has happened at my house" misroute to `HOME_EVENT_RADAR_FEED` **was fixed** by `4de820aa` **[Executed 2026-11-08]**; that family's remaining misroute is "what projects have i done on the house", which goes to `HOME_UPGRADE_SCENARIOS`.)

| Measure | Before Phase 2 | After |
| :--- | ---: | ---: |
| 690-prompt sweep hits | 372 (53.9%) after Phase 1 | **392 (56.8%)** |
| 690-prompt sweep misroutes | 66 | **64** |
| 690-prompt sweep fallbacks | 203 | **187** |
| 126-fixture certification (`askRoutingCoverageReport.test.js`) | passes | passes |
| Held-out slice 2 (24 prompts) | 4 (16.7%) | **9 (37.5%)** |
| Held-out slice 1 (36 prompts) | 4 (11.1%) | 26 (72.2%) **contaminated, see below** |

**Evidence discipline, stated plainly:**
- **Slice 1 is contaminated.** The buyer patterns were written after reading slice 1's misses, so its jump (4 to 20 hits after the buyer batch, 26 after both) measures overfitting, not generalization. Do not cite it as a result.
- **Slice 2 is the fair measure for the non-buyer batch only.** It was written after slice 1 was consumed and its misses were not read before the non-buyer patterns. For the buyer batch, slice 2 showed **no effect** (4/24 with and without the change, measured by stashing the change), so the buyer widening generalized poorly; its gain is limited to the main sweep (+3 hits at that point).
- **The non-buyer batch** was shaped by the main sweep's misses (allowed: patterns were generalized, not pasted) and moved slice 2 from 4 to 9.
- **Semantic positive examples were tried and reverted.** Adding 24 examples to `askOperationSemanticPackages.ts` gave about +3 main-sweep hits and no held-out gain, shifted raw scores, and broke the calibration drift ratchet (`askRoutingCoverageReport.test.js`, `COMPETITOR_CHANGED` on fixtures `v2-023` and `v2-043`). That confirms this document's constraint: example changes need the calibration evidence refreshed (`OD-4.1`), an owner decision.
- **Regression found and fixed in-flight:** one example ("remaining balance on my renovation contracts") created 3 new misroutes into `PROJECT_TRACKER_PROJECTS` (permit and affordability prompts); and the first `coveragePattern` wording captured "am i insured by closing day" from `BUYER_INSURANCE_READINESS`. The latter is fixed with a closing/purchase/escrow lookahead.

**Conclusion for planning:** pattern widening yields real but modest, family-specific gains (+20 main-sweep hits, +5 held-out hits) and does not transfer across families. Fallbacks are still 27.1% of the sweep. Further large gains likely need the calibration work (`OD-4.1` to `OD-4.3`), not more regexes.

**Verification run:** `ask-routing-sweep.js --check` clean; ratchet and coverage tests pass; routing test group 91 of 93 pass. The 2 failures (`routing calibration is derived from traceable labeled fixture rows`, `ordinary read questions never route to a correction command`) also fail on a clean checkout and are unrelated to this work. `tsc --noEmit` is clean. **Not verified:** buyer-mode eligibility gating (the sweep does not model it), live behaviour with real property data.

#### Phase 2 Item 1 Results: Hijacker Guards (implemented 2026-11-08, commit `515a0585`) **[Executed]**

**Done:** targeted guards in the Stage 2 patterns of `askOperationRegistry.ts` and `support/homeRecordExport.ts`, in two kinds.
- **A question about what happened is a status read, never the command.** `CLAIM_TRANSITION` no longer takes "did / has / was / when did my claim get approved" (it goes to `INCIDENT_CLAIM_STATUS`). `HOME_RECORD_EXPORT_STATUS` now takes "has my export finished" and "can i download my export yet" instead of starting a new export. "What if I delay maintenance" and "what happens if I skip maintenance" go to `DO_NOTHING_SIMULATION`, not `MAINTENANCE_TASK_UPDATE`.
- **Wording goes to the operation that owns it.** `QUOTE_COMPARISON_REVIEW` no longer takes HVAC/AC quotes (`HVAC_DECISION_SCENARIO`), "finalized" quotes (`PRICE_FINALIZATIONS_LIST`) or insurance/policy/coverage comparisons (`COVERAGE_COMPARISON_STATUS`). Catch-all routes gave up prompts that now reach `REFINANCE_RATE_MONITOR`, `SAVINGS_OPPORTUNITIES`, `CAPITAL_RESERVE_PLAN`, `WORK_OVERVIEW` and `MAJOR_EVENT_ENTRY`.

| Measure | Before | After |
| :--- | ---: | ---: |
| 690-prompt sweep hits | 392 (56.8%) | **409 (59.3%)** |
| 690-prompt sweep misroutes | 64 | **48 (7.0%)** |
| 690-prompt sweep fallbacks | 187 | **186 (27.0%)** |
| Held-out slice 2 (24 prompts) | 9 | 9 (unchanged) |
| Held-out slice 1 (36 prompts, contaminated) | 26 | 26 (unchanged) |

**Tests:** new `tests/ask/hijackerGuards.test.js` (4 tests, passing). Each guard has a counterpart proving the real command still works ("approve the claim", "submit my claim", "export my home record as a pdf", "reschedule the gutter cleaning to next month", "push back my hvac service by two weeks", "show my do nothing simulation"). `ask-routing-sweep.js --check` reports no regression and the baseline was re-recorded. Routing test group: 95 of 97 pass; the 2 failures (`askRoutingCalibration`, `correctionRouting`) also fail on a clean checkout. `tsc --noEmit` is clean.

**Not done, on purpose:** the 48 remaining misroutes are mostly the local classifier's home-status and digital-will prompts, or judgment calls (for example "compare my quotes side by side" going to the review rather than `QUOTE_COMPARISON_CREATE`). "Set my hvac decision preference" still reaches the forget-preference command: that command is confirmation-gated and has nothing to forget in that case, but the intent is backwards, and saving a preference such as "quiet furnace" is not supported by the save operation. Held-out slices did not move because they hold fallback-family prompts, not misroutes. Hard negatives for the classifier (`negativeExamples`) were not added: they shift raw scores and need the calibration refresh (`OD-4.1`).

---

### Phase 3: Expand Per-Operation Canonical Answer Block Contracts (`support/canonicalAnswerBlocks.ts`)

1. **Verify Handler Block Prefixes One Operation at a Time (`support/canonicalAnswerBlocks.ts`):**
   - **Problem **[Executed]**:** `62 of 85` non-fallback message-routable `READ` operations lack an entry in `CANONICAL_ANSWER_BLOCK_ID_PREFIXES` (`apps/backend/src/services/ask/support/canonicalAnswerBlocks.ts:8-17`), leaving their valid typed answers subject to lexical overlap rejection in `validateAskSemanticAnswerRelevance`.
   - **Fix (Per-Operation, Preserving the Gate):** Do **not** weaken `validateAskSemanticAnswerRelevance` for generic `HIGH_CONFIDENCE` or `MODEL_CLASSIFIER` routes. Instead, inspect each handler's actual block ID prefixes (following Revision 1.528 and 1.538) and add verified distinct prefixes to `CANONICAL_ANSWER_BLOCK_ID_PREFIXES` for operations whose handlers emit unique block ID prefixes (e.g., `APPLIANCE_FAILURE_RISK`, `MAINTENANCE_BUDGET_FORECAST`, `MAINTENANCE_FORECAST`, `WARRANTY_LOOKUP`, `DOCUMENT_LOOKUP`, `INCIDENT_CLAIM_STATUS`, `INSPECTION_FINDINGS`, `RECALL_REVIEW`, `SELL_HOLD_RENT_ANALYSIS`, `PROPERTY_TAX_APPEAL_READINESS`, `BREAK_EVEN_ANALYSIS`, `DO_NOTHING_SIMULATION`, `HOA_COMPLIANCE_STATUS`, `SERVICE_PRICE_CHECKS`, `PROJECT_TRACKER_PROJECTS`, `DIY_PROJECTS`).
   - Where a handler currently uses generic block IDs (such as `'summary'` or `'list'`), first namespace that handler's block IDs (e.g., `'warranty-lookup-summary'`) so `matchesCanonicalAnswerBlocks` does not match a different operation's output.

**Phase 3 Test & Verification Plan:**
- Extend `apps/backend/tests/ask/canonicalAnswerContracts.test.js` for each added operation, verifying both positive pass (`CANONICAL_TYPED_ANSWER_CONTRACT_MATCH`) and cross-operation rejection against `ASK_ANSWER_RELEVANCE_CROSS_OPERATION_NEGATIVE_MATRIX`.

#### Phase 3 Results (implemented 2026-11-08, commit `b300a3ff`) **[Executed + Code-traced]**

**Done:** 12 operations were added to `CANONICAL_ANSWER_BLOCK_ID_PREFIXES` (`support/canonicalAnswerBlocks.ts`). Each prefix was read from the operation's own handler **[Code-traced]**:

| Operation | Prefix | Handler |
| :--- | :--- | :--- |
| `APPLIANCE_FAILURE_RISK` | `appliance-oracle-` | `applianceOracleBudget.handler.ts` |
| `WARRANTY_LOOKUP` | `warranty-summary`, `-results`, `-empty`, `-no-match`, `-show-all` (exact) and `warranty-item-` (narrowed in Revision 9; was `warranty-`) | `warranties.handler.ts` |
| `INCIDENT_CLAIM_STATUS` | `incident-claim-` | `claims.handler.ts` |
| `RECALL_REVIEW` | `recall-review-` | `recallReview.handler.ts` |
| `SELL_HOLD_RENT_ANALYSIS` | the read handler's exact ids and `sell-hold-rent-what-if-` (narrowed in Revision 9; was `sell-hold-rent-`) | `sellHoldRent.handler.ts` |
| `PROPERTY_TAX_APPEAL_READINESS` | `tax-readiness-` | `capitalPlanning.handler.ts` |
| `BREAK_EVEN_ANALYSIS` | `break-even-` | `refinance.handler.ts` |
| `DO_NOTHING_SIMULATION` | the simulator's exact ids, `do-nothing-summary`, `-board`, `-costs`, ... (narrowed in Revision 9; was `do-nothing-`) | `doNothingSimulator.handler.ts` |
| `HOA_COMPLIANCE_STATUS` | `hoa-compliance-` (narrowed in Revision 9; was `hoa-`) | `hoaCompliance.handler.ts` |
| `SERVICE_PRICE_CHECKS` | `service-price-radar-` | `servicePriceRadar.handler.ts` |
| `PROJECT_TRACKER_PROJECTS` | `project-tracker-`, plus `project-detail-`, `project-execution-alignment`, `project-closeout-preview` for the single-project view (added in Revision 9) | `projectTracker.handler.ts` |
| `DIY_PROJECTS` | exact ids `diy-summary`, `diy-projects`, `diy-active`, `diy-limit` (narrowed in Revision 9; was `diy-`) | `diyProjectCenter.handler.ts` |

**Correction (Revision 9, external review):** the original claim that every one of the 12 already emitted distinct ids was wrong for six of them. `hoa-` also matched the HOA command handler's ids, `diy-` matched five other DIY handlers' ids, `warranty-`, `do-nothing-` and `sell-hold-rent-` matched command and capture handlers' ids, and `PROJECT_TRACKER_PROJECTS` missed the single-project view's ids. A command's review card could therefore have skipped the relevance check. Those entries are now exact ids or narrower prefixes (an entry ending in `$` in `canonicalAnswerBlocks.ts` is an exact id), and a new test scans every handler's literal block ids and fails if any entry matches a block emitted outside the operation's own read handler **[Executed]**. `tax-appeal-` ids were left out of `PROPERTY_TAX_APPEAL_READINESS` because they belong to the appeal-case list, not the readiness answer.

**Deliberately not done (departure from the plan above):** the plan named `MAINTENANCE_BUDGET_FORECAST`, `MAINTENANCE_FORECAST`, `DOCUMENT_LOOKUP` and `INSPECTION_FINDINGS`. They were left under the relevance check. The routing sweep **[Executed]** shows 10 prompts misrouted into them (`4`, `2`, `2` and `2` respectively), and the relevance check is what catches such a misroute and turns it into a clarification. A canonical-block match skips that check, so adding the four would show a wrong answer to those prompts. **Known false-accept exposure for the 12 added (review finding, accepted, not measured):** `validateAskSemanticAnswerRelevance` returns PASS on a canonical-block match before any question/answer or competitor scoring, so for these 12 a *misrouted* question that reaches the right handler's normal output is shown, not turned into a clarification. The tests prove block ownership and cross-handler rejection of *blocks*; they do not inject wrong *questions* into each operation, so the false-accept rate is unmeasured and no corpus size makes it zero. This reduces defense in depth and is an owner decision; limiting the bypass to declared, deterministic or user-confirmed routes (as `skipSemanticAnswerRelevance` already does for declared actions) is the alternative, and an adversarial wrong-question test per operation is the missing evidence. Related: the same trade-off applies in smaller form to the 12 that were added (the sweep shows no misroutes into them, but it does not model buyer gating or live data). Adding the four is an owner decision.

**Tests:** `canonicalAnswerContracts.test.js` gained two tests **[Executed]**:
- For each of the 12: the prefix's example id really appears in the handler source (a typo or renamed block id fails), the operation accepts its own block, and it rejects the fallback block, a footer-only result, and each of the other 11 operations' blocks.
- The four deferred operations have no entry.

**Verification run (commit `b300a3ff`, Phase 3 only; later revisions changed the counts):** `canonicalAnswerContracts.test.js` 9 of 9 pass. The 101 test files that touch the answer validator or trust pipeline ran through `scripts/run-tests-chunked.js`: **971 of 976 pass**. The 5 failures (`claimsCalmAnswer.test.js` 1, `quoteReviewStrip.test.js` 4) fail identically on a clean checkout, so they are not from this work. `tsc --noEmit` is clean.

**Not measured:** how many valid answers were being refused on live data before, and how many this removes. The offline sweep runs no DB-backed handlers, so Root Cause 4's consequence stays code-traced and the benefit of Phase 3 is not quantified.

---

### Phase 4: Multi-Turn Follow-Up Wording & Model-Router Evaluation (Gated / Owner Decisions)

1. **Broaden Conversational Filter Follow-Ups (`apps/backend/src/services/ask/askFollowUpContext.ts:55-97`):**
   - Extend `FILTER_CONTINUATION_PATTERN` to recognize conversational filter continuations (`"what about the overdue ones"`, `"how about in the kitchen"`, `"which ones are urgent/high priority"`) when `priorContext` has an active list operation (`MAINTENANCE_STATUS`, `INVENTORY_LOOKUP`, `HOME_ACTIONS`, `WORK_OVERVIEW`) and the message contains a valid status/urgency/room filter token for that operation.
   - Add multi-turn unit tests in `apps/backend/tests/ask/` covering both positive filter continuations and negative topic-switch guards (verifying that `"what about my mortgage rate?"` after `MAINTENANCE_STATUS` routes to `REFINANCE_ANALYSIS` rather than continuing `MAINTENANCE_STATUS`).
2. **Execute Offline Model-Router Evaluation Before Deciding on `ASK_MODEL_ROUTER_ENABLED` (`ASK_COZY_INLINE_WORKSPACE_FRD.md` Revision 1.527):**
   - Run `node apps/backend/scripts/ask-routing-sweep.js --model --misses` in an environment with network access and `GEMINI_API_KEY`.
   - Review the measured output (`local only` vs. `with model` hit rate, fallback reduction, any new misroutes, and latency/cost) before making an owner decision on enabling `ASK_MODEL_ROUTER_ENABLED=true`.
   - **Rollback / Safety Control:** `ASK_MODEL_ROUTER_KILL_SWITCH=true` (`askOperationalControls.ts:66`) disables model routing at runtime without code changes.
3. **Owner Decisions Required Before Any Calibration or Fallback Policy Change:**
   - **`OD-4.1` / `OD-4.2` / `OD-4.3` (`ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md` §6):** Refreshing the 4 drifted calibration evidence rows and addressing the `0.30–0.50` READ isotonic plateau require paired hard-negative additions and a dedicated calibration design study.
   - **General Guidance When Property Is Selected (`groundedAsk.service.ts:112`):** Decide whether `REMOTE_FALLBACK` turns that yield neither a property claim nor any `offerDidYouMean` option (`9 / 203` fallback prompts in the sweep **[Executed]**) should remain `"Nothing in your home record answers this"` or offer an explicitly badged general homeowner guidance card.

#### Phase 4 Results (item 1 implemented 2026-11-08, commit `e20a49e9`) **[Executed + Code-traced]**

**Item 1, conversational filter follow-ups: done.** `askFollowUpContext.ts` gained `conversationalFilterAsOnlyShow` and a branch in `resolveAskFollowUpMessage`. A conversational narrowing is rewritten, for routing and parsing only, into the existing `Only show ...` wording, which `containsFilterContinuation` and every list handler already understand. The text shown to the homeowner is unchanged. **Correction (Revision 9, external review):** as first shipped the rewrite was joined to the prior question and was only checked as a string, and three lists did not act on it. Fixed below. This differs from the plan above, which proposed widening `FILTER_CONTINUATION_PATTERN` itself: widening the shared pattern would change what each handler's own `containsFilterContinuation(message)` check accepts, so a rewrite into the one form they already accept is safer **[Code-traced]**.

| Message after a list | Prior list | Result |
| :--- | :--- | :--- |
| "What about the overdue ones?", "Which ones are urgent?", "And the completed ones?", "How about the due soon ones" | `MAINTENANCE_STATUS`, `HOME_ACTIONS`, `WORK_OVERVIEW` | Continues that list, rewritten to `Only show the ... ones` |
| "How about in the kitchen?" | `MAINTENANCE_STATUS` only | Continues that list, rewritten to `Only show tasks in the kitchen` |
| "What about my mortgage rate?", "What about the kitchen faucet?", "How about in the budget?", "Which ones are covered by warranty?", "What about the overdue taxes on my property?" | any | Unchanged; routed as a new question |
| "What about the overdue ones?" | `INVENTORY_LOOKUP`, `DOCUMENT_LOOKUP`, `COVERAGE_GAPS`, `PROPERTY_SUMMARY` | Unchanged (those lists have no such filter) |

**Scope cut from the plan:**
- `INVENTORY_LOOKUP` is not a target. Its refinement (`resolveInventoryRefinement`) filters by status (incomplete, lifecycle, all) and category (HVAC, appliance, roof) only; a room phrase would continue the list without narrowing anything **[Code-traced]**. The plan's `"How about in the kitchen"` example therefore works for maintenance lists, where the handler matches the room name against task rooms (`maintenance.handler.ts:991`), and not for inventory.
- The status words are limited to a closed list (overdue, urgent, critical, high priority, due soon, coming up, upcoming, pending, open, completed, done, cancelled); rooms to a closed list of common room names. Anything else is a new question by design.

**Tests:** `tests/ask/conversationalFilterFollowUps.test.js` (11 after Revision 9, all pass **[Executed]**) covers the positive phrasings, the rewrite text, the declared-chip form (message alone, no concatenation), the maintenance-only room rule, the topic-switch guards above, wrong-list guards, and that the existing `Only show ...` wording is unchanged. Across the 131 related tests run through `run-tests-chunked.js`, 124 pass; the 7 failures are all in `documentViews.test.js` and fail identically without this change **[Executed]**. The existing follow-up tests are among those that pass. The typecheck printed no errors.

**Not verified:** behaviour with real task data and the full handler path. The tests mock the prior execution row.

**Revision 9 correction (the original claim here, that the handlers' own parsing was covered by existing tests, was wrong).** An external review traced the rewritten string into each handler **[Executed for `HOME_ACTIONS`, Code-traced for the other two]** and found: (1) `homeActionPriorityFilter` understands only urgent / right now / soon / plan words, so "high priority", "overdue" and the rest returned the unfiltered feed; (2) `WORK_OVERVIEW` understands only completed / upcoming / open-like words; (3) the rewrite was appended to the prior question (`"<prior>. Only show ..."`), so the prior question's words won ("right now" over "soon", "needs me" over "completed", "overdue" over "due soon", the remembered room over a new one). Fixes: the rule is now per list, and applies to the typed `Only show ...` sentence as well as the conversational one (`filterEffectiveMessage`). `WORK_OVERVIEW` and `HOME_ACTIONS` take the filter on its own, as a declared chip already did (`HOME_ACTIONS` keeps the all-properties scope its first question set). `MAINTENANCE_STATUS` still joins the prior question, because a filter of a different kind should narrow it ("due soon", then "only the urgent ones", is both), but the prior question's words of the same kind as the new filter (timing, completed / cancelled, open, priority, room) are removed first, so the new one wins. Every other list keeps the older join; its handler reads scope from the joined sentence and nothing shows otherwise. Each list has its own word table (`HOME_ACTIONS` maps urgent / critical / high priority / overdue to "urgent" and due soon / coming up / upcoming to "due soon"; `WORK_OVERVIEW` maps completed / done, upcoming / coming up and open; a word a list cannot narrow by is now a new question, not an unfiltered answer); and a follow-up that names its own room replaces the remembered room scope in `mergeMaintenanceViewContinuation`. New handler-level tests run the rewritten message through `homeActionPriorityFilter`, `resolveWorkState` and `mergeMaintenanceViewContinuation` **[Executed]**.

**Item 2, offline model-router evaluation: not run.** `node apps/backend/scripts/ask-routing-sweep.js --model --misses` needs `GEMINI_API_KEY` and network access; no key is set in this environment. It also sends the corpus prompts to an external service, so it should be run deliberately by the owner. The decision on `ASK_MODEL_ROUTER_ENABLED` still has no measured evidence behind it, and the router stays off by default.

**Item 3, owner decisions: unchanged and open.** `OD-4.1` to `OD-4.3` (refreshing the drifted calibration evidence rows and the `0.30-0.50` isotonic plateau) and the general-guidance-when-a-property-is-selected question (`groundedAsk.service.ts:112`). Phase 2's results show why the first is now the main lever: pattern widening plateaued, and semantic examples cannot be added without refreshing that evidence.

### Revision 9 Review Fixes (2026-11-08, external review of the implementation) **[Executed]**

An external review found five gaps in the Phase 1–4 implementation and document. Each was checked against the code before changing anything; all five were real. Fixed in this order:

| # | Finding | Fix | Evidence |
| :--- | :--- | :--- | :--- |
| 1 (P1) | Phase 4 conversational filters did not filter in `HOME_ACTIONS`, `WORK_OVERVIEW` or multi-turn `MAINTENANCE_STATUS` | Per-list rule for conversational and typed `Only show` filters: stand alone, or drop the prior words of the same kind; per-list word tables; a named room replaces the remembered room (see Phase 4 Results) | `conversationalFilterFollowUps.test.js` 11 / 11, runs the rewrite through each handler's parser |
| 2 (P2) | `replacementGuidanceResult` missed `ac` / `a/c unit` and underscore asset types | HVAC branch takes `a/?c( unit)?`; `itemText` turns `_` into a space | 2 new tests in `itemHealthWording.test.js`; both fail without the fix |
| 3 (P2) | Phase 3 prefixes shared with command handlers; `PROJECT_TRACKER_PROJECTS` detail view missed | Narrowed to exact ids / specific prefixes; detail ids added (see Phase 3 Results) | New scan test over every handler's block ids; fails with the old `hoa-` prefix restored |
| 4 (P2) | `claimOutcomeQuestionPattern` only guarded did / has / was ... questions | Now also what / which / how / why / who / where / do / does / had; "can / could / would you ..." deliberately left out because it is a polite command ("can you submit my claim"); `under review` added to the claim-status read | `hijackerGuards.test.js` |
| 5 (P2) | Document contradictions | Section 1 and 2 figures labelled as audit-time with current values; Phase 1 Results added; false "not done" item and stale held-out and working-directory notes corrected | This revision |

Verification: `ask-routing-sweep.js --check` clean, sweep unchanged at 409 hits / 186 fallbacks / 48 misroutes; `tsc --noEmit` clean.

---

### Current-HEAD addendum (commit `c6c2f16d`, 2026-11-09) **[Executed]**

Re-running the Phase 3 counting command at this commit gives `{ routableReadWithFallback: 86, nonFallbackRead: 86, covered: 36, uncovered: 50 }`, not 85 / 35 / 50: `CAPITAL_ITEM_FUNDING_GOAL` became routable and has an `item-funding-` contract (`canonicalAnswerBlocks.ts:23`) that the Phase 3 inventory above predates. Figures elsewhere in this document are pinned to the commit named beside them.

## 5. Summary of Roadmap, Metrics & Rollback Controls

| Phase | Scope | Primary Metric & Gate | Rollback / Safety Control |
| :--- | :--- | :--- | :--- |
| **Phase 1** (done, `fcb9efb5`) | `miscHandlers.handler.ts` (`findSpecificInventoryAlias` in `replacementGuidanceResult` with HVAC-first precedence, local `garage door` branch, and spoken-noun `namedNoun`), `CARD_ENTRY_BINDINGS` routing parity (`home-records`, `claims`) | Extend `itemHealthWording.test.js`, new `cardEntryBindingsRouting.test.js` + `node scripts/ask-routing-sweep.js --check` | Gated by the routing ratchet; revert commit if any test regresses |
| **Phase 2** (partial: pattern widening done, `a7add690` + `4de820aa`; hijacker guards done for the Stage 2 patterns, `515a0585`; classifier negatives, stemming, negotiation package not done; see Phase 2 Results) | Top 6 hijacker regex guards (`67` misroutes) + top fallback operation patterns/examples (`203` fallbacks, capped at 2–3 examples/op) | `node scripts/ask-routing-sweep.js --check`, held-out corpora (`askRoutingHoldoutCorpus.js` and `askRoutingHoldoutCorpus2.js`, created in Phase 2; report-only), and `askRoutingCoverageReport.test.js` | CI routing ratchet (`tests/ask/routingSweepRatchet.test.js`) blocks any lost hit or new misroute |
| **Phase 3** (done for 12 of 16 named operations, `b300a3ff`; the other 4 deferred on purpose, see Phase 3 Results) | Per-operation `CANONICAL_ANSWER_BLOCK_ID_PREFIXES` additions (`support/canonicalAnswerBlocks.ts`) for uncovered `READ` handlers | `tests/ask/canonicalAnswerContracts.test.js` + `ASK_ANSWER_RELEVANCE_CROSS_OPERATION_NEGATIVE_MATRIX` | Remove individual operation prefix entry in `canonicalAnswerBlocks.ts` |
| **Phase 4** (item 1 done, `e20a49e9`; item 2 needs `GEMINI_API_KEY` and was not run; item 3 is owner decisions; see Phase 4 Results) | Multi-turn filter continuations (`askFollowUpContext.ts`) + live `--model` sweep measurement (`Revision 1.527`) | Multi-turn follow-up unit tests + `node scripts/ask-routing-sweep.js --model --misses` report reviewed by owner | `ASK_MODEL_ROUTER_KILL_SWITCH=true` (`askOperationalControls.ts:66`) and `ASK_MODEL_ROUTER_ENABLED=false` (`line 65`) |
