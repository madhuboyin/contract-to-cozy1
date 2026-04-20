# J Checklist Implementation Plan (Partial + Missing Items)

## Scope

This plan covers every `Partial` and `Missing` item from:

- `docs/audit-gemini/strategic-transformation-plan.md` section **J. 90-Day Execution Plan**
- The strict checklist review matrix completed on 2026-04-20

## Delivery Cadence

- Sprint 1 (Week 1-2): unblock core flows and release gates
- Sprint 2 (Week 3-4): complete product surfaces, trust system, and performance instrumentation
- Sprint 3 (Week 5): external validation and launch-readiness audits

## Implementation Backlog (Strict Order)


| Order | Item                                                             | Current status | Owner                               | Plan                                                                                                                             | Exit criteria                                                          |
| ----- | ---------------------------------------------------------------- | -------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1     | Fix broken routes / dead CTAs                                    | Partial        | FE App Shell                        | Remove legacy command-palette links, normalize all nav targets to canonical routes, and enforce property-aware navigation paths. | Zero dead CTA in smoke traversal; routing checks pass.                 |
| 2     | Wire `ReplaceRepairAnalysis` into Repair vs Replace journey      | Missing        | FE Resolution + BE Decisioning      | Load analysis object directly in Resolution flow and render verdict, rationale, and confidence before action selection.          | Resolution card consumes real analysis payload end-to-end.             |
| 3     | Wire quote comparison access from Fix                            | Partial        | FE Fix                              | Add direct "Compare Quotes" entry in Fix hub with property/service context handoff.                                              | User reaches quote comparison from Fix in one click.                   |
| 4     | Complete completion loop + outcome logging                       | Partial        | FE Resolution + BE Orchestration    | Replace placeholder completion-photo handling with real storage pipeline and attach proof artifacts to completion history.       | Completion proof persists and is visible from follow-up surfaces.      |
| 5     | Implement full analytics schema (38 events)                      | Partial        | Data/Analytics + FE/BE              | Reconcile frontend event catalog and backend taxonomy, add missing events, and enforce typed payload validation.                 | All planned events emit correctly in staging verification.             |
| 6     | Set up north-star dashboards                                     | Partial        | Data/Analytics                      | Add WAU, D7 retention, completion rate, and time-on-site panels with explicit definitions and date-range controls.               | Dashboard exposes agreed north-star metrics with correct calculations. |
| 7     | Auth edge cases (expired tokens, concurrent sessions, MFA flows) | Partial        | BE Auth                             | Add explicit regression tests for token expiry/rotation, concurrent sessions, MFA challenge/disable/recovery behavior.           | Auth edge-case suite passes and no bypass paths remain.                |
| 8     | Error handling coverage for all API calls                        | Partial        | FE Platform                         | Replace console-only failures with standardized user-facing error states and retry paths across key surfaces.                    | Major API surfaces have graceful error state + retry action.           |
| 9     | LCP measurement + critical-path optimization                     | Missing        | FE Performance                      | Add web vitals instrumentation for LCP, capture route-level metrics, then optimize top offenders (assets, JS, blocking queries). | LCP tracked by route and priority routes meet budget target.           |
| 10    | Full mobile QA pass (iOS Safari + Android Chrome)                | Missing        | QA Mobile + FE                      | Execute cross-device matrix on priority journeys and attach screenshot/video evidence for each case.                             | Signed pass report with no unresolved P0/P1 issues.                    |
| 11    | Empty-state audit across all sections                            | Partial        | FE Surfaces + UX                    | Build route-by-route checklist, add missing designed empty states, and normalize empty-state CTA language.                       | 100% audited routes include designed empty state + CTA.                |
| 12    | Full trust metadata adoption                                     | Partial        | FE Resolution + FE Shared           | Roll out standardized `TrustMetadataBar` where recommendation cards currently use ad-hoc trust fragments.                        | Targeted recommendation surfaces use shared trust metadata bar.        |
| 13    | Rebuild `/providers` as Fix section with Resolution context      | Partial        | FE Fix/Providers                    | Ensure `from=resolution-center` context applies category defaults and preserves return path and intent metadata.                 | Resolution -> Providers flow retains context in all entry paths.       |
| 14    | Complete Protect surface parity                                  | Partial        | FE Protect                          | Close remaining IA/feature gaps and align action model with plan-level expectations for Protect.                                 | Protect section matches planned IA and required interactions.          |
| 15    | Complete CoverageAnalysis + Warranty integration                 | Partial        | FE Protect + FE Vault + BE Coverage | Drive Vault Coverage and Protect from a shared model for consistency in status, gaps, and action pathways.                       | Vault + Protect display synchronized coverage insights.                |
| 16    | Harden camera loop reliability                                   | Partial        | FE Vault + QA                       | Stabilize timeout/error handling, align test expectations, and resolve failing Magic Capture behavior.                           | Magic Capture tests pass and timeout UX matches spec.                  |
| 17    | Complete language audit (remove jargon)                          | Partial        | Product Copy + FE                   | Replace technical/insider wording with homeowner-first language and run final copy QA pass.                                      | No user-facing jargon remains in audited surfaces.                     |
| 18    | Provider portal smoke test                                       | Missing        | QA Provider + BE Provider           | Create and run provider lifecycle smoke suite (auth, dashboard, job actions, booking interactions).                              | Smoke suite passes in staging for release candidate.                   |
| 19    | External user testing (5 non-technical homeowners)               | Missing        | Product/UX Research                 | Run moderated sessions, synthesize confusion patterns, and ship fixes for top-3 blockers.                                        | 5-session report complete and top-3 fixes shipped.                     |
| 20    | Final broken-flow audit (click every CTA)                        | Missing        | QA + PM + FE Leads                  | Perform full CTA traversal across homeowner + provider surfaces after all fixes; track and close defects.                        | Zero unresolved P0/P1 flow breaks at release cutoff.                   |


## Sprint Plan

### Sprint 1 (Week 1-2): Stabilize Core Product

Focus items:

- 1, 2, 3, 4, 7, 8, 16

Milestone:

- Core homeowner paths (Resolution, Fix, completion loop, auth) are stable.
- Major broken-flow and reliability blockers are closed.

### Sprint 2 (Week 3-4): Complete Product + Measurement

Focus items:

- 5, 6, 9, 11, 12, 13, 14, 15, 17

Milestone:

- Product surfaces are coherent and consistent.
- Trust + analytics + performance instrumentation are in place.

### Sprint 3 (Week 5): Validate Launch Readiness

Focus items:

- 10, 18, 19, 20

Milestone:

- Independent validation confirms readiness.
- All launch-gate evidence is attached.

## Required Release Gates

- Frontend QA gates are green:
  - `npm -C apps/frontend run qa:priority-routes`
  - `npm -C apps/frontend run qa:shared-primitives`
  - `npm -C apps/frontend run qa:visual-drift`
  - `npm -C apps/frontend run test:visual-contract -- --runInBand`
- Targeted unit/integration tests are green:
  - `npm -C apps/frontend test -- --runInBand src/components/orchestration/__tests__/MagicCaptureSheet.test.tsx`
- Backend unit suite is green in CI/runtime-matched environment:
  - `npm -C apps/backend run test:unit`
- Validation artifacts are attached:
  - mobile QA matrix
  - provider smoke report
  - external user testing report
  - final CTA traversal report

