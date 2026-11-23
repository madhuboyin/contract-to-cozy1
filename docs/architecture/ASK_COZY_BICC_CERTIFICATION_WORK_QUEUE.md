# Ask Cozy BICC — Deterministic Coverage Certification Work Queue

**Date:** 2026-11-22
**Owner decision (2026-11-22):** restore deterministic coverage with independently reviewed prompts and fresh sealed shards, starting with the highest-volume deterministic operations. The fall from about 64% to about 21% at `558b506b` is a **reproduced certification-coverage regression**, not evidence that a model is needed. See [`ASK_COZY_BICC_PHASE0_BASELINE.md`](ASK_COZY_BICC_PHASE0_BASELINE.md).
**Roles (until people are named):** author = Ask Evaluation Author; independent reviewer = Ask Evaluation Reviewer; safety corpus reviewer = Home Safety/Policy Reviewer; final evidence owner = Ask Product Owner.

## 1. Rules for this work

1. **Do not broaden the provisional allowlist to improve the metric.** An operation joins `PROVISIONAL_READ_OPERATIONS` only when it passes authorization, value-integrity, routing and held-out certification requirements; `tests/ask/provisionalAllowlistGuard.test.js` fails on any addition without recorded evidence for all four.
2. **Tuning and calibration first.** Author tuning prompts, correct routing against them, and only then certify against a **fresh, never-exposed sealed shard**. A shard that was shown for diagnosis is burned (`BICC-EVAL-002`) and the manifest tooling enforces it.
3. **One operation pool at a time** (rules of one operation are certified together under leave-one-rule-out, FR-FAST-2). A passing pool certifies only itself.
4. **Write-capable operations are not certified for execution here.** Their fast-path rules may only open a validated preview; they follow the stricter write-family gate (`BICC-GATE-008`) and are listed below only for ordering.
5. Safety-class prompts also need the Home Safety/Policy Reviewer (`EVALUATION_ROLES`, enforced by `validateShardManifest`).

## 2. Per-operation procedure

1. Author tuning prompts for the pool (Ask Evaluation Author): positive phrasings, adjacent negatives for every operation in the pool's adjacency manifest, and cross-operation negatives. Record each prompt's template family so rephrasings are not counted twice.
2. Independent review (Ask Evaluation Reviewer): a different role confirms every label; safety-class prompts also go to the Home Safety/Policy Reviewer.
3. Correct routing until the pool passes on the tuning set (`node scripts/ask-fast-path-certify.js report`). The tuning set can find rules to fix; it can never certify one.
4. Author and review a **separate sealed shard** (`BICC-EVAL-002`/`-003` overlap checks apply). Reuse of a tuning prompt or template family disqualifies it.
5. Certify: `node scripts/ask-fast-path-certify.js certify --sealed=<file>` (add `--write` only for a pass). Every attempt is recorded in `tests/fixtures/askFastPathCertificationAttempts.json`; a rule version that failed on a sealed set may not be certified on it again (FR-FAST-8).
6. Only after certification, and only if the operation is a harmless read, record allowlist evidence (authorization, value integrity, routing, held-out certification) before adding it to the provisional allowlist.
7. Ask Product Owner signs the evidence record for the pool.

## 3. Priority order

Volume proxy: how often a rule fires on the 805-prompt **tuning** set (`ask-fast-path-certify.js report`, 111 of 125 rules fire; 18 never fire). This is a proxy only: there is no production usage analytics in the repository, so the order should be revisited if real volume data becomes available.

| # | Operation | Rules | Tuning fires | Class | On provisional allowlist |
|---|---|---|---|---|---|
| 1 | `DATA_POINT_READ` | 3 | 34 | read | yes |
| 2 | `REPLACEMENT_GUIDANCE` | 2 | 17 | write-capable (preview-only; stricter gate) | no |
| 3 | `INVENTORY_LOOKUP` | 4 | 13 | read | no |
| 4 | `SELL_HOLD_RENT_ANALYSIS` | 1 | 11 | read | no |
| 5 | `INSPECTION_FINDING_UPDATE` | 1 | 10 | write-capable (preview-only; stricter gate) | no |
| 6 | `DOCUMENT_LOOKUP` | 1 | 9 | read | no |
| 7 | `PROJECT_TRACKER_PROJECTS` | 1 | 9 | read | no |
| 8 | `MAINTENANCE_BUDGET_FORECAST` | 1 | 8 | read | no |
| 9 | `WARRANTY_LOOKUP` | 1 | 7 | read | yes |
| 10 | `HOME_ACTIONS` | 1 | 7 | write-capable (preview-only; stricter gate) | no |
| 11 | `BUYER_PLAN_STATUS` | 1 | 7 | read | no |
| 12 | `HOME_TIMELINE_EVENTS` | 1 | 6 | read | no |
| 13 | `QUOTE_COMPARISON_REVIEW` | 1 | 6 | read | yes |
| 14 | `QUOTE_COMPARISON_CREATE` | 1 | 6 | write-capable (preview-only; stricter gate) | no |
| 15 | `CAPITAL_ITEM_FUNDING_GOAL` | 1 | 6 | read | no |
| 16 | `BUYER_DISCLOSURE_FUNDS_READINESS` | 1 | 6 | read | no |
| 17 | `COVERAGE_GAPS` | 2 | 6 | read | no |
| 18 | `MAINTENANCE_TASK_UPDATE` | 1 | 5 | write-capable (preview-only; stricter gate) | no |
| 19 | `INCIDENT_CLAIM_STATUS` | 1 | 5 | read | yes |
| 20 | `OWNERSHIP_COSTS` | 1 | 5 | read | no |

