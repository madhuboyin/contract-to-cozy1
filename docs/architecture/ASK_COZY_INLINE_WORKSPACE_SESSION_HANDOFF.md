# Ask Cozy Inline Workspace — Session Handoff

**Saved:** September 18, 2026

**Branch:** `main`

**Current committed revision:** `f6500a89c6d4f0513b5ce3cddf718f535b871acf` (`Expand Ask response context panel`)

**Primary requirement:** `docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md`

## Product direction that must remain stable

Ask Cozy is becoming ContractToCozy's primary conversational workspace. Normal homeowner journeys should complete through inline chat interactions without implicitly navigating to traditional pages. The experience should use the presentation that best fits the content—text, cards, tables, comparison strips, detail views, workflows, or contextual panels—while preserving the conversation, composer, property context, and user state.

Traditional navigation must remain available as an explicit secondary choice. It must not be removed, hidden, or described to homeowners as “legacy.” Direct routes, deep links, and existing page workflows remain supported while adoption moves progressively toward Ask Cozy.

The ChatGPT interaction model is the reference point for quality, not a request to clone its branding. The intended characteristics are a stable chat shell, recent conversations on the left on desktop, an equivalent mobile drawer, adaptive structured results, optional contextual information on the right when space permits, clear in-chat actions, responsive behavior, accessibility, and near-zero-friction continuity.

## Implementation completed in the current sequence

The following revisions are on `main` and pushed to `origin/main`:

| Revision | Slice |
| --- | --- |
| `b4fb1deb` | Conversational history shell |
| `a683014d` | Maintenance task detail opens inline |
| `d082f6d0` | Inline maintenance task creation |
| `cabedc84` | Inline maintenance collection pagination |
| `7d678129` | Maintenance detail canonical-state and access-loss safety |
| `9360fc51` | Adaptive table/card presentations |
| `c7997fe1` | Initial contextual evidence panel |
| `d65ea3ec` | Adaptive bounded comparison strips |
| `f6500a89` | Context panel expanded to sources, assumptions, and limitations |

The authoritative per-slice status and remaining boundaries are in Appendix C of the primary FRD. Do not infer that an entire FRD section is complete from one implemented foundation slice.

## Most recently completed slice

The response context surface now:

- combines `EVIDENCE`, `ASSUMPTIONS`, and `LIMITATION` blocks behind one execution-scoped **Sources and context** control;
- opens as an adjacent desktop panel when space permits and as an in-Ask sheet on constrained/mobile layouts;
- keeps required limitation warnings visible in the conversation while also grouping them in the panel;
- persists only the bounded open execution identity per session/property, not response content;
- clears that state and restores trigger focus on explicit close; and
- leaves superseded/original responses with safe inline disclosures instead of interactive current-state controls.

Primary implementation files:

- `apps/frontend/src/components/ask/AskWorkspace.tsx`
- `apps/frontend/src/components/ask/EvidenceContextPanel.tsx`
- `apps/frontend/src/components/ask/__tests__/EvidenceContextPanel.test.tsx`
- `apps/frontend/e2e/ask/fixtures.ts`
- `apps/frontend/e2e/ask/ask.spec.ts`
- `docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md`

## Validation completed for the latest slice

The following environment-independent checks passed before revision `f6500a89` was committed:

- targeted ESLint;
- frontend TypeScript with `npx tsc --noEmit`;
- five focused Jest suites, 33 tests total;
- frontend production build; and
- `git diff --check`.

Browser acceptance scenarios were added for desktop/mobile context behavior, persistence, and focus restoration, but were not executed. Do not claim runtime verification. Repository instructions explicitly say not to start or troubleshoot browser, service, database, Docker, or seeded-user infrastructure for validation.

## Recommended next implementation slice

Continue the contextual information surface toward `IW-SHELL-006` with the smallest coherent contract-backed expansion. The remaining requirement is to support related records, workflow/output artifacts, and exact claim-to-source mapping.

Before editing, inspect the current response contract and producers. Existing `WORKFLOW_PROGRESS` and other presentation blocks must not be moved or duplicated based only on their names. Decide from repository evidence which information is secondary context and which status must remain visible in the conversation. If the current contract cannot represent a related record or output artifact safely, add an explicit schema-validated representation and update backend producers, frontend types/renderers, fixtures, tests, and the FRD together. Do not infer relationships from labels or URLs on the client.

