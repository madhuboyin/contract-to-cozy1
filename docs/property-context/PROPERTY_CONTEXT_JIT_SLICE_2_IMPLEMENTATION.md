# Property Context Just-in-Time Capture — Slice 2 Implementation

**Implemented:** 2026-07-17

## Scope delivered

Slice 2 extends the Slice 1 scalar contract with backend-owned progressive group schemas and atomic multi-owner persistence.

| Capture key | Canonical facts | Conditional behavior |
|---|---|---|
| `OUTDOOR_SPACE_PROFILE` | private outdoor presence, outdoor-space types, landscaping responsibility | Types and responsibility appear only when private space is present; a negative answer atomically clears types |
| `HVAC_SYSTEM_PROFILE` | heating type, cooling type, HVAC responsibility | Related system facts save in one transaction |
| `SAFETY_DETECTOR_PROFILE` | smoke detectors, CO detectors, common-safety responsibility | Safety presence and responsibility save together |
| `ROOF_STRUCTURE_PROFILE` | roof type, replacement year, roof responsibility | Replacement year is optional; type and responsibility are required |

The Plant Advisor outdoor operation now uses `OUTDOOR_SPACE_PROFILE`, so its first required capture is progressive and immediately re-evaluates the existing outlook without a page reload.

## Contract behavior

- Group field keys are presentation/input identifiers. Canonical fact bindings remain backend-only and are removed from API responses.
- The orchestrator rejects unknown fields, inactive conditional fields, invalid enum options, invalid numeric ranges, and incomplete required groups.
- Every active group answer is normalized by the existing canonical fact validator.
- Canonical writes and evidence rows for the group are committed in one database transaction.
- Capture receipts contain only an answer hash, updated fact keys, and evidence IDs; raw answers are not copied into a generic runtime fact store.

## Stale and conflict handling

- Evaluations return safe current answers for stale or conflicted registered facts.
- The shared panel pre-fills those answers and labels confirmation and conflict flows explicitly.
- Confirming a stale answer refreshes evidence and advances the context version.
- A supported conflict confirmation writes verified homeowner evidence without superseding prior evidence rows. This preserves the disagreement trail while the newer verified observation receives normal source precedence.
- Source-choice candidate rendering is intentionally limited to domains that can safely reconstruct typed candidates. Slice 2 supports confirmation/correction of the canonical typed value and does not expose raw internal evidence.

## Explicit unknown

`PropertyFactEvidence.observationState` distinguishes `KNOWN` from `UNKNOWN` observations.

- “Not sure” does not write `false`, `0`, or a fabricated enum.
- It does not overwrite a canonical value or supersede stronger known evidence.
- When no stronger known evidence exists, assemblers return an explicit unknown fact.
- The frontend suppresses the same unresolved requirement for the rest of the current feature session, preventing a prompt loop.

## Financial groups

No financial aggregate is enabled as a structured scalar group. The Slice 0 decision remains in force: `financial.financingProfile` and `financial.currentMortgage` are relational aggregates and will use the financing-domain mini-flow and its authentication/masking policy in Slice 3.

## Database application

`schema.prisma` adds the `PropertyFactObservationState` enum and the `PropertyFactEvidence.observationState` field with a `KNOWN` default. No migration script is included; the database change is applied by the repository owner.
