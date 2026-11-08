# Ask Cozy: Natural Language & Free-Form Prompts Comprehensive Audit (Revision 3)

**Date:** 2026-11-08  
**Scope:** End-to-end audit of Ask Cozy prompt handling (`apps/frontend/src/components/ask/*` and `apps/backend/src/services/ask/*`)  
**Governing Documents Read:**
- [`docs/architecture/AUDIT_METHODOLOGY.md`](../architecture/AUDIT_METHODOLOGY.md) (Items 1–20 verification standard)
- [`docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md`](../product/ASK_COZY_INLINE_WORKSPACE_FRD.md) (specifically Revisions 1.520–1.538: the 2026-11-07 natural-language routing review and screenshot retests)
- [`docs/architecture/ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md`](../architecture/ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md) (Phase 4 126-fixture certification measurement & `OD-4.1`–`OD-4.3`)
- [`docs/architecture/ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md`](../architecture/ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md) (§5 Architecture Principles, §7 Router vs. Conversational Understanding, §9 `SEARCH_ASSISTANT` Context Scope)

---

## How Claims Are Labelled (`AUDIT_METHODOLOGY.md` §1)

- **[Executed]:** Code, scripts, or pure functions were run in this workspace (`node apps/backend/scripts/ask-routing-sweep.js` and reproducible `node -e` one-liners over `resolveAskRoutingCascade`, `ASK_ROUTING_CERTIFICATION_FIXTURES`, `ASK_DISCOVERY_BINDINGS`, `CARD_ENTRY_BINDINGS`, `normalizeAskMessage`, and `askSemanticConcepts`) and the output was observed. No database or network connection was used.
- **[Code-traced]:** Verified by reading the TypeScript source files and tracing branches, types, and callers, but not executed end-to-end because the path requires a live PostgreSQL database, property record state, or external Gemini network call.
- **[Inferred]:** Extrapolated from code structure or corpus distributions where production traffic telemetry is unavailable.
- **[Product Decision]:** A behavioral trade-off governed by product policy rather than a code defect (`AUDIT_METHODOLOGY.md` §5, §8).

---

## 1. Executive Summary & Baseline Measurements

### 1.1 Current Measured Routing Baseline **[Executed]**

Two offline corpora measure free-form natural-language routing in `apps/backend`:

1. **690-Prompt Natural-Language Sweep (`node apps/backend/scripts/ask-routing-sweep.js` over `apps/backend/tests/fixtures/askRoutingCorpus.js`, 108 operations):**
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
   In `apps/backend/src/services/ask/askCapabilityBindings.ts:105-265`, **55 of 60** discovery bindings use `launch: 'MESSAGE'`. Running all 55 `question` strings through `resolveAskRoutingCascade` without `launchContext` confirms that **55 / 55 (100%)** hit their target operation via Stage 2 `DETERMINISTIC` regexes **[Executed]**, because `askExplorerRegistry.ts:186-188` asserts at module load that every `MESSAGE` binding resolves deterministically **[Code-traced]**. Similarly, all 8 starter prompts in `CalmLanding.tsx:61-105` and `ConciergeHome.tsx:153-163` hit their target operation via Stage 2 `DETERMINISTIC` rules **[Executed]**.
