# Ask Cozy — Understanding Reliability: Phase 0a Baseline

**Date:** 2026-11-11
**Status:** Phase 0a operation, routing and existing-system baseline. Measurement only; **no behaviour changed.**
**Governing document:** `docs/product/ASK_COZY_UNDERSTANDING_RELIABILITY_FRD.md` (§12 Phase 0a, FR-FAST-6, FR-EVAL-3, FR-WRT-1/4, FR-CTX).
**Reproduce:** `cd apps/backend && node scripts/ask-understanding-baseline.js [--json=out.json]` (offline, no database, no network, about 20 seconds).
**Evidence labels:** **[Executed]** the script above; **[Code-traced]** read from source.

**Limits that apply to every figure.** The corpora are written by the team and extended with each fix, so the main figure is optimistic; the held-out sets are tiny; intervals are Wilson bounds on **row-level** counts and rows are not independent, so they are descriptive only (FRD gates use source-family inference, FR-EVAL-14). There is no per-**rule** figure: the deterministic resolver has no rule identifiers, so FR-FAST-6's per-rule baseline needs the FR-FAST-1 instrumentation of Phase 1. Per-**operation** claims are given instead.

## 1. Routing, by corpus and by stage [Executed]

| Corpus | Prompts | Correct (Wilson 95%) | Clarification (right option / wrong) | Fallback | Misroute |
|---|---|---|---|---|---|
| Main (`askRoutingCorpus.js`) | 708 | 425 (60.0%, 56.4–63.6%) | 30 / 18 | 188 | 47 |
| Held-out 1 | 36 | 26 (72.2%, 56.0–84.2%) | 0 / 1 | 6 | 3 |
| Held-out 2 | 24 | 9 (37.5%, 21.2–57.3%) | 0 / 2 | 12 | 1 |

**What each stage claims before any model could act (FR-FAST-6), main corpus:**

| Stage | Prompts claimed | Precision when it claims (Wilson 95%) |
|---|---|---|
| Deterministic (regex rules) | 380 of 708 (53.7%) | 94.7% (92.0–96.6%) — 20 confident wrong claims |
| Local classifier | 92 | 70.7% (60.7–79.0%) |

**Wrong deterministic claims by operation (the rule that fired is not identifiable):** `MAINTENANCE_STATUS` 3, `CAPABILITY_DISCOVERY` 2, `DOCUMENT_LOOKUP` 2, `QUOTE_COMPARISON_REVIEW` 2, `INSPECTION_REPORTS` 2, `HOME_CHANGE_SUMMARY` 2, `MAINTENANCE_FORECAST` 1, `REPLACEMENT_GUIDANCE` 1, `BUYER_INSURANCE_READINESS` 1, `COVERAGE_GAPS` 1, `PROPERTY_SUMMARY` 1, `NOTIFICATION_SETTINGS_OVERVIEW` 1, `INSPECTION_FINDING_UPDATE` 1.

## 2. Sensitivity to meaning-preserving edits [Executed]

Starting from the 425 prompts of the main corpus that route correctly:

| Edit | Still correct | Retention |
|---|---|---|
| prefix "hey cozy, " | 393/425 | 92.5% |
| suffix " please" | 410/425 | 96.5% |
| prefix "can you tell me " | 354/425 | 83.3% |
| trailing "?" | 409/425 | 96.2% |
| "my" -> "the" | 178/196 | 90.8% |
| one transposed-letter typo | 149/396 | 37.6% |
| **All edits** | **1893/2292** | **82.6%** |

**Edited prompts that landed on a write-capable operation** (one with a domain command): 49 — {"prefix \"can you tell me \"": 35, "prefix \"hey cozy, \"": 4, "one transposed-letter typo": 10}. This **corrects** the FRD §2.3 figure of 17, which counted operations labelled `WRITE`; by the command-based definition (FR-WRT-4) it is 49, and 35 of them are the `can you tell me` prefix routed to the `HOME_DEADLINE_MONITOR` command. The trace (`ASK_COZY_WRITE_SAFETY_TRACE.md`) shows that operation's propose handler reaches no write, so those misroutes produce at most a confirmation card.

## 3. Answer-gate contracts [Executed]

124 routable operations: **21** have a canonical block-prefix contract, **17** a typed validator branch, **86** neither (by effect: {"WRITE": 30, "READ": 51, "MONITOR": 2, "BOUNDARY": 3}). The typed-branch count is a regex over the validator source and undercounts branches written through a helper.

## 4. Write-capable operations [Executed + Code-traced]

32 of 124 routable operations carry a domain command; 30 are labelled `WRITE`. Carry a command but not labelled `WRITE`: `HOME_DEADLINE_MONITOR (MONITOR)`, `HVAC_DECISION_SCENARIO (READ)`, `HVAC_DECISION_START (READ)`, `REFINANCE_RATE_MONITOR (MONITOR)`. Labelled `WRITE` with no command: `INCIDENT_CONTINUATION`, `MAJOR_EVENT_ENTRY`. The write-safety trace covers the consequences.

## 5. FR-CTX baseline [Code-traced]

`createAskExecution` already runs the **pure, deterministic safety-first cascade on the complete raw message before any property access** (`resolveAskRoutingCascade(input.message, { localRoutingEnabled: false, embeddingRetrievalEnabled: false })`), and `propertyScopeForAskRouting` returns **no property** for a `SAFETY` decision, so a boundary result never reads property data. Property access (`ensurePropertyAccess`) and eligible-operation discovery follow. **So FR-CTX-1 stage A before stage B is how the system already behaves for the safety gate.** Not yet present: the identifier-protection pass, normalisation, the eligible-catalogue hash and the FR-CTX-2 pre-effect recheck as a named step.

## 6. Provider terms (D3a)

Nothing external has been called. Per D3a, the existing Gemini integration may be used in Phase 2 only after its retention, training-use, regional-processing and account-configuration terms are recorded and approved for synthetic evaluation inputs. **That record is the owner's to make; it blocks any external Phase 2 call, not Phases 0 to 1c.**

## 7. What this baseline means for the next phases

1. The two largest measurable failures are **uncertified deterministic claims** (94.7% precision, 20 confident wrong claims) and **input fragility** (82.6% retention; 37.6% under one transposed letter). Both are addressed in Phase 1 (FR-FAST, FR-NRM) **without any model**.
2. The `effect` label cannot define write safety; fix the six mislabels and add the consistency check in Phase 1 (FR-WRT-4).
3. There is no per-rule baseline until rules have identifiers (FR-FAST-1).
