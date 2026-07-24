# ADR-0001 — Canonical Capability Registry

## Status

Accepted for implementation baseline.

## Date

July 24, 2026

## Context

ContractToCozy currently derives homeowner-tool discovery from several independent sources:

- the mobile AI catalog;
- the mobile Home Tool catalog;
- the frontend discovery registry;
- the legacy related-tool registry and mappings;
- two frontend recommendation selectors;
- backend rollout and lifecycle aliases; and
- Knowledge Hub `ProductTool` seed metadata.

The current catalogs contain 52 distinct IDs before active-route and alias reconciliation. Adding
a new tool requires editing several systems, and omission from one system is not detected
consistently.

The Capability Discovery and Recommendation Platform requires one validated registration that
automatically supplies catalog discovery, contextual eligibility, related suggestions, rollout,
launch attribution, and lifecycle metadata.

## Decision

1. Backend code-owned capability manifests are the authoritative runtime source for the first
   implementation.
2. The registry is validated at process startup and in CI.
3. Contextual evaluation and ranking occur in the backend.
4. Canonical Home Actions remain the authority for what matters; capability suggestions are
   subordinate projections.
5. A capability without reviewed eligibility defaults to `CATALOG_ONLY`.
6. The existing `ProductTool` database model remains authoritative for Knowledge Hub relationships
   but receives registry-owned capability metadata as a projection.
7. Existing personalization recommendation definitions are referenced by stable code; this
   implementation does not create another rule datastore.
8. Icons cross the backend boundary as allowlisted string names.
9. Existing tool routes remain stable during convergence.
10. Actual-view impressions replace catalog-open and command-open bulk impressions.
11. Existing Product Analytics and action/recommendation lifecycle state are reused initially.
12. No property-capability state table is introduced without measured latency, scale, or
    cross-device consistency evidence.

## Consequences

### Positive

- New capabilities receive one enforceable integration path.
- Frontend catalogs and selectors stop owning eligibility.
- Release, safety, lifecycle, and route completeness become testable.
- Future tools can safely default to catalog-only rather than being accidentally promoted.
- Knowledge Hub relationships remain durable without maintaining a separate tool inventory.

### Costs

- Every existing capability must be reconciled and registered.
- Product and domain owners must review recommendation disposition and meaningful completion.
- The frontend requires a serializable catalog projection and icon resolver.
- Existing selectors and manual mappings must be migrated and retired.

### Rejected alternatives

- **Keep frontend catalogs authoritative:** preserves the current cross-runtime drift.
- **Make `ProductTool` immediately authoritative:** requires a database authoring and activation
  workflow that does not yet exist and weakens code-review enforcement.
- **Infer all contextual rules automatically:** conflicts with deterministic eligibility,
  evidence, and governance requirements.
- **Maintain both legacy and canonical registries permanently:** creates the same divergence under
  a new name.

## Verification

- The generated current-capability inventory reconciles every existing catalog ID.
- CI fails when the generated inventory is stale or structurally invalid.
- The canonical registry contract rejects duplicate IDs, routes, rollout keys, incomplete
  contextual definitions, invalid completion definitions, and unknown explicit relationships.
- Later phases demonstrate catalog and recommendation parity before removing legacy authorities.
