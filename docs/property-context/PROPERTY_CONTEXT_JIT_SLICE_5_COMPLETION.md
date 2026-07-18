# Property Context JIT — Slice 5 completion

Date: 2026-07-18

## Outcome

Slice 5 is complete. The final tranche adds repeatable browser acceptance for authenticated scalar, structured, and relational capture using registered production operations. No Prisma schema change or migration is required.

## Browser acceptance harness

The frontend now has a Playwright configuration dedicated to Property Context. Its acceptance route is available only when `PROPERTY_CONTEXT_ACCEPTANCE_FIXTURE=1`; without that build flag, an authenticated request resolves to 404 (and normal auth middleware may redirect an unauthenticated request first). The route renders the real `PropertyContextCapturePanel` and preserves an adjacent feature draft so route-free continuation can be asserted directly.

The transport fixtures use the production API paths, an HTTP-only `ctc.at` authentication cookie, and a CSRF token. Every evaluation and capture assertion verifies authenticated cookie and CSRF transport. The schemas mirror these registered contracts:

- scalar: `SELLER_PREP / OPEN_PLAN`;
- structured: `PLANT_ADVISOR / GENERATE_OUTDOOR_RECOMMENDATIONS`; and
- relational: `MAINTENANCE / SET_UP_INSTALLED_SYSTEMS`.

Backend unit and integration coverage remains responsible for evaluator decisions, authorization, canonical writes, evidence, context versions, conflicts, and idempotency. The browser suite owns rendering and interaction behavior at the HTTP boundary and does not introduce a second persistence implementation.

## Acceptance behavior locked

- The 750 ms latency message is announced without clearing feature input.
- Scalar capture works from the keyboard and resumes without navigation or reload.
- Structured capture hides inapplicable follow-ups and submits only the minimum path.
- Relational capture preserves both feature and capture drafts across a recoverable server failure.
- Successful capture invokes capture and ready continuations exactly once.
- A mobile Chromium profile verifies no horizontal overflow and a minimum 44 px target height for shared controls.
- Capture requests retain explicit property, feature, operation, context version, and backend-owned answer envelopes.

## Exit gate

Together with the tranche 1 compatibility retirement and worker/notification audit and the tranche 2 registered-operation audit and client hardening, this closes the Slice 5 exit gate. Active property-aware operations are either adopted or explicitly reserved, shared capture stays on the invoking surface, and the remaining generic notices are explanation-only.

Run the final browser gate, which first creates and then exercises the production frontend build, with:

```bash
cd apps/frontend
npm run test:property-context:e2e
```
