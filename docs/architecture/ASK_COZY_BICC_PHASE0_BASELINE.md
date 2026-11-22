# Ask Cozy BICC — Phase 0 Cross-Revision Routing Baseline

**Date:** 2026-11-22
**Slice:** `BICC-0.1` (evaluation contract, held-out pools, cross-revision baseline)
**Governing requirements:** `BICC-EVAL-013`, `BICC-EVAL-018`, `BICC-EVAL-006`; FRD §16 Phase 0
**Plan:** [`ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_IMPLEMENTATION_PLAN.md`](ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_IMPLEMENTATION_PLAN.md)

**Evidence labels.** **[Executed]** the command was run in this session and its output is quoted. **[Code-traced]** read from source, not run. Nothing here ran against a real database, browser, provider or production service.

## 1. What this measures, and what it does not

This is a **routing-outcome proxy** for the `BICC-EVAL-018` all-prompt success definition: a prompt counts as a success only when the cascade routes it to a correct operation or asks a clarification whose options include one. It is **not answer correctness** (`BICC-EVAL-006`): it does not check entity, value, filters or delivery. Unsupported fallback, a wrong operation and a clarification with no correct option all count as failures.

Limits that apply to every figure:

- The pool is the Phase 0a corpora (`tests/fixtures/askRoutingCorpus.js`, `askRoutingHoldoutCorpus.js`, `askRoutingHoldoutCorpus2.js`). They are team-written and were exposed in the Phase 0a baseline, so under `BICC-EVAL-002` they are **tuning evidence, not certification evidence**. There is no sealed certification pool yet; the report therefore refuses a certification headline (`NO_HELD_OUT_RESULTS`).
- Each revision is scored on **the same prompts with the same scorer**. Only prompts whose operation exists at every compared revision are compared (741 of 764); the others are excluded, not counted as failures.
- Intervals are exact Clopper–Pearson at the row level. Rows of one operation are not independent, so the intervals are descriptive.
- The routing options are the production defaults used by the Phase 0a script (`localRoutingEnabled`, classifier and embedding retrieval on). No model is called.

## 2. Reproduction [Executed]

```bash
cd apps/backend
node scripts/ask-bicc-cross-revision.js --revisions=HEAD,2e997a48,a282ade6,bb7ad240,a4030e71,3bca573b --json=out.json
node scripts/ask-understanding-baseline.js        # the unchanged Phase 0a script, for comparison
```

## 3. Cross-revision result [Executed]

| Revision | Date | Comparable prompts | Success (exact 95%) | Main | Held-out 1 | Held-out 2 | Δ vs HEAD |
|---|---|---|---|---|---|---|---|
| `f33a7cc8` (HEAD) | 2026-11-22 | 741 | 30.5% (27.2–34.0%) | 31.1% | 22.2% | 25.0% | — |
| `2e997a48` | 2026-11-17 | 741 | 28.7% (25.5–32.2%) | 29.2% | 22.2% | 25.0% | −1.8 pp |
| `a282ade6` | 2026-11-12 | 741 | 63.4% (59.8–66.9%) | 63.9% | 72.2% | 37.5% | +32.9 pp |
| `bb7ad240` | 2026-11-08 | 741 | 63.4% (59.8–66.9%) | 63.9% | 72.2% | 37.5% | +32.9 pp |
| `a4030e71` | 2026-11-03 | 741 | 44.1% (40.5–47.8%) | 46.5% | 16.7% | 16.7% | +13.6 pp |
| `3bca573b` | 2026-10-27 | 741 | 44.1% (40.5–47.8%) | 46.5% | 16.7% | 16.7% | +13.6 pp |

(Δ is that revision's success minus HEAD's, so a positive value means the older revision scored higher.) Movement between neighbouring revisions: `a282ade6` → `2e997a48` lost **274** prompts and gained 17; `2e997a48` → HEAD lost 1 and gained 14.

The 2026-11-12 figure is consistent with the recorded Phase 0a result (60.0% hits, 425 of 708, plus right-option clarifications counted as success here). The unchanged Phase 0a script at HEAD reports **16.1% hits** (113 of 704), against 60.0% (425 of 708) recorded on 2026-11-11. [Executed]

## 4. Where the fall happened [Executed bisect]

A bisect over the 170 commits between `a282ade6` and `2e997a48`, scoring each on the overall success rate over the pool's eligible prompts, found:

| | Revision | Success |
|---|---|---|
| Last good | `a0170406` "feat(ask): wire governed understanding planner" | 64.0% |
| **First bad** | **`558b506b` "fix(ask): enforce fast-path certification"** (2026-11-13) | **21.3%** |

This reproduces the demoted-fast-path hypothesis recorded in the plan.

## 5. Why [Code-traced + Executed]

- `558b506b` makes `resolveAskRoutingCascade` execute a deterministic rule only when `isFastPathCertified(rule.id)`; an uncertified rule is demoted, and the turn falls through to a clarification or `REMOTE_FALLBACK` (the `GROUNDED_GUIDANCE` operation). Demotion also blocks the local classifier from executing the same turn (FR-FAST-3/7).
- At HEAD **all 125 fast-path rules are `DEMOTED` and none is `CERTIFIED`** [Executed: `FAST_PATH_RULES` status counts]. Only the 14 provisional read operations may still start a harmless read. The stage breakdown at HEAD has no `DETERMINISTIC` claims at all: provisional 46, local classifier 86, clarification 133, remote fallback 439 of 704 [Executed].
- Certification requires a **human-confirmed sealed set** (`scripts/ask-fast-path-certify.js certify --sealed=…`, FR-FAST-2/8). `certificates.generated.ts` was last written when the runner was added (`21ecac82`, 2026-11-21) and holds no certificate.
- The ratchet test did not catch the fall: `tests/ask/routingSweepRatchet.test.js` passes 5 of 5 at HEAD [Executed], because `558b506b` regenerated `tests/fixtures/askRoutingSweepBaseline.json` **downward in the same commit**. The recorded known-good phrasings went from **426** (at `558b506b^`) to **67** (at `558b506b`); at HEAD they are 113 [Executed via `git show`].

## 6. Hypotheses that were not reproduced

- "Eight routing-ratchet failures": **not reproduced**. The routing ratchet passes at HEAD (5/5). Any earlier count came from a different test or a different revision and is not carried into this evidence record.

## 7. Consequence for the plan

The fall is a coverage consequence of a deliberate certification rule, not a model gap and not a defect in the routing code at HEAD. Under the "Ask LLM = last resort" rule the corrective path is **certifying the deterministic rules** (or an owner decision on an interim policy), which needs human-confirmed sealed prompts. That is exactly the sealed held-out pool that slice `BICC-0.1` defines (`BICC-EVAL-002`), so the two efforts share one dependency. See the consolidated owner decisions in the slice completion record.
