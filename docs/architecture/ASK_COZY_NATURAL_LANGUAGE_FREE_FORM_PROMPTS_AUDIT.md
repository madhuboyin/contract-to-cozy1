# Ask Cozy: Natural Language & Free-Form Prompts Comprehensive Audit (Revision 2)

**Date:** 2026-11-08  
**Scope:** End-to-end audit of Ask Cozy prompt handling (`apps/frontend/src/components/ask/*` and `apps/backend/src/services/ask/*`)  
**Governing Documents Read:**
- [`docs/architecture/AUDIT_METHODOLOGY.md`](../architecture/AUDIT_METHODOLOGY.md) (Items 1–20 verification standard)
- [`docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md`](../product/ASK_COZY_INLINE_WORKSPACE_FRD.md) (specifically Revisions 1.520–1.538: the 2026-11-07 natural-language routing review and screenshot retests)
- [`docs/architecture/ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md`](../architecture/ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md) (Phase 4 126-fixture certification measurement & `OD-4.1`–`OD-4.3`)
- [`docs/architecture/ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md`](../architecture/ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md) (§5 Architecture Principles, §7 Router vs. Conversational Understanding, §9 `SEARCH_ASSISTANT` Context Scope)

---

## How Claims Are Labelled (`AUDIT_METHODOLOGY.md` §1)

- **[Executed]:** Code, scripts, or pure functions were run in this workspace (`node apps/backend/scripts/ask-routing-sweep.js` and pure-function harnesses over `resolveAskRoutingCascade`, `ASK_ROUTING_CERTIFICATION_FIXTURES`, `ASK_DISCOVERY_BINDINGS`, `CARD_ENTRY_BINDINGS`, `normalizeAskMessage`, and `askSemanticConcepts`) and the exact output was observed. No database or network connection was used.
- **[Code-traced]:** Verified by reading the TypeScript source files and tracing branches, types, and callers, but not executed end-to-end because the path requires a live PostgreSQL database, property record state, or external Gemini network call.
- **[Inferred]:** Extrapolated from code structure or corpus distributions where production traffic telemetry is unavailable.
- **[Product Decision]:** A behavioral trade-off governed by product policy rather than a code defect (`AUDIT_METHODOLOGY.md` §5, §8).

---

## 1. Executive Summary & Baseline Measurements

### 1.1 Current Measured Routing Baseline **[Executed]**

Two offline corpora measure free-form natural-language routing in `apps/backend`:

1. **690-Prompt Natural-Language Sweep (`apps/backend/scripts/ask-routing-sweep.js` over `tests/fixtures/askRoutingCorpus.js`, 108 operations):**
   - In the initial 2026-11-07 sweep (`ASK_COZY_INLINE_WORKSPACE_FRD.md` Revision 1.520), the router scored **286 / 642 hits (44.5%)** with **94 misroutes (14.6%)**.
   - Following Revisions 1.520–1.538 (steps 1–7 of the 2026-11-07 routing review and screenshot groups 1–7), executing `node apps/backend/scripts/ask-routing-sweep.js` today produces **[Executed]**:

| Outcome | Count (of 690) | Share | Stage Breakdown **[Executed]** |
| :--- | ---: | ---: | :--- |
| **Hit (`hit`)** — expected or equivalent operation | **371** | **53.8%** | `306` via `DETERMINISTIC` regex (`44.3%`), `65` via `LOCAL_CLASSIFIER` (`9.4%`) |
| **Fallback (`fb`)** — `REMOTE_FALLBACK` (`GROUNDED_GUIDANCE`) | **203** | **29.4%** | All `203` fell through Stage 2 regex and Stage 3 classifier thresholds |
| **Misroute (`mis`)** — routed to a wrong operation | **67** | **9.7%** | `35` via `DETERMINISTIC` regex hijack (`5.1%`), `32` via `LOCAL_CLASSIFIER` (`4.6%`) |
| **Clarification (`clarOk`)** — offered the right operation | **31** | **4.5%** | Stage `CLARIFICATION` where expected/equivalent op is in top-3 options |
| **Clarification (`clarBad`)** — right operation not offered | **18** | **2.6%** | Stage `CLARIFICATION` where expected/equivalent op is absent from options |