Suggested first wave (reads only, highest volume): `DATA_POINT_READ`, `INVENTORY_LOOKUP`, `SELL_HOLD_RENT_ANALYSIS`, `DOCUMENT_LOOKUP`, `PROJECT_TRACKER_PROJECTS`, `MAINTENANCE_BUDGET_FORECAST`.

## 4. First wave status (2026-11-22)

Wave 1 (owner decision, FRD §18 D22): `DATA_POINT_READ`, `INVENTORY_LOOKUP`, `SELL_HOLD_RENT_ANALYSIS`.

**Done**

- **Tuning prompts authored:** `tests/fixtures/certification/wave1-tuning.json`, 301 rows: `DATA_POINT_READ` 42 positive, 30 adjacent, 30 cross; `INVENTORY_LOOKUP` 37 positive, 32 adjacent, 30 cross; `SELL_HOLD_RENT_ANALYSIS` 40 positive, 30 adjacent, 30 cross. Role `TUNING`, `humanConfirmed: false`, AI-assisted provenance recorded (an AI assistant drafted them for the implementing engineer acting as Ask Evaluation Author). They cannot certify; the certify runner refuses the file as a sealed set. Labels are the author's judgement of the homeowner's intent informed by the recorded product contracts, not what the router returned.
- **Routing corrected against the tuning set.** The first run found wrong claims by wave-1 rules. Three were genuine defects and are fixed with two narrow guards in `askOperationRegistry.ts`: manuals, receipts, invoices and coverage/insurance questions are no longer claimed by the inventory lookup (`DET_INVENTORY_LOOKUP_04`), and a disclosure question is no longer claimed by sell/hold/rent (`DET_SELL_HOLD_RENT_ANALYSIS_01`). Three were label problems, not router problems: two missing-field filters ("which appliances have no warranty", "which items are missing a model number") are by the recorded product contract (2026-11-13, asserted by `coverageComparisonStatus.test.js`) computed data-point reads, so they are `DATA_POINT_READ` positives (a first attempt to guard them away in the data-point rules broke that contract and was reverted); and two ambiguous prompts were replaced by clearer ones. Wrong claims by a wave-1 rule on the tuning set are now **0**. The routing ratchet and fast-path manifest tests pass; the remaining failures in the Ask suite are the same ones that fail before this change.
- **Behaviour and thresholds frozen:** `tests/fixtures/certification/wave1-frozen.json` records the rule versions and thresholds; `tests/ask/certificationWave1Tuning.test.js` fails if any of them changes, which ends the freeze and burns any shard that saw them.
- Reproduce: `node scripts/ask-certification-wave1-tuning.js --misses`.

**Findings to act on**

- **`DATA_POINT_READ` cannot be certified by the fast-path runner.** Its deterministic rules are not message-routable, so they are not in `FAST_PATH_RULES`. It is governed by the provisional-read and data-point reach path (`BICC-1A.2`: GATE-004A1 fixtures and the held-out GATE-001/003 subset), so for this pool the tuning prompts feed that work instead of a rule certificate.
- **`INVENTORY_LOOKUP` recall improved 2026-11-23 (12 → 21 of 37 tuning positives claimed, 0 wrong claims; the freeze was ended and re-recorded, no sealed shard existed).** New rules `DET_INVENTORY_LOOKUP_06..09` claim presence questions about a named household item ("Do I have a dehumidifier?"), "show all items / how many items", "the full record for my dishwasher" and "items that still need details" (the answer's incomplete-records filter was widened to read that wording); the room list accepts "primary" and "main" bedroom. What is still not claimed is deliberate: age, cost, condition, photo, installed-before and bought-this-year filters, "oldest item", "wear out soon", and electrical or plumbing categories. The inventory answer has no such filters (it knows HVAC, appliance and roof categories only), so claiming them would promise an answer it cannot give; they need handler features first. Earlier finding, now superseded: 13 of 40 positives are claimed by an inventory rule; most of the rest are list or filter questions that fall through to grounded guidance or to `DATA_POINT_READ` (which is an accepted equivalent). Certification measures wrong claims, not recall, so this does not block a certificate, but it caps the success rate the pool can recover.
- **A sealed run is large.** A pool needs at least 381 independent families for zero errors to bound the failure rate below 1%, with at most half positive and at least 30 adjacent and 30 cross negatives per rule. For the two pools the runner governs that is at least 762 human-authored, independently reviewed families.

**Blocked on people (not on engineering)**

1. A different human must be assigned as **Ask Evaluation Reviewer** before any shard is sealed.
2. The sealed shards must be **human-authored or human-reviewed with recorded provenance**; AI-drafted prompts cannot be the independent evidence.
3. Safety prompts remain uncertifiable until a distinct **Home Safety/Policy Reviewer** reviews them (none of the wave-1 pools is a safety class).
4. The **Ask Product Owner** signs only the final evidence record.

Until a pool is certified, its rules stay demoted. Success is measured with `node scripts/ask-bicc-cross-revision.js` against the same pool; a pool's contribution is reported only from sealed, uncontaminated results.
