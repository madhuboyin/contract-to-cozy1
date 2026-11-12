# Ask Cozy — Understanding Reliability: Phase 0c Baseline

**Date:** 2026-11-11
**Status:** Phase 0c — data-point reachability baseline, the complete sampling manifest and the full §4.4 baseline. Measurement only; **no behaviour changed.**
**Governing document:** `docs/product/ASK_COZY_UNDERSTANDING_RELIABILITY_FRD.md` (§4.4, §10.1, FR-DATA-7, FR-EVAL-9).
**Reproduce:** `cd apps/backend && node scripts/ask-data-reachability.js` (TypeScript call graph, ~20 s, needs `NODE_OPTIONS=--max-old-space-size=10240`); `node scripts/ask-sampling-manifest.js [--write]`; plus the Phase 0a scripts.
**Evidence labels:** **[Executed]** a script above; **[Inferred]** arithmetic over the FRD's proposed allocations.

## 1. Data-point reachability [Executed, static]

Reachability is **entity level and a range**, because field-level reach is not derivable statically. **Lower bound:** entities read directly by code under `src/services/ask`. **Upper bound:** entities read by any function reachable from an operation's propose-time handler (over-approximates through shared helpers). Percentages weight each entity by its candidate data points (3,950 in 363 candidate entities).

| Domain (owner order, D13) | Entities | Direct | Reachable | Data points | Direct % | Reachable % |
|---|---|---|---|---|---|---|
| appliances-inventory | 26 | 9 | 12 | 282 | 48% | 60% |
| maintenance | 12 | 3 | 7 | 141 | 39% | 69% |
| warranty-insurance-claims | 35 | 9 | 12 | 339 | 43% | 52% |
| reserve-ownership-costs | 48 | 10 | 30 | 506 | 23% | 70% |
| documents-records | 8 | 4 | 6 | 94 | 74% | 93% |
| buyer | 34 | 1 | 14 | 437 | 10% | 47% |
| seller-prep | 5 | 2 | 3 | 52 | 56% | 69% |
| decisions-projects | 64 | 13 | 26 | 708 | 39% | 57% |
| intelligence-derived | 42 | 9 | 14 | 471 | 31% | 43% |
| neighbourhood-risk-radar | 30 | 2 | 11 | 270 | 20% | 57% |
| property-profile | 15 | 2 | 7 | 222 | 38% | 69% |
| home-events-timeline | 18 | 3 | 7 | 165 | 34% | 56% |
| household-account | 15 | 4 | 8 | 131 | 44% | 65% |
| everything-else | 11 | 1 | 2 | 132 | 6% | 31% |
| **Total** | **363** | **72** | **159** | **3,950** | **32%** | **57%** |

**Reading it honestly:** by data-point weight, **between 32% and 57% of candidate data points sit in an entity Ask reads today**, and an entity read does not mean every field of it is answerable or that a question about it routes anywhere. The §2.2b proxy (40% of property-scoped entities directly referenced) is consistent with the lower bound. The target is 100% of approved owner-visible data (D4), so the honor rate cannot exceed this range (FRD §4.4).

## 2. The complete sampling manifest [Executed + Inferred]

`apps/backend/tests/fixtures/askSamplingManifest.json` declares every evaluation unit and its proposed rows (§10.1, **provisional per D4**), derived from the live registry (120 message-routable, non-boundary, non-fallback operations) and the catalogue (173 coarse groups, 14 domains).

| Unit | Units | Rows per unit (tuning/calibration/sealed) | Sealed rows, human-confirmed |
|---|---|---|---|
| operation | 120 | 30/20/30 | 3,600 |
| data-point group (coarse) | 173 | 10/10/10 | 1,730 |
| query shape × domain | 126 | 10/10/10 | 1,260 |
| facet-count strata 1, 2, 3, 4–6 | 4 | 50/30/200 | 800 |
| facet-count stratum > 6 (measurement only) | 1 | 20/10/40 | 40 |
| stage-one domain selection (pooled) | 1 | 100/60/762 | 762 |
| safety invariants (wrong-write, near-miss, adversarial routing, reader closure) | 4 | 0/0/381 | 1,524 |
| independent human set | 1 | 0/0/1,000 | 1,000 |
| **Total** | | **tuning 6,910 / calibration 5,580 / sealed 10,716** | **10,716** |

