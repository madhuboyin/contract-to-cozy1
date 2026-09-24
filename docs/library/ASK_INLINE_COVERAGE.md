# Ask Cozy Inline Workspace requirement coverage

[Library home](README.md) · [Authority](AUTHORITY.md) · Governing source: [Inline Workspace FRD](../product/ASK_COZY_INLINE_WORKSPACE_FRD.md)

Reviewed against Inline Workspace FRD v1.63 and repository commit `42b9098f` on 2026-09-24. This report separates focused executable evidence from the FRD's implementation narrative.

## Coverage by requirement family

| Family | Requirements | Reviewed status | Evidence and remaining boundary |
|---|---:|---|---|
| Product principles | 11 | Unverified at whole-product scope | These are cross-cutting outcomes. Slice tests support several principles but do not certify every Ask journey. |
| Recorded exceptions/rules | 7 | Approved targets; implementation evidence varies | Decisions remain authoritative. They are not promoted solely because the FRD records them. |
| Capability cards | 4 | Partial; `IW-CAP-004` remains target | Registry coverage and unique launch mapping are tested. Complete end-to-end parity across all capabilities is not established. |
| Adaptive presentation | 12 | Partial | Focused component/policy tests cover table/card transformation, comparisons, view state, reduced motion and safe compatibility. A unified policy across every block and producer remains open. |
| Shell and contextual surface | 8 | Partial | Context panel and session continuity are component-tested. Full shell behavior, draft persistence, layout and feedback identity are not completely certified. |
| Conversation history | 18 | Partial | Backend pagination/search/access boundaries and frontend grouping/session continuity are tested. Rename, pin, archive, restore, delete, offline states and full accessibility are not all certified here. |
| Desktop workspace | 9 | Partial | Component tests cover inline detail continuity and response context. Full panel promotion, rail persistence, focus order and refresh behavior remain broader than the focused tests. |
| Mobile workspace | 10 | Partial | Responsive presentation policies and existing mobile components are covered by focused unit tests. No browser/mobile suite was run in this review. |
| State and continuity | 8 | Partial | Result identity, stored views, rehydration and stale-request protections have focused tests. Every workspace level, draft and external round trip is not covered. |
| Freshness and reconciliation | 5 | Partial | Correction handlers exercise stale checks, idempotency, receipts and selected reconciliation paths. Cross-result reconciliation remains incomplete. |
| Input and validation | 5 | Partial | Correction/capture handler tests exercise typed validation, retained inputs, canonical writers and proposal versions. Coverage is limited to implemented operation families. |
| Confirmation and receipts | 7 | Partial | Focused backend tests cover authorization, freshness, retries, races, receipts and declared correction behavior. Not every domain operation is exercised. |
| Traditional navigation | 6 | Unverified as a whole | Current pages and secondary actions exist, but this review did not inventory every direct route or discoverability path. |
| Maintenance reference journey | 9 | Partial | Query continuity, detail components and correction handlers are tested. Full-scope collection browsing and every return/reconciliation state are not completely certified. |
| Performance | 5 | Unverified | Focused functional tests do not establish measured performance baselines or all long-operation behavior. |

## Commands executed

```text
cd apps/frontend
npx jest src/features/ask src/components/ask --runInBand
# 27 suites, 195 tests passed

cd apps/backend
node --test tests/ask/askInteractionCoverageMatrix.test.js \
  tests/ask/askLaunchContextCapability.test.js \
  tests/ask/correctionHandlersRuntime.test.js \
  tests/ask/askSessionHistoryPagination.test.js \
  tests/ask/maintenanceViewStateContinuity.test.js \
  tests/ask/captureConfirmWriteSafety.test.js
# 147 tests passed
```

The frontend run emitted existing React `act(...)` warnings and one intentionally handled API error log; the suite still passed. Neither command used a live backend, database or browser.

## Highest-impact remaining gaps

1. Complete capability parity remains unproved; keep `IW-CAP-004` as `TARGET`.
2. Cross-result reconciliation is narrower than `IW-FRESH-003` requires.
3. History management actions and history accessibility need dedicated evidence.
4. Desktop/mobile browser behavior needs a fresh run against commit `42b9098f`.
5. Numeric performance baselines required by `IW-PERF-005` do not exist in this review.