2. **Direct Operation Context Binding (`launchContext.operationId`):**  
   When a user clicks a starter pill or capability card that supplies `launchContext.operationId` (`AskWorkspace.tsx:367-375`, `useAskRequest.ts:80-102`), `createAskExecution.ts:309-312, 411-428, 568-571` binds `declaredItemActionOperationId` at confidence `1.0` and sets `skipSemanticAnswerRelevance: true` **[Code-traced]**.  
   Running the **40** `CARD_ENTRY_BINDINGS` (`askCapabilityBindings.ts:18-103`) and **5** non-`MESSAGE` discovery bindings through `resolveAskRoutingCascade` *without* `launchContext.operationId` shows **[Executed]**:
   - **38 / 40 (95.0%)** of `CARD_ENTRY_BINDINGS` still match by message text, while **2 / 40 fail** without `launchContext.operationId`:
     - `home-records` (`"Show this home’s records"`, expected `PROPERTY_SUMMARY`) falls to `REMOTE_FALLBACK` (`GROUNDED_GUIDANCE`).
     - `claims` (`"Show my claims"`, expected `INCIDENT_CLAIM_STATUS`) misroutes to `WORK_OVERVIEW` via `LOCAL_CLASSIFIER`.
   - **3 / 5** non-`MESSAGE` discovery bindings (`understand-add-detail` -> `CLARIFICATION`, `maintain-diy-start` -> `DIY_PROJECTS` instead of `DIY_TEMPLATE_BROWSE`, `maintain-diy-continue` -> `DIY_PROJECTS` instead of `DIY_PROJECT_GUIDE`) require their declared `operationId` or `selectorId` (`AskTargetSelectorId`) to reach their target operation **[Executed]**.

When a homeowner types a free-form question in the composer (`AskWorkspace.tsx:391`), `promptContext` is `undefined` **[Code-traced]** and the phrasing is not restricted to the phrases encoded in `askOperationRegistry.ts`.

---

## 2. Ranked Root-Cause Analysis

Root causes below are ordered by the number of affected prompts in the 690-prompt sweep (`askRoutingCorpus.js`), followed by post-routing handler and validation gates.

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