**Sizing finding.** Even with coarse grouping the proposed allocations need **~10,700 human-confirmed sealed rows**; the per-operation floor alone is 3,600. **Today: 111 of 120 operations have any routing-corpus prompt, none has the 80 proposed rows, the median is 6, and no sealed or human-confirmed set exists.** Reducing the per-operation sealed floor, confirming by stage (the first three domains), and counting write-capable operations first are the levers (decision list).

## 3. The full §4.4 baseline

"Not measurable" means the evaluation set that defines the metric does not exist yet; building it is Phase 1 and later work. Nothing below is a gate result.

| §4.4 metric | Baseline today | Source |
|---|---|---|
| Sealed-proxy honor rate (primary; macro-by-domain, scenario-weighted, end to end) | **Not measurable** — no sealed set, no data-point reads | — |
| Populated-data direct-answer rate; missing-data recovery rate | **Not measurable** | — |
| Model-available honor; routing-call-failure rates | **Not measurable** — no model path | — |
| Prompt-level honor by facet count; plan correctness | Qualitative only: a 1-facet prompt works; 2- and 4-facet prompts honored one facet (5 executed prompts, FRD §2.2c) | executed, tiny |
| Data-point reachability | **32% (direct) to 57% (reachable)** of candidate data points by entity | §1 |
| Operation-level resolved rate | Proxy: routing hit **60.0%** (main corpus, 56.4–63.6%); held-out 72.2% and 37.5% | Phase 0a |
| Direct-answer rate; false-decline rate; wrong-answer rate | **Not measurable** (needs data-backed runs) | — |
| Incorrect high-confidence selection (proxy: confident wrong claims) | Deterministic stage **5.3%** wrong when claiming (20 of 380); local classifier **29.3%** (27 of 92) | Phase 0a |
| Wrong-write routing | 0 read-intent prompts claimed by a write operation on the corpus; **49** edited prompts landed on a write-capable operation (command-based definition) | Phase 0a |
| Perturbation retention | **82.6%** overall; 37.6% under one transposed letter; 83.3% under "can you tell me" | Phase 0a |
| False-correction rate | **Not measurable** (no normaliser, no negative corpus) | — |
| Gate false-withhold | **Not measurable**; three known withheld correct answers in the session | — |
| Dead-end rate | Proxy: fallback **26.6%** of the main corpus (188 of 708) | Phase 0a |
| Per-operation floor | **0 of 120** operations meet the proposed 30 sealed rows; median corpus prompts per operation 6 | §2 |
| Time to useful result | **Not measurable** (no timed runs) | — |
| Out-of-domain share | **Not measurable** | — |
| Answer-gate contracts | 21 canonical prefix, 17 typed branch, **86 neither** of 124 routable | Phase 0a |
| Write-capable operations | **32** carry a domain command (30 labelled `WRITE`; 6 mislabels) | Phase 0a, trace |

## 4. What Phase 0 tells the next phases

1. The **model-free** levers have the clearest measured headroom: deterministic claim precision (94.7%), input fragility (82.6%), and the answer-gate contract gap (86 operations). **Phase 1 targets exactly these.**
2. **Coverage is the larger ceiling**: at most 57% of candidate data points are even read today. Phase 1b adds reads domain by domain, starting with appliances and inventory.
3. The **evaluation corpus does not exist**: the sealed, human-confirmed sets are 0 of ~10,700 rows. Phase 1 builds the generation and review tooling; human confirmation is the long pole.