2. **126-Fixture Certification Corpus (`ASK_ROUTING_CERTIFICATION_FIXTURES` in `askTrustCertificationCorpus.ts`, documented in `ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md` §2) [Executed]:**
   - **92 / 126 (73.0%)** route to the expected operation (`53` deterministic, `23` HIGH confidence, `12` MEDIUM, `3` safety gate, `1` `GROUNDED_GUIDANCE`).
   - **0 / 126 (0.0%)** route to a wrong operation.
   - **8 / 126 (6.3%)** ask for clarification (offering the right operation in all 8).
   - **26 / 126 (20.6%)** fall through to `REMOTE_FALLBACK` (with the expected operation ranked #1 by raw retrieval score in **24 of 26**, and within top-3 in **25 of 26**).

### 1.2 Why Fixed Starters Succeed While Free-Form Prompts Fail **[Executed + Code-traced]**

Fixed starter prompts and free-form typed prompts differ in two ways:

1. **Curated Wording Tested Against Stage 2 Regexes (`launch: 'MESSAGE'`):**  
   In `apps/backend/src/services/ask/askCapabilityBindings.ts:105-265`, **55 of 60** discovery bindings use `launch: 'MESSAGE'`. Running all 55 `question` strings through `resolveAskRoutingCascade` without `launchContext` confirms that **55 / 55 (100%)** hit their exact target operation via Stage 2 `DETERMINISTIC` regexes **[Executed]**, because `askExplorerRegistry.ts:186-188` asserts at module load that every `MESSAGE` binding resolves deterministically **[Code-traced]**. Similarly, all 8 starter prompts in `CalmLanding.tsx:61-105` and `ConciergeHome.tsx:153-163` hit their target operation via Stage 2 `DETERMINISTIC` rules **[Executed]**.
2. **Direct Operation Context Binding (`launchContext.operationId`):**  
   When a user clicks a starter pill or capability card that supplies `launchContext.operationId` (`AskWorkspace.tsx:367-375`, `useAskRequest.ts:80-102`), `createAskExecution.ts:309-312, 411-428, 568-571` binds `declaredItemActionOperationId` at confidence `1.0` and sets `skipSemanticAnswerRelevance: true` **[Code-traced]**.  
   Running the **40** `CARD_ENTRY_BINDINGS` (`askCapabilityBindings.ts:18-103`) and **5** non-`MESSAGE` discovery bindings through `resolveAskRoutingCascade` *without* `launchContext.operationId` shows **[Executed]**:
   - **38 / 40 (95.0%)** of `CARD_ENTRY_BINDINGS` still match by message text, but **2 / 40 fail** without `launchContext.operationId`:
     - `home-records` (`"Show this home’s records"`, expected `PROPERTY_SUMMARY`) falls to `REMOTE_FALLBACK` (`GROUNDED_GUIDANCE`).
     - `claims` (`"Show my claims"`, expected `INCIDENT_CLAIM_STATUS`) misroutes to `WORK_OVERVIEW` via `LOCAL_CLASSIFIER`.
   - **3 / 5** non-`MESSAGE` discovery bindings (`understand-add-detail` -> `CLARIFICATION`, `maintain-diy-start` -> `DIY_PROJECTS` instead of `DIY_TEMPLATE_BROWSE`, `maintain-diy-continue` -> `DIY_PROJECTS` instead of `DIY_PROJECT_GUIDE`) require their declared `operationId` or `selectorId` (`AskTargetSelectorId`) to reach their target operation **[Executed]**.

When a homeowner types a free-form question in the composer (`AskWorkspace.tsx:391`), `promptContext` is `undefined` **[Code-traced]** and the phrasing is not restricted to the phrases encoded in `askOperationRegistry.ts`.

---

## 2. Ranked Root-Cause Analysis

Root causes below are ordered by the number of affected prompts in the 690-prompt sweep (`askRoutingCorpus.js`), followed by post-routing handler and validation gates.

### Root Cause 1 (Rank 1 — 203 / 690 prompts, 29.4%): Local Router Fallthrough to `REMOTE_FALLBACK` **[Executed]**

Out of 690 free-form prompts in `askRoutingCorpus.js`, **203 (29.4%)** miss Stage 2 regexes (`resolveAskOperation` in `askOperationRegistry.ts:1700-1966`) and do not clear Stage 3 `LOCAL_CLASSIFIER` confidence/margin thresholds (`classifyAskCandidates` in `askSemanticRouter.ts:340-416`), landing in `REMOTE_FALLBACK` (`GROUNDED_GUIDANCE`) **[Executed]**.

#### Sub-causes Verified by Execution and Code Tracing:
1. **Sparse Example & Wording Coverage in Specific Operation Families **[Executed]**:**  
   In `node apps/backend/scripts/ask-routing-sweep.js`, the worst-performing operations by fallback count are buyer-journey reads (`BUYER_CONTRACT_TIMELINE` 6/6 fb, `BUYER_TITLE_ESCROW_READINESS` 5/6 fb, `BUYER_DEADLINES` 5/6 fb, `BUYER_FINANCING_READINESS` 5/6 fb, `BUYER_DISCLOSURE_FUNDS_READINESS` 4/6 fb, `BUYER_PLAN_STATUS` 4/6 fb), `PROJECT_TRACKER_PROJECTS` (5/6 fb), `INSPECTION_FINDING_UPDATE` (4/6 fb), `INSPECTION_NEGOTIATION_PACKAGE` (4/6 fb), `NEIGHBORHOOD_CHANGE_FEED` (4/8 fb), `APPLIANCE_FAILURE_RISK` (4/8 fb), and `HOME_ACTIONS` (4/10 fb) **[Executed]**. As noted in `ASK_COZY_INLINE_WORKSPACE_FRD.md` Revision 1.527, each operation owns a median of only four positive examples **[Code-traced]**.
2. **Candidate Ranking vs. Confidence Thresholds (`didYouMean.ts`) **[Executed]**:**  
   Across the 203 `REMOTE_FALLBACK` prompts in the 690-prompt sweep **[Executed]**:
   - **94 / 203 (46.3%)** rank the expected (or equivalent) operation **#1** in `decision.candidates`.
   - **138 / 203 (68.0%)** rank the expected (or equivalent) operation within the **top 3**.
   - Revision 1.529 (`apps/backend/src/services/ask/support/didYouMean.ts:56-93`) recovers from `REMOTE_FALLBACK` when `GROUNDED_GUIDANCE` finds no supported claim by offering up to 3 candidates with calibrated confidence `>= 0.10` (`offerDidYouMean`) **[Code-traced]**. On the 203 fallback prompts, **194 / 203 (95.6%)** have at least one candidate `>= 0.10`, and **120 / 203 (59.1%)** include the right operation in those top-3 options **[Executed]**—leaving **83 / 203 (40.9%)** where even `"Did you mean one of these?"` does not surface the expected operation.
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
- **35 / 67 (52.2% of misroutes)** occur at Stage 2 (`DETERMINISTIC` regex rules in `askOperationRegistry.ts:1700-1966`) where an overly broad regex captures another operation's phrasing before Stage 3 ever runs **[Executed]**.
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

In the 690-prompt sweep, **49 prompts** stop at Stage `CLARIFICATION` (`"What would you like to focus on?"`). In **31 of 49 (`clarOk`)**, the expected operation is among the offered choices, requiring one extra click; in **18 of 49 (`clarBad`, 2.6% of corpus)**, the expected operation is not among the offered candidates (`decision.candidates.slice(0, 3)`), leaving the homeowner without a valid button to proceed **[Executed]**.

---

### Root Cause 4 (Rank 4 — 62 / 85 routable `READ` operations uncovered): Post-Execution Semantic Answer Relevance Refusals **[Executed count + Code-traced behavior]**

After an operation handler builds an answer, `createAskExecution.ts:563-595` runs `validateAskAnswerTrustPipeline` (`askAnswerTrustValidator.ts:364-450`), which calls `validateAskSemanticAnswerRelevance` (`askSemanticAnswerValidator.ts:48-322`) unless `skipSemanticAnswerRelevance` is set (which is only true for declared item actions / `launchContext.operationId` or `routedDeterministically && isAskHonestLimitationResult(result)`, Revision 1.526) **[Code-traced]**.

- **Exact Coverage Count **[Executed]**:** Out of **226** total operations in `ASK_OPERATION_DEFINITIONS`, **85** are message-routable `READ` operations (excluding safety boundaries and `GROUNDED_GUIDANCE`).
  - **23 of 85 (27.1%)** have an explicit canonical answer contract in `askSemanticAnswerValidator.ts:97-248` (`INVENTORY_LOOKUP`, `PROPERTY_SUMMARY`, `WORK_OVERVIEW`, `SAVED_RESULTS`, `MAINTENANCE_STATUS`, `COVERAGE_GAPS`, `SAVINGS_OPPORTUNITIES`, `OWNERSHIP_COSTS`, `HOME_ACTIONS`, `HOME_CHANGE_SUMMARY`, `HOME_STATUS_BOARD`, `SELLER_PREP_CHECKLIST`, `QUOTE_COMPARISON_REVIEW`, `CAPITAL_RESERVE_PLAN`, `REFINANCE_ANALYSIS`, `HOME_UPGRADE_SCENARIOS`, `ENVIRONMENT_REPORT`) or `support/canonicalAnswerBlocks.ts:8-17` (`REPLACEMENT_GUIDANCE`, `CAPABILITY_DISCOVERY`, `PLANT_CARE_OUTLOOK`, `MATERIAL_SPECS_LIST`, `HOME_TIMELINE_EVENTS`, `NEIGHBORHOOD_CHANGE_FEED`) **[Executed]**.
  - **62 of 85 (72.9%)** message-routable `READ` operations have **no** canonical block contract entry (including `MAINTENANCE_FORECAST`, `MAINTENANCE_BUDGET_FORECAST`, `APPLIANCE_FAILURE_RISK`, `WARRANTY_LOOKUP`, `DOCUMENT_LOOKUP`, `INCIDENT_CLAIM_STATUS`, `INSPECTION_FINDINGS`, `RECALL_REVIEW`, `DO_NOTHING_SIMULATION`, `HOA_COMPLIANCE_STATUS`, `SERVICE_PRICE_CHECKS`, `PROJECT_TRACKER_PROJECTS`, `DIY_PROJECTS`, `SELL_HOLD_RENT_ANALYSIS`, `PROPERTY_TAX_APPEAL_READINESS`, `BREAK_EVEN_ANALYSIS`, and the buyer readiness operations) **[Executed]**.
- **Consequence **[Code-traced]**:** For those 62 operations, `validateAskSemanticAnswerRelevance` compares the question's words against the rendered answer blocks (`questionAnswerScore`) and competing operations' `answerPositiveExamples`. As documented in `ASK_COZY_INLINE_WORKSPACE_FRD.md` Revisions 1.528, 1.535, and 1.538, valid handler answers whose phrasing differs from the user's question score `UNKNOWN` or `FAIL` and get replaced by a clarification or `ASK_UNVERIFIABLE_ANSWER_TEXT`. (How often the remaining 62 operations fail on live property data is **not measured** because the offline sweep does not run DB-backed handlers.)

---

### Root Cause 5 (Rank 5 — Handler-Level Entity & Token Filtering): Post-Routing Empty Matches **[Code-traced]**

Even when routing selects `INVENTORY_LOOKUP` or `REPLACEMENT_GUIDANCE`, handler-level token filtering can still produce a "not found" result on natural phrasings **[Code-traced]**:

1. **`INVENTORY_LOOKUP` (`apps/backend/src/services/ask/handlers/inventory.handler.ts:41-68, 279-310`) **[Code-traced]**:**
   - Revisions 1.524, 1.528, and 1.533 improved `inventory.handler.ts` by adding whole-word alias matching (`support/inventoryItemAliases.ts`), room grouping (`EACH_ROOM_PATTERN`), and stripping filler words (`many`, `there`, `are`, `how`, `each`, `every`, `everything`, `stuff`, `things`, `give`, `number`).
   - However, when `specificApplianceTokens` is empty (the user asks about an item not in the 17-entry `APPLIANCE_SYNONYMS` list—such as a ceiling fan, garage door opener, water softener, or Dehumidifier/Sump Pump variant not matched by the alias map—or asks a status-qualified question like *"What items in my garage are still under warranty?"*), `inventorySearchTokens(message)` (`lines 47-68`) retains any non-stopword token (`> 2` chars) and requires `tokens.some((token) => containsWholeWord(text, token))` (`line 301`) **[Code-traced]**. If none of the extracted words appear in `itemText(item)`, `matches` is empty and the handler returns `INVENTORY_MATCH_NOT_FOUND` (`0 matching items`).
2. **`REPLACEMENT_GUIDANCE` (`apps/backend/src/services/ask/handlers/miscHandlers.handler.ts:188-225`) **[Code-traced]**:**
   - `replacementGuidanceResult` checks 7 regexes (`hvac`, `refrigerator`, `water heater`, `roof`, `washer`, `dryer`, `dishwasher` at lines `195-203`).
   - For any other recorded inventory item (e.g., microwave, oven, range, garbage disposal, sump pump, dehumidifier—even though `KEEP_OR_REPLACE_ITEM` in `askOperationRegistry.ts:1540` routes those items to `REPLACEMENT_GUIDANCE`!), `category` is `null` (`line 203`). The handler then strips only `should|replace|repair|my|the|a|an|or|now|wait|vs|versus` (`line 204`) and checks `containsWholeWord(itemText(item), query)` (`line 213`).
   - **Concrete traced break **[Code-traced]**:** `"Is my microwave still good?"` routes deterministically to `REPLACEMENT_GUIDANCE` (added in Revision 1.521/1.534). Inside `replacementGuidanceResult`, `category` is `null` (microwave is not in the 7 regexes at lines `195-202`), and `query` becomes `"is microwave still good"`. `containsWholeWord(itemText(item), "is microwave still good")` returns `false` unless the item's recorded name literally contains the substring `"is microwave still good"`, so a recorded `"Kitchen Microwave"` fails to match and returns `NOT_IN_HOME_RECORD` (`"I don’t have that item recorded for your home yet"` / `"Tell me which item you mean"`)!

---

### Root Cause 6 (Rank 6 — Multi-Turn Continuity): Rigid Follow-Up Prefix Regex **[Code-traced]**

In `apps/backend/src/services/ask/askFollowUpContext.ts:55-97`, `FILTER_CONTINUATION_PATTERN` only matches follow-up messages starting with:
```ts
/^(?:only|just|now\s+show|now\s+only\s+show|instead\s+show|filter\s+to|show\s+only|and\s+only)\b/i
```
Follow-up turns phrased as questions—such as *"What about the overdue ones?"* or *"Which ones are in the kitchen?"*—do not match `FILTER_CONTINUATION_PATTERN` and are routed without prior turn filter continuation **[Code-traced]**. (Not measured by `askRoutingCorpus.js`, which is single-turn.)

---

## 3. Architectural Constraints & Design Boundaries (`ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md`)

A review of the governing architecture documents establishes four constraints that any enhancement plan must respect:

1. **Deterministic Routing Is Primary; Model Routing (`ASK_MODEL_ROUTER_ENABLED`) Requires `--model` Sweep Evidence Before Enabling **[Code-traced + Product Decision]**:**
   - Per `ASK_COZY_INLINE_WORKSPACE_FRD.md` Revision 1.527 (`line 25`), `askModelRouter.ts` (`ASK_MODEL_ROUTER_ENABLED=false` in `askOperationalControls.ts:65-66`) was built specifically to classify the ~29% fallback and ~7% clarification turns among up to 10 read-only local candidates, without seeing any home data.
   - It is **intentionally off by default** until `node apps/backend/scripts/ask-routing-sweep.js --model` is run with a valid `GEMINI_API_KEY` to measure accuracy, new misroutes, latency, and cost. It should **not** be flipped on blindly without that measurement run.
2. **Model Router Must Remain Strictly Read-Only (`operation.semantic.effect === 'READ'`) **[Code-traced]**:**
   - In `askModelRouter.ts:44-51` and Revision 1.527, `isAskModelRoutableOperation` restricts the model router to `READ` operations and excludes write, `GOVERNED_WORKFLOW`, monitor, and boundary operations. Revision 1.520 documented multiple write misroutes (`routingWriteIntentGuards.test.js`); allowing an LLM classifier to trigger write or workflow-initiation operations would create a new misroute vector and must **not** be done.
3. **`SEARCH_ASSISTANT` Context Scope (`aggregationContext/context.ts:26-46`) Is Deliberately Narrow **[Code-traced]**:**
   - As documented in the inline comment at `apps/backend/src/services/aggregationContext/context.ts:26-46` and `ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md` §9 (`lines 209-216`), `SEARCH_ASSISTANT` is scoped to `['CORE', 'LOCATION', 'STRUCTURE', 'EVENTS', 'PRODUCT_CONTEXT']` so that conversational capture of `STRUCTURE` and `EVENTS` facts is reachable on subsequent turns, while domain capabilities (`INVENTORY`, `MAINTENANCE`, `COVERAGE`, `RISK`, `FINANCIAL`, `PROJECTS`, `SYSTEMS`) are owned by deterministic domain handlers via operation-declared context providers.
   - Widening `SEARCH_ASSISTANT` to all 12 scopes is **rejected**: it would turn `GROUNDED_GUIDANCE` into a shadow LLM answer engine competing with deterministic domain services (violating Architecture Principles #2 and #9), send substantially more homeowner financial/coverage/inventory data to Gemini, and increase DB queries and token usage on every fallback turn.
4. **General Guidance When a Property Is Selected (`groundedAsk.service.ts:112`) Is a Product Decision, Not a Bug **[Product Decision]**:**
   - In `groundedAsk.service.ts:112`, `const generalGuidance = context ? null : await approvedGeneralGuidance(input.message);` suppresses generic catalog/Knowledge Hub answers when a property is selected (`context !== null`), returning `"Nothing in your home record answers this"` followed by Revision 1.529's `"Did you mean one of these?"` (`offerDidYouMean`).
   - This is an intentional honesty boundary so generic advice is not mistaken for property-backed truth. Whether to offer a clearly badged general-guidance fallback when *both* property claims and `offerDidYouMean` candidates are empty is an **open product decision** for the owner, not a defect.
5. **Inline Workspace Calm UX (`ASK_COZY_INLINE_WORKSPACE_FRD.md`) **[Product Decision]**:**
   - Ask Cozy already provides starter pills (`CalmLanding.tsx`, `ConciergeHome.tsx`), topic discovery (`ExploreWithCozy.tsx`, `askDiscoveryTopics.ts`), target selectors (`launch: 'SELECTOR'` with `AskTargetSelectorId` in `askCapabilityBindings.ts:115-120`), and post-turn recovery (`offerDidYouMean`). Adding a new composer autocomplete dropdown or "Mad-Libs" slot bar would duplicate existing discovery surfaces and add visual noise without fixing backend routing.

---

## 4. Evidence-Backed Enhancement Plan & Phased Roadmap

Every phase below is ordered by measured impact and risk, preserves all standing architectural boundaries, and is gated by `node apps/backend/scripts/ask-routing-sweep.js --check` (`npm run test:ask:routing`) and `npm run report:ask-routing-coverage`.

### Phase 1: Deterministic Handler Bug Fixes & Starter Parity (Zero LLM/Scope Risk)

1. **Fix `replacementGuidanceResult` Appliance Matching Bug (`apps/backend/src/services/ask/handlers/miscHandlers.handler.ts:188-221`):**
   - **Problem **[Code-traced]**:** `KEEP_OR_REPLACE_ITEM` (`askOperationRegistry.ts:1540`) routes questions about microwaves, ovens, stoves, cooktops, ranges, freezers, garbage disposals, sump pumps, dehumidifiers, furnaces, heat pumps, and AC units to `REPLACEMENT_GUIDANCE`, but `replacementGuidanceResult` (`miscHandlers.handler.ts:195-204`) only has regexes for 7 items (`hvac`, `refrigerator`, `water heater`, `roof`, `washer`, `dryer`, `dishwasher`) and otherwise matches the nearly unstripped full sentence `query` (`"is microwave still good"`) via `containsWholeWord`, which fails to match recorded items.
   - **Fix:** Reuse `matchedApplianceFilterTokens(message)` from `apps/backend/src/services/ask/support/inventoryItemAliases.ts` (already used by `inventory.handler.ts` in Revision 1.533) inside `replacementGuidanceResult` so every appliance recognized by the router resolves against recorded `inventoryItems` by whole-word alias, and strip conversational health-check words (`is`, `are`, `was`, `still`, `good`, `enough`, `doing`, `holding`, `up`, `looking`, `last`, `years`, `left`, `remaining`, `worth`, `repairing`, `fixing`, `replacing`, `keep`, `using`, `continue`, `need`, `new`, `one`, `soon`) from the fallback item query.
2. **Fix `CARD_ENTRY_BINDINGS` Free-Form Message Parity (`apps/backend/src/services/ask/askCapabilityBindings.ts:21, 30` & `askOperationRegistry.ts`):**
   - **Problem **[Executed]**:** Two `CARD_ENTRY_BINDINGS` messages fail when typed or re-sent without `launchContext.operationId`: `"Show this home’s records"` (`home-records`, expected `PROPERTY_SUMMARY`, currently `REMOTE_FALLBACK`) and `"Show my claims"` (`claims`, expected `INCIDENT_CLAIM_STATUS`, currently misrouted to `WORK_OVERVIEW`).
   - **Fix:** Add deterministic routing coverage in `askOperationRegistry.ts` for `"show (this )?home's records"` -> `PROPERTY_SUMMARY` and `"show my claims"` -> `INCIDENT_CLAIM_STATUS`, and add a boot-time or unit test asserting all 40 `CARD_ENTRY_BINDINGS` messages resolve to their declared `operationId`.
3. **Resilient Token Filtering in `INVENTORY_LOOKUP` (`apps/backend/src/services/ask/handlers/inventory.handler.ts:47-68, 297-304`):**
   - **Problem **[Code-traced]**:** When a user asks an inventory question with conversational predicates (e.g., *"Do I have a dehumidifier in the basement?"* or *"Which kitchen appliances are recorded?"*), any non-stopword modifier token remains in `tokens`.
   - **Fix:** Expand `INVENTORY_QUERY_STOP_WORDS` with common conversational modifiers (`working`, `still`, `broken`, `old`, `new`, `bought`, `purchased`, `recorded`, `listed`, `have`, `has`, `got`, `any`, `which`, `where`), and when filtering `items` at `inventory.handler.ts:300-303`, if a subset of query tokens matches at least one item's name/category/room/brand/model while other tokens match zero items across the property, filter by the matched entity/room tokens rather than returning `0` items.

**Phase 1 Test & Verification Plan:**
- Add unit tests in `apps/backend/tests/ask/itemHealthWording.test.js` and `apps/backend/tests/ask/cardEntryBindingsRouting.test.js` verifying `"Is my microwave still good?"` resolves a recorded Microwave in `replacementGuidanceResult` and all 40 `CARD_ENTRY_BINDINGS` messages route to their `operationId`.
- Run `node apps/backend/scripts/ask-routing-sweep.js --check` to verify `0` lost hits and `0` new misroutes.

---

### Phase 2: Reduce the 67 Misroutes & 203 Fallbacks in the Deterministic & Local Router

Target the exact top failure classes measured in `node apps/backend/scripts/ask-routing-sweep.js` (`67` misroutes + `203` fallbacks):

1. **Tighten the Top 6 Hijacking Operations (`35` `DETERMINISTIC:mis` + `32` `LOCAL_CLASSIFIER:mis` **[Executed]**):**
   - Inspect the `35` deterministic regex hijacks and `32` local classifier misroutes from `node apps/backend/scripts/ask-routing-sweep.js --misses`, starting with the top hijackers:
     - `QUOTE_COMPARISON_REVIEW` (`6` hijacks)
     - `CAPABILITY_DISCOVERY` (`6` hijacks)
     - `PROPERTY_SUMMARY` (`4` hijacks)
     - `MAINTENANCE_STATUS` (`4` hijacks)
     - `MAINTENANCE_BUDGET_FORECAST` (`4` hijacks)
     - `HOME_CHANGE_SUMMARY` (`4` hijacks)
   - Add targeted negative guards to the Stage 2 regexes causing the `35` `DETERMINISTIC:mis` failures and hard negatives (`negativeExamples`) for the `32` `LOCAL_CLASSIFIER:mis` failures.
2. **Address Top Fallback Families (`203` `REMOTE_FALLBACK` prompts **[Executed]**):**
   - Focus on the operations with `0/6` to `2/6` hit rates in the sweep (`BUYER_CONTRACT_TIMELINE`, `BUYER_TITLE_ESCROW_READINESS`, `BUYER_DEADLINES`, `BUYER_FINANCING_READINESS`, `BUYER_DISCLOSURE_FUNDS_READINESS`, `BUYER_PLAN_STATUS`, `PROJECT_TRACKER_PROJECTS`, `INSPECTION_FINDING_UPDATE`, `INSPECTION_NEGOTIATION_PACKAGE`, `HOME_TIMELINE_EVENTS`, `DOCUMENT_LOOKUP`, `COVERAGE_GAPS`).
   - Add deterministic wording patterns in `askOperationRegistry.ts` and independently reviewed positive examples in `askOperationSemanticPackages.ts` (respecting `ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md` §5 holdout corpus integrity rules—never copying sentences from `askTrustCertificationCorpus.ts`).
3. **Fix Morphological Stemming in `askSemanticEmbedding.ts` & `askSemanticRouter.ts` (Gated by Both Corpora):**
   - Test matching `SEMANTIC_SYNONYM_GROUPS` over stemmed tokens (or adding common inflected forms such as `'replacing'`, `'leaking'`, `'insuring'`, `'refinancing'` to `SEMANTIC_SYNONYM_GROUPS` in `askSemanticEmbedding.ts:13-63`) so `askSemanticConcepts('replacing my furnace')` matches `'replace'`.
   - **Constraint:** Because changing `askSemanticEmbedding.ts` shifts raw scores in `askRoutingCalibrationEvidence.ts` (see `ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md` §4), any change to `SEMANTIC_SYNONYM_GROUPS` or `stem()` must be run against both `npm run report:ask-routing-coverage` (`askRoutingCoverageReport.test.js`) and `node apps/backend/scripts/ask-routing-sweep.js --check` to verify `0` wrong routes on the 126-fixture certification corpus and `0` regressions on the 690-prompt ratchet.

**Phase 2 Test & Verification Plan:**
- Run `node apps/backend/scripts/ask-routing-sweep.js` before and after each batch; require hit rate to increase above `371 / 690 (53.8%)` and misroutes to decrease below `67 / 690 (9.7%)` with `0` lost hits (`--check`), then record improvements via `--write-baseline`.
- Run `node --test apps/backend/tests/ask/askRoutingCoverageReport.test.js` to verify certification guardrails hold.

---

### Phase 3: Expand Per-Operation Canonical Answer Block Contracts (`support/canonicalAnswerBlocks.ts`)

1. **Verify Handler Block Prefixes One Operation at a Time (`support/canonicalAnswerBlocks.ts`):**
   - **Problem **[Executed]**:** `62 of 85` message-routable `READ` operations lack an entry in `CANONICAL_ANSWER_BLOCK_ID_PREFIXES` (`apps/backend/src/services/ask/support/canonicalAnswerBlocks.ts:8-17`), leaving their valid typed answers subject to lexical overlap rejection in `validateAskSemanticAnswerRelevance`.
   - **Fix (Per-Operation, Without Weakening the Gate):** Do **not** weaken `validateAskSemanticAnswerRelevance` for generic `HIGH_CONFIDENCE` or `MODEL_CLASSIFIER` routes. Instead, inspect each handler's actual block ID prefixes (following Revision 1.528 and 1.538) and add verified distinct prefixes to `CANONICAL_ANSWER_BLOCK_ID_PREFIXES` for operations whose handlers emit unique block ID prefixes (e.g., `APPLIANCE_FAILURE_RISK`, `MAINTENANCE_BUDGET_FORECAST`, `MAINTENANCE_FORECAST`, `WARRANTY_LOOKUP`, `DOCUMENT_LOOKUP`, `INCIDENT_CLAIM_STATUS`, `INSPECTION_FINDINGS`, `RECALL_REVIEW`, `SELL_HOLD_RENT_ANALYSIS`, `PROPERTY_TAX_APPEAL_READINESS`, `BREAK_EVEN_ANALYSIS`, `DO_NOTHING_SIMULATION`, `HOA_COMPLIANCE_STATUS`, `SERVICE_PRICE_CHECKS`, `PROJECT_TRACKER_PROJECTS`, `DIY_PROJECTS`).
   - Where a handler currently uses generic block IDs (such as `'summary'` or `'list'`), first namespace that handler's block IDs (e.g., `'warranty-lookup-summary'`) so `matchesCanonicalAnswerBlocks` cannot false-pass a different operation's output.

**Phase 3 Test & Verification Plan:**
- Extend `apps/backend/tests/ask/canonicalAnswerContracts.test.js` for each added operation, verifying both positive pass (`CANONICAL_TYPED_ANSWER_CONTRACT_MATCH`) and cross-operation rejection against `ASK_ANSWER_RELEVANCE_CROSS_OPERATION_NEGATIVE_MATRIX`.

---

### Phase 4: Multi-Turn Follow-Up Wording & Model-Router Evaluation (Gated / Owner Decisions)

1. **Broaden Conversational Filter Follow-Ups (`apps/backend/src/services/ask/askFollowUpContext.ts:55-97`):**
   - Extend `FILTER_CONTINUATION_PATTERN` to recognize conversational filter continuations (`"what about the overdue ones"`, `"how about in the kitchen"`, `"which ones are urgent/high priority"`) when `priorContext` has an active list operation (`MAINTENANCE_STATUS`, `INVENTORY_LOOKUP`, `HOME_ACTIONS`, `WORK_OVERVIEW`) and the message contains a valid status/urgency/room filter token for that operation.
   - Add unit tests in `apps/backend/tests/ask/` verifying that unrelated new questions starting with `"what about..."` (e.g., `"what about my mortgage rate?"` after `MAINTENANCE_STATUS`) are **not** captured as filter continuations.
2. **Execute Offline Model-Router Evaluation Before Deciding on `ASK_MODEL_ROUTER_ENABLED` (`ASK_COZY_INLINE_WORKSPACE_FRD.md` Revision 1.527):**
   - Run `node apps/backend/scripts/ask-routing-sweep.js --model --misses` in an environment with network access and `GEMINI_API_KEY`.
   - Review the measured output (`local only` vs. `with model` hit rate, fallback reduction, any new misroutes, and latency/cost) before making an owner decision on enabling `ASK_MODEL_ROUTER_ENABLED=true`.
   - **Rollback / Safety Control:** `ASK_MODEL_ROUTER_KILL_SWITCH=true` (`askOperationalControls.ts:67`) immediately disables model routing at runtime without code changes.
3. **Owner Decisions Required Before Any Calibration or Fallback Policy Change:**
   - **`OD-4.1` / `OD-4.2` / `OD-4.3` (`ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md` §6):** Refreshing the 4 drifted calibration evidence rows and addressing the `0.30–0.50` READ isotonic plateau require paired hard-negative additions and a dedicated calibration design study.
   - **General Guidance When Property Is Selected (`groundedAsk.service.ts:112`):** Decide whether `REMOTE_FALLBACK` turns that yield neither a property claim nor any `offerDidYouMean` option (`~4.4%` of fallbacks, `9/203` **[Executed]**) should remain `"Nothing in your home record answers this"` or offer an explicitly badged general homeowner guidance card.

---

## 5. Summary of Roadmap, Metrics & Rollback Controls

| Phase | Scope | Primary Metric & Gate | Rollback / Safety Control |
| :--- | :--- | :--- | :--- |
| **Phase 1** | `miscHandlers.handler.ts` (`replacementGuidanceResult` alias matching), `CARD_ENTRY_BINDINGS` routing parity (`home-records`, `claims`), `inventory.handler.ts` modifier token resilience | Unit tests (`itemHealthWording.test.js`, `cardEntryBindingsRouting.test.js`) + `node scripts/ask-routing-sweep.js --check` (`>= 371/690` hits, `0` regressions) | Pure handler/regex changes; revert commit if any test regresses |
| **Phase 2** | Top 6 hijacker regex guards (`67` misroutes) + top fallback operation patterns/examples (`203` fallbacks) | `node scripts/ask-routing-sweep.js --check` (target: reduce misroutes below `67`, increase hits above `371/690`) + `askRoutingCoverageReport.test.js` (`0` wrong routes on 126 fixtures) | CI routing ratchet (`tests/ask/routingSweepRatchet.test.js`) blocks any lost hit or new misroute |
| **Phase 3** | Per-operation `CANONICAL_ANSWER_BLOCK_ID_PREFIXES` additions (`support/canonicalAnswerBlocks.ts`) for uncovered `READ` handlers | `tests/ask/canonicalAnswerContracts.test.js` + `ASK_ANSWER_RELEVANCE_CROSS_OPERATION_NEGATIVE_MATRIX` | Remove individual operation prefix entry in `canonicalAnswerBlocks.ts` |
| **Phase 4** | Multi-turn filter continuations (`askFollowUpContext.ts`) + live `--model` sweep measurement (`Revision 1.527`) | Follow-up unit tests + `node scripts/ask-routing-sweep.js --model --misses` report reviewed by owner | `ASK_MODEL_ROUTER_KILL_SWITCH=true` and `ASK_MODEL_ROUTER_ENABLED=false` |