### Root Cause 4 (Rank 4 — 62 / 85 non-fallback routable `READ` operations uncovered): Post-Execution Semantic Answer Relevance Refusals **[Executed count + Code-traced behavior]**

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
  Output: `{ routableReadWithFallback: 86, nonFallbackRead: 85, covered: 23, uncovered: 62 }` **[Executed]**.
  - Including `GROUNDED_GUIDANCE`, there are **86** message-routable `READ` operations (matching Revision 1.528's count of 86), or **85** non-fallback `READ` operations.
  - **23 of 85 (27.1%)** have an explicit canonical answer contract in `askSemanticAnswerValidator.ts:97-248` (17 operations) or `support/canonicalAnswerBlocks.ts:8-17` (6 operations: `REPLACEMENT_GUIDANCE`, `CAPABILITY_DISCOVERY`, `PLANT_CARE_OUTLOOK`, `MATERIAL_SPECS_LIST`, `HOME_TIMELINE_EVENTS`, `NEIGHBORHOOD_CHANGE_FEED`) **[Executed]**. (Three additional operations in `AUTHORED_GUIDE_RESULT_CODES`—`HOME_BASICS_GUIDE`, `SEASONAL_HOME_CARE`, `HIRING_GUIDE`—have `messageRoutable: false`.)
  - **62 of 85 (72.9%)** non-fallback message-routable `READ` operations do not have a canonical block contract entry **[Executed]**.
- **Consequence **[Code-traced]**:** For those 62 operations, `validateAskSemanticAnswerRelevance` compares the question's words against the rendered answer blocks (`questionAnswerScore`) and competing operations' `answerPositiveExamples`. As documented in `ASK_COZY_INLINE_WORKSPACE_FRD.md` Revisions 1.528, 1.535, and 1.538, valid handler answers whose vocabulary differs from the user's question can score `UNKNOWN` or `FAIL` and be replaced by a clarification or `ASK_UNVERIFIABLE_ANSWER_TEXT`. (How often the remaining 62 operations fail on live property data is **not measured** because the offline sweep does not run DB-backed handlers.)

---

### Root Cause 5 (Rank 5 — Handler-Level Entity & Token Filtering): Post-Routing Mismatches **[Code-traced]**

Even when routing selects `REPLACEMENT_GUIDANCE` or `INVENTORY_LOOKUP`, handler-level matching has specific code-traced gaps:

1. **`REPLACEMENT_GUIDANCE` (`apps/backend/src/services/ask/handlers/miscHandlers.handler.ts:188-221`) **[Code-traced]**:**
   - In `askOperationRegistry.ts:1354-1358, 1934-1935`, `REPLACEABLE_NON_HVAC_ITEM` (`line 1354`), `KEEP_OR_REPLACE_INTENT` (`line 1357`), and `itemKeepOrReplacePattern` (`lines 1358, 1934-1935`) route repair/replace and longevity questions about 17 non-HVAC item terms (`microwave`, `oven`, `stove`, `cooktop`, `refrigerator`, `fridge`, `freezer`, `dishwasher`, `washer`, `washing machine`, `dryer`, `water heater`, `garbage disposal`, `roof`, `garage door`, `sump pump`, `dehumidifier`) plus HVAC terms to `REPLACEMENT_GUIDANCE`.
   - Note that `apps/backend/tests/ask/itemHealthWording.test.js:1-49` tests **only `resolveAskRoutingCascade`** (confirming routing to `REPLACEMENT_GUIDANCE`), not `replacementGuidanceResult` (`miscHandlers.handler.ts`) **[Code-traced]**.
   - Inside `replacementGuidanceResult` (`miscHandlers.handler.ts:188-200`):
     ```ts
     const query = message.toLowerCase().replace(/\b(?:when|should|i|we|repair|replace|replacement|versus|vs|my|our|the|is|it|time|good|to|do)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
     const aliases = /\b(?:hvac|furnace|air conditioner|heat pump)\b/i.test(message) ? ['hvac', 'furnace', 'air conditioner', 'heat pump']
       : /\b(?:refrigerator|fridge)\b/i.test(message) ? ['refrigerator', 'fridge']
         : /\bwater heater\b/i.test(message) ? ['water heater']
           : /\b(?:roof|roofing)\b/i.test(message) ? ['roof']
             : /\b(?:washer|washing machine)\b/i.test(message) ? ['washer', 'washing machine']
               : /\bdryer\b/i.test(message) ? ['dryer']
                 : /\bdishwasher\b/i.test(message) ? ['dishwasher'] : query ? [query] : [];
     const itemText = (item: typeof allItems[number]) => [item.name, item.category, item.assetType, item.brand, item.model].filter(Boolean).join(' ').toLowerCase();
     const items = focusedInventoryItemId
       ? allItems.filter((item) => item.id === focusedInventoryItemId)
       : aliases.length ? allItems.filter((item) => aliases.some((alias) => containsWholeWord(itemText(item), alias) || containsWholeWord(alias, item.name))) : [];
     ```
   - Tracing both branches of line `199` (`containsWholeWord(itemText(item), alias) || containsWholeWord(alias, item.name)`) and lines `202-210` for any item outside the 7 inline regexes (`microwave`, `oven`, `stove`, `cooktop`, `freezer`, `garbage disposal`, `garage door`, `sump pump`, `dehumidifier`) where `aliases` falls back to `[query]` (e.g., for `"Is my microwave still good?"`, `query` is `"microwave still"`; for `"will the microwave be good for the next few years"`, `query` is `"will microwave be for next few years"`) **[Code-traced]**:
     - **Branch A (Single-word `item.name === "Microwave"`):** `containsWholeWord(alias, item.name)` (`containsWholeWord("microwave still", "Microwave")`) returns **`true`** because `"Microwave"` is a whole word inside `query`.
     - **Branch B (Multi-word `item.name`, e.g., `"Kitchen Microwave"`, `"Over-the-Range Microwave"`, or a model name `"GE Profile JES1145"` where `"microwave"` is in `item.category`/`item.assetType` rather than equal to `item.name`):** `containsWholeWord(itemText(item), "microwave still")` is **`false`** and `containsWholeWord("microwave still", "Kitchen Microwave")` is **`false`**, so the recorded item fails to match.
     - **Branch C (Item not recorded, `!items.length` at lines `202-210`):** `const namedNoun = aliases.length && aliases[0] !== query ? ... : null` evaluates to `null` whenever `aliases` fell back to `[query]`, so the handler returns the generic `'Tell me which item you mean'` instead of `'I don’t have a microwave recorded for your home yet'`.
2. **`INVENTORY_LOOKUP` (`apps/backend/src/services/ask/handlers/inventory.handler.ts:41-58, 272-304`) **[Code-traced]**:**
   - `inventory.handler.ts:272` calls `findSpecificInventoryAlias(message)` from `apps/backend/src/services/ask/support/inventoryItemAliases.ts:7-24` (which defines the 12-entry `INVENTORY_ITEM_ALIASES` table).
   - When `specific` is `undefined` (for example, a room-scoped query like *"What items are in my kitchen?"* or an item not in `INVENTORY_ITEM_ALIASES`) and `!genericList`, lines `296-303` score each item by counting how many tokens from `inventorySearchTokens(message)` appear as substrings (`inventoryItemSearchText(item).includes(token)`), keep items with `score > 0`, and return only items tied for `topScore` **[Code-traced]**.
   - Because line `299` uses `.includes(token)` (substring, rather than `containsWholeWord`) and `INVENTORY_QUERY_STOP_WORDS` (`lines 41-46`) omits conversational words (`still`, `working`, `old`, `new`, `under`, `in`, `inside`, `from`), a conversational word that happens to be a 3+ letter substring of one item's text/tags/model (e.g., `"in"` is 2 chars and filtered, `"from"` or `"old"` or `"under"` is 3–5 chars and retained) can give one item in a room `score: 2` (`topScore = 2`) and filter out the other items in that room that had `score: 1` **[Code-traced]**.

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

Every phase below is ordered by measured impact and risk, preserves standing architectural boundaries, and is gated by `node apps/backend/scripts/ask-routing-sweep.js --check` (`npm run test:ask:routing`) and `npm run report:ask-routing-coverage`.

### Phase 1: Deterministic Handler Fixes & Starter Parity (No LLM or Scope Change, Gated by the Ratchet)

1. **Unify `replacementGuidanceResult` with `findSpecificInventoryAlias` (`apps/backend/src/services/ask/handlers/miscHandlers.handler.ts:188-221`):**
   - **Problem **[Code-traced]**:** `REPLACEABLE_NON_HVAC_ITEM` (`askOperationRegistry.ts:1354`) and `itemKeepOrReplacePattern` (`askOperationRegistry.ts:1358, 1934-1935`) route 17 non-HVAC item terms to `REPLACEMENT_GUIDANCE`, whereas `replacementGuidanceResult` (`miscHandlers.handler.ts:189-195`) only has inline regexes for 7 item groups and falls back to `[query]` for `microwave`, `oven`, `stove`, `cooktop`, `freezer`, `garbage disposal`, `garage door`, `sump pump`, and `dehumidifier`—failing on multi-word recorded names (`"Kitchen Microwave"`) and leaving `namedNoun = null` when the item is unrecorded (`lines 202-210`).
   - **Fix:** Call `findSpecificInventoryAlias(message)` from `apps/backend/src/services/ask/support/inventoryItemAliases.ts:22-24` (and add `garage door` to `INVENTORY_ITEM_ALIASES` at `inventoryItemAliases.ts:7-20` so it matches `REPLACEABLE_NON_HVAC_ITEM`) inside `replacementGuidanceResult`. When `findSpecificInventoryAlias(message)` matches, use `specific.terms` as `aliases` and `specific.terms[0]` for `namedNoun` in the not-recorded message.
2. **Fix `CARD_ENTRY_BINDINGS` Free-Form Message Parity (`apps/backend/src/services/ask/askCapabilityBindings.ts:21, 30` & `askOperationRegistry.ts`):**
   - **Problem **[Executed]**:** Two `CARD_ENTRY_BINDINGS` messages fail when typed or re-sent without `launchContext.operationId`: `"Show this home’s records"` (`home-records`, expected `PROPERTY_SUMMARY`, currently `REMOTE_FALLBACK`) and `"Show my claims"` (`claims`, expected `INCIDENT_CLAIM_STATUS`, currently misrouted to `WORK_OVERVIEW`).
   - **Fix:** Add deterministic routing coverage in `askOperationRegistry.ts` for `"show (this )?home's records"` -> `PROPERTY_SUMMARY` and `"show my claims"` -> `INCIDENT_CLAIM_STATUS`, and add a unit test asserting all 40 `CARD_ENTRY_BINDINGS` messages resolve to their declared `operationId`.
3. **Whole-Word & Stop-Word Tightening in `INVENTORY_LOOKUP` (`apps/backend/src/services/ask/handlers/inventory.handler.ts:41-51, 296-303`):**
   - **Problem **[Code-traced]**:** At `inventory.handler.ts:299`, token scoring uses substring `.includes(token)` and `INVENTORY_QUERY_STOP_WORDS` omits prepositions/modifiers (`from`, `inside`, `still`, `working`, `under`, `recorded`), which can inflate `topScore` on one item when a modifier substring-matches and hide sibling items in a room query.
   - **Fix:** Add `from`, `inside`, `still`, `working`, `under`, `recorded` to `INVENTORY_QUERY_STOP_WORDS`, and use `containsWholeWord(inventoryItemSearchText(item), token)` at line `299`.
   - **Explicit Empty-Match Rule:** When `scored.length === 0` (no token in `tokens` matches any recorded item and `!genericList`), keep `matches = []` so the handler continues returning `INVENTORY_MATCH_NOT_FOUND` (`0 matching items`)—do **not** fall back to returning the full inventory when a user asks for an unrecorded item.

**Phase 1 Test & Verification Plan:**
- Extend `apps/backend/tests/ask/itemHealthWording.test.js` (or add a dedicated handler test) to test `replacementGuidanceResult` with multi-word recorded item names (`"Kitchen Microwave"`) and unrecorded items (`namedNoun` in `REPAIR_REPLACE_ITEM_NOT_IN_HOME_RECORD`).
- Add a unit test verifying all 40 `CARD_ENTRY_BINDINGS` messages route to their declared `operationId`, and a handler test for `inventory.handler.ts` verifying room + modifier queries and `0`-match `INVENTORY_MATCH_NOT_FOUND` preservation.
- Run `node apps/backend/scripts/ask-routing-sweep.js --check` to verify the baseline ratchet passes.

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
- Run `node apps/backend/scripts/ask-routing-sweep.js --check`, `node apps/backend/scripts/ask-routing-sweep.js --corpus=tests/fixtures/askRoutingHoldoutCorpus.js`, and `node --test apps/backend/tests/ask/askRoutingCoverageReport.test.js` before and after each batch; record verified improvements with `--write-baseline`.

---

### Phase 3: Expand Per-Operation Canonical Answer Block Contracts (`support/canonicalAnswerBlocks.ts`)

1. **Verify Handler Block Prefixes One Operation at a Time (`support/canonicalAnswerBlocks.ts`):**
   - **Problem **[Executed]**:** `62 of 85` non-fallback message-routable `READ` operations lack an entry in `CANONICAL_ANSWER_BLOCK_ID_PREFIXES` (`apps/backend/src/services/ask/support/canonicalAnswerBlocks.ts:8-17`), leaving their valid typed answers subject to lexical overlap rejection in `validateAskSemanticAnswerRelevance`.
   - **Fix (Per-Operation, Preserving the Gate):** Do **not** weaken `validateAskSemanticAnswerRelevance` for generic `HIGH_CONFIDENCE` or `MODEL_CLASSIFIER` routes. Instead, inspect each handler's actual block ID prefixes (following Revision 1.528 and 1.538) and add verified distinct prefixes to `CANONICAL_ANSWER_BLOCK_ID_PREFIXES` for operations whose handlers emit unique block ID prefixes (e.g., `APPLIANCE_FAILURE_RISK`, `MAINTENANCE_BUDGET_FORECAST`, `MAINTENANCE_FORECAST`, `WARRANTY_LOOKUP`, `DOCUMENT_LOOKUP`, `INCIDENT_CLAIM_STATUS`, `INSPECTION_FINDINGS`, `RECALL_REVIEW`, `SELL_HOLD_RENT_ANALYSIS`, `PROPERTY_TAX_APPEAL_READINESS`, `BREAK_EVEN_ANALYSIS`, `DO_NOTHING_SIMULATION`, `HOA_COMPLIANCE_STATUS`, `SERVICE_PRICE_CHECKS`, `PROJECT_TRACKER_PROJECTS`, `DIY_PROJECTS`).
   - Where a handler currently uses generic block IDs (such as `'summary'` or `'list'`), first namespace that handler's block IDs (e.g., `'warranty-lookup-summary'`) so `matchesCanonicalAnswerBlocks` does not match a different operation's output.

**Phase 3 Test & Verification Plan:**
- Extend `apps/backend/tests/ask/canonicalAnswerContracts.test.js` for each added operation, verifying both positive pass (`CANONICAL_TYPED_ANSWER_CONTRACT_MATCH`) and cross-operation rejection against `ASK_ANSWER_RELEVANCE_CROSS_OPERATION_NEGATIVE_MATRIX`.

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

---

## 5. Summary of Roadmap, Metrics & Rollback Controls

| Phase | Scope | Primary Metric & Gate | Rollback / Safety Control |
| :--- | :--- | :--- | :--- |
| **Phase 1** | `miscHandlers.handler.ts` (`findSpecificInventoryAlias` in `replacementGuidanceResult`), `CARD_ENTRY_BINDINGS` routing parity (`home-records`, `claims`), `inventory.handler.ts` whole-word token scoring (preserving `0`-match `INVENTORY_MATCH_NOT_FOUND`) | Extend `itemHealthWording.test.js`, new `cardEntryBindingsRouting.test.js` & inventory handler tests + `node scripts/ask-routing-sweep.js --check` | Gated by the routing ratchet; revert commit if any test regresses |
| **Phase 2** | Top 6 hijacker regex guards (`67` misroutes) + top fallback operation patterns/examples (`203` fallbacks, capped at 2–3 examples/op) | `node scripts/ask-routing-sweep.js --check`, held-out corpus (`askRoutingHoldoutCorpus.js`), and `askRoutingCoverageReport.test.js` | CI routing ratchet (`tests/ask/routingSweepRatchet.test.js`) blocks any lost hit or new misroute |
| **Phase 3** | Per-operation `CANONICAL_ANSWER_BLOCK_ID_PREFIXES` additions (`support/canonicalAnswerBlocks.ts`) for uncovered `READ` handlers | `tests/ask/canonicalAnswerContracts.test.js` + `ASK_ANSWER_RELEVANCE_CROSS_OPERATION_NEGATIVE_MATRIX` | Remove individual operation prefix entry in `canonicalAnswerBlocks.ts` |
| **Phase 4** | Multi-turn filter continuations (`askFollowUpContext.ts`) + live `--model` sweep measurement (`Revision 1.527`) | Multi-turn follow-up unit tests + `node scripts/ask-routing-sweep.js --model --misses` report reviewed by owner | `ASK_MODEL_ROUTER_KILL_SWITCH=true` (`askOperationalControls.ts:66`) and `ASK_MODEL_ROUTER_ENABLED=false` (`line 65`) |
