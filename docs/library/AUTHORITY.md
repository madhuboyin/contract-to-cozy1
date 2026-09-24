# Requirements authority and implementation evidence

This is the canonical **reading and status policy** for product requirements. Linked FRDs contain the normative requirement text. Current code and schema establish what is implemented; a status document alone is evidence, not execution proof. A requirement without traced evidence has status **UNVERIFIED**, even if a document header says “Implemented.”

## Precedence

1. An explicit supersession or precedence statement in a later approved requirement controls only the behavior it names. Domain authorization, safety, data-integrity, and consequential-action confirmation remain in force.
2. A domain FRD governs its domain-specific behavior. A cross-domain FRD governs shared interaction behavior. A specific approved addendum governs its stated exception or detail.
3. ADRs record architecture decisions. Plans and audits record sequence or observations; neither silently overrides product requirements.
4. Implementation records and code establish delivery status. They do not silently change target requirements. Where code conflicts with the target and no later decision resolves it, record the discrepancy in [FLAGS.md](FLAGS.md) and decide it before enhancement work.

## Family authority

| Family | Normative target | Delivery evidence | Resolution and remaining boundary |
|---|---|---|---|
| Ask Cozy | [Inline Workspace FRD](../product/ASK_COZY_INLINE_WORKSPACE_FRD.md) for normal inline completion and responsive workspace; [Interaction Model](../product/ASK_COZY_INTERACTION_MODEL_UI_FRD.md) and [Cross-Domain Rollout](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) for their respective shared and domain requirements; specific audience/trust addenda where they say they govern | `apps/backend/src/services/ask/`, `apps/frontend/src/components/ask/`, and phase verification records | Use the lineage below. Inline Workspace §2 explicitly supersedes routine domain-page handoff as the completion mechanism and the earlier exclusion of a richer responsive workspace. It preserves canonical domain rules, trust constraints, and optional traditional navigation. Do not infer that all inline requirements shipped from the FRD's approval. |
| Guidance Engine | [Guidance Engine FRD](../functional/GUIDANCE_ENGINE_FRD.md) for signal-driven journeys; [End-to-End Asset Resolution FRD](../functional/GUIDANCE_ENGINE_FRD_Updated.md) for user-initiated resolution requirements | `apps/backend/src/routes/guidance.routes.ts`, `apps/backend/src/services/guidanceEngine/guidanceJourney.service.ts`, current guidance UI | The broad FRD's “journeys do not exist without signals” statement describes its original signal-driven scope. The later resolution FRD adds manual initiation; current code uses `isUserInitiated`, `scopeId`, and a string `templateVersion`. Its “Ready for Implementation” header does not establish that FR-01–FR-16 all shipped. Verify each step and entry surface separately (`C3`). |
| Property Context | [Property Context FRD](../property-context/PROPERTY_CONTEXT_FRD.md) for shared typed facts and applicability; [JIT Capture FRD](../property-context/PROPERTY_CONTEXT_JUST_IN_TIME_CAPTURE_FRD.md) for cross-feature capture; [Catalog Governance FRD](../property-context/PROPERTY_CONTEXT_CATALOG_GOVERNANCE_FRD.md) for catalog ownership and workflow | Phase completion/status records under `docs/property-context/`, directly affected context services, Prisma schema | These are complementary scopes, not replacements. Their “Proposed” headers are stale for delivered slices. Phase/slice records establish claimed coverage, not blanket completion of every FRD requirement (`C7`). |

## Ask Cozy lineage

Read the Ask documents by scope rather than filename date:

1. [Ask Redo FRD](../product/AI_HOME_CONCIERGE_ASK_REDO_FRD.md) is the early platform baseline. Its adopted routing, operation, confirmation, and governance constraints remain relevant where a later document does not revise them.
2. [Audience Context](../product/AI_HOME_CONCIERGE_ASK_AUDIENCE_CONTEXT_ADDENDUM_FRD.md) and [Trust Architecture](../product/AI_HOME_CONCIERGE_ASK_TRUST_ARCHITECTURE_ADDENDUM_FRD.md) are specific addenda. Their authorization, audience, safety, evidence, and trust constraints govern within their stated scopes.
3. [Intelligence Incremental](../product/AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md) is a longer-term intelligence roadmap. Its proposed header remains controlling for requirements without separate delivery evidence.
4. [Message-First](../product/ASK_COZY_MESSAGE_FIRST_FRD.md) defines the message-first operation and capture architecture. It does not itself prove delivery and still needs stable requirement IDs.
5. [Interaction Model](../product/ASK_COZY_INTERACTION_MODEL_UI_FRD.md) governs result identity, freshness, actions, confirmation, reconciliation, accessibility, and recovery. Its implementation claim is limited to the corrections identified in §29.
6. [Cross-Domain Rollout](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) governs shared interaction rules and domain rollout requirements. Its phase verification records provide static evidence with explicit partials; they do not make its proposed header a blanket implementation claim.
7. [Inline Workspace](../product/ASK_COZY_INLINE_WORKSPACE_FRD.md) is the latest scoped addendum. It overrides the two interaction assumptions named in its §2: routine domain-page handoff and exclusion of a richer responsive workspace. Other earlier requirements remain in force unless an explicit conflict exists. Its reviewed coverage and remaining evidence gaps are summarized in [ASK_INLINE_COVERAGE.md](ASK_INLINE_COVERAGE.md).

This resolves document reading order, not delivery status. Use `requirements.csv` for requirement-level status. The Ask requirement sources now have stable IDs in `requirements.csv`. Use those IDs in future changes and retain an ID when its wording or status changes.

## Requirement status vocabulary

| Status | Evidence required |
|---|---|
| TARGET | Approved intent with no verified implementation claim. |
| IMPLEMENTED_STATIC | Current route/service/schema/UI or worker path traced to the requirement; runtime behavior not tested. |
| VERIFIED_RUNTIME | A relevant environment-independent test or actual run checked the behavior and result; cite the command or test. |
| PARTIAL | Some acceptance criteria traced; list the missing criteria. |
| DEFERRED | Explicit product decision defers the requirement; cite it. |
| SUPERSEDED | An explicit later decision names the replacement and affected scope. |
| UNVERIFIED | No sufficient evidence yet. This is the default, not a failure judgment. |

The [requirements ledger](requirements.csv) extracts stable IDs from the 28 FRD/PRD files. Its default is `UNVERIFIED`; 12 documents have an `UNNUMBERED` row because their requirements still need stable IDs. Manually reviewed statuses and evidence live in [requirement_status.csv](requirement_status.csv), which the ledger builder validates. The extracted first-line text is a locator, not a substitute for the full requirement and acceptance criteria in its source FRD.

For each future enhancement, follow [CHANGE_POLICY.md](CHANGE_POLICY.md): record the requirement ID (or assign one if absent), its governing source, status, acceptance criteria, evidence paths, last checked commit/date, and open discrepancy. Update that record together with the behavior change. The [catalog](catalog.csv) is a discovery inventory and review ledger; an empty flag is **not** implementation evidence.
