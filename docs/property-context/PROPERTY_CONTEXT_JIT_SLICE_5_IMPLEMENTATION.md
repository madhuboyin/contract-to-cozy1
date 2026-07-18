# Property Context JIT — Slice 5 hardening, tranche 1

Date: 2026-07-17

## Scope

This tranche begins Slice 5 by retiring the compatibility notice, locking explanation-only aggregate rendering, adding bounded evaluation/capture telemetry, and auditing noninteractive workers and notifications. It does not declare the full Slice 5 exit gate complete.

## Compatibility retirement

`PropertyContextNotice` and its generic inline scalar-capture behavior have been removed. Shared response types now live in `propertyContextTypes.ts`; aggregate, report, replay, advisory, and guidance consumers render `PropertyContextStatusNotice`.

The replacement is intentionally noninteractive. It explains applicability, limitations, conflicts, and stale results and may link to canonical property editors, but it cannot fetch a capture schema or write a fact. Feature-owned `PropertyContextCapturePanel` remains the only shared in-place questionnaire UI.

The frontend API no longer exposes the legacy fact-key capture and capture-definition methods. The backend-compatible scalar endpoints remain available for deployed-client compatibility as allowed by the FRD, but no current frontend feature uses them as its primary flow.

## Accessibility and mobile behavior

- Attention states announce politely through `aria-live` without interrupting the active task.
- Status regions have a stable accessible label derived from the feature-provided title.
- Multiple correction paths are grouped in a labelled navigation region with explicit link text.
- The renderer has no fixed dimensions or form controls and preserves the existing wrapping mobile layout.

## Observability

Prometheus metrics now record:

- evaluation count by registered feature, operation, and readiness outcome;
- evaluation latency by registered feature and operation;
- capture count by registered feature, operation, capture schema, and terminal outcome; and
- capture latency by registered feature, operation, and capture schema.

Labels are attached only after schema parsing and registry validation. Property IDs, user IDs, addresses, answers, and arbitrary unregistered identifiers are never metric labels.

Capture outcomes distinguish success, version conflict, idempotency conflict, validation failure, access denial, and unexpected error. Timers close through `finally`, including failure paths.

## Worker and notification audit

Reserve-fund, permit, and report workers reuse their backend-owned noninteractive context-check services and persist or compare context versions. Seasonal jobs reuse their domain applicability policy. Notifications use the aggregation context envelope, suppress inapplicable or inactive lifecycle items, and stamp the evaluated context version into metadata.

Workers and notifications do not invoke capture actions, render prompts, or synthesize answers.

## Deferral decision

Cross-session enhancement deferral is not introduced in this tranche. Current product behavior only requires same-session dismissal, and persisting optional-answer suppression would add a new durable preference without an approved retention or reset contract. This remains an explicit product decision rather than an implicit schema change.

## Remaining Slice 5 work

- exercise the shared panels with browser-level keyboard, screen-reader, narrow-viewport, latency, and failure acceptance tests;
- complete the repository-wide registered-operation/bypass audit across every property-aware execution endpoint; and
- close any gaps found by that audit before declaring the Slice 5 exit gate complete.

No Prisma schema change or migration is required for this tranche.