Suggested acceptance boundary for one session:

1. Add one contract-backed contextual category—prefer a category already produced authoritatively by Ask rather than fabricating fixture-only data.
2. Keep essential answer, warning, pending-input, confirmation, and consequential workflow state visible in the conversation.
3. Provide one accessible summary trigger per current execution, with deterministic counts/labels and no duplicated secondary cards inline.
4. Preserve session/property isolation, mobile layer clarity, explicit close/back behavior, and focus restoration.
5. Retain explicit traditional navigation as an optional secondary action.
6. Add focused contract/component tests and browser acceptance coverage, but report browser execution as not run unless an approved environment-independent path exists.
7. Update Appendix C with the exact implemented and remaining boundary.

If repository evidence shows that this category requires a broad or ambiguous cross-domain contract, stop and report the discrepancy instead of inventing semantics. In that case, select the next smallest FRD-backed slice from Appendix C and explain the choice.

## Other open FRD boundaries

- History remains property-scoped, limited to five sessions from the previous seven days, without authorized pagination, server-side search, all-home scope, or privacy-safe indexing.
- Rename, pin/unpin, archive/restore, per-session menus, and durable user-authored titles are not implemented.
- Adaptive presentation still needs a general component registry and broader resolver coverage for grouped lists, timelines, accessibility preferences, and safe cross-block fallback.
- Maintenance inline coverage is not yet complete across every maintenance entry point.
- Runtime/browser verification is not claimed.

## Repository working-state notes

At the time of this handoff, local `main` and `origin/main` both resolved to `f6500a89c6d4f0513b5ce3cddf718f535b871acf`. The untracked `.codex/` and `apps/frontend/test-results/` directories were intentionally left untouched and must not be included in a feature commit without a separate reason.

Follow `AGENTS.md`: read the relevant FRD, implementation plan, architecture documents, and directly affected code before implementation; use Graphify for codebase tracing; preserve authorization and data-integrity safeguards; perform lightweight static/focused validation; and run `graphify update .` as the final repository-maintenance step after code changes.

## Copy-ready prompt for a new session

```text
Continue the Ask Cozy inline-workspace implementation in /Users/madhuboyina/Desktop/madhu/contract-to-cozy.

Start by reading AGENTS.md and docs/architecture/ASK_COZY_INLINE_WORKSPACE_SESSION_HANDOFF.md in full. Then read the relevant sections and Appendix C of docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md plus the directly affected contracts and components. Use the existing Graphify graph before making changes.

Current baseline: main and origin/main are at f6500a89c6d4f0513b5ce3cddf718f535b871acf (Expand Ask response context panel). The conversational shell, inline maintenance detail/create/pagination and state safety, adaptive TABLE and bounded COMPARISON presentations, and a Sources and context panel for EVIDENCE, ASSUMPTIONS, and LIMITATION are implemented as foundation slices. Browser acceptance scenarios exist but were not run; do not claim runtime verification.

Implement the next smallest coherent FRD-backed slice. The recommended direction is contextual information panel phase 2 toward IW-SHELL-006: add one authoritative, schema-validated category from the remaining related records, workflow/output artifacts, or exact claim-to-source mapping. First verify the current Ask response contract and real producers; do not invent client-side relationships, move essential workflow state out of the conversation, or create fixture-only behavior. If that direction is materially ambiguous or too broad, report the evidence and choose the next smallest Appendix C slice with a clear explanation.

Core product constraints: normal homeowner interactions stay inline in Ask Cozy; preserve the stable conversation, composer, property/session context, responsive mobile behavior, accessibility, confirmation and authorization safeguards; choose cards/tables/other structured UI adaptively; keep traditional pages and navigation available as explicit secondary choices; never remove or label them “legacy” in homeowner copy.

Implement code, focused tests, acceptance coverage, and the matching FRD status update. Follow the repository rule not to start or troubleshoot runtime/browser/database/Docker infrastructure. Run available lightweight static checks, focused environment-independent tests, git diff --check, and graphify update . as the final maintenance step. Do not touch unrelated untracked .codex/ or apps/frontend/test-results/ content. When finished, summarize the implemented boundary, validation actually run, remaining work, and files changed. Do not commit or push until I explicitly ask.
```
