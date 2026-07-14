# Phase 4 implementation audit — initial greenfield slice

Phase 4 has started with context transparency. It has not started a household intelligence graph, temporal history or simulations because ContractToCozy has no real-user history or validated need for those systems. This boundary creates no database change or migration.

## Implemented

| Deliverable | Status | Evidence |
|---|---|---|
| Current-state relational facade | Complete | `getHouseholdContextMap.usecase.ts` always maps property signals/outputs and conditionally adds consented household rows |
| Property-scoped repository query | Complete | Loads property-derived traits/recommendations by property and conditionally loads owner-scoped consent plus answered `ProfileAnswer` events |
| Owner-only API | Complete | `GET /api/properties/:propertyId/personalization/context-map` requires `canViewSensitiveEvidence` after property authorization |
| Provenance and validity metadata | Complete | Nodes/edges expose source plus available `validFrom`/`validTo`; consent version/time is explicit |
| Stable public identities | Complete | Semantic keys replace database, property, household and user IDs in the response |
| Bounded value disclosure | Complete | Scalar values are formatted; nested arbitrary JSON and trait evidence are not returned |
| Owner transparency UI | Complete | Personalization page shows property signals before profile consent and adds explicit household fact cards after consent |
| Focused tests | Complete | Default property mapping, consented profile mapping, private-value omission, pause behavior, repository scope, capability route and UI boundary coverage |

## Privacy and data posture

- No Phase 4 schema entity, migration or backfill was created. The existing
  seed was later aligned to the pruned pilot schema.
- Profile facts remain explicit and opt-in in `ProfileAnswer.answerJson`; there
  is no inference source or separate lifestyle table.
- Property signals and property-owned recommendations remain visible in the transparency view without optional-profile consent.
- The context endpoint is restricted to the property owner because household composition and financial preference facts may be sensitive.
- Raw recommendation/trait evidence, arbitrary nested JSON, database IDs and owner identifiers are excluded.
- The existing reset/erasure path remains authoritative; this facade stores nothing.
- Property-derived traits are not household-owned and therefore survive optional-profile reset.

## Why the UI is not a graph canvas

Internal validation currently contains a small number of current facts. A visual node canvas or timeline would add interaction cost without improving the owner's understanding. The compact list still uses a typed graph-shaped API, leaving the backend contract useful if real journeys later justify a richer view.

## Intentionally deferred

- Retained household event history and longitudinal timelines.
- Modeled life transitions or future plans.
- Trait-to-recommendation causal edges unless rule dependencies can prove them.
- Proactive planning and scenario simulation.
- Scenario assumptions/provenance storage.
- Graph extraction, a graph database or graph query language.
- Cross-household analytics and inferred household relationships.

These are not current implementation gaps. They require observed pilot journeys, explicit retention/privacy approval, trustworthy source data and a concrete decision that cannot be explained well by the relational facade.

## Completion assessment

The initial Phase 4 transparency slice is implemented. Full Phase 4 is not complete. Reassess only after at least three valuable multi-hop journeys are observed; benchmark PostgreSQL before considering graph infrastructure, and require deletion/temporal correctness plus trust research before retaining history or offering simulations.
