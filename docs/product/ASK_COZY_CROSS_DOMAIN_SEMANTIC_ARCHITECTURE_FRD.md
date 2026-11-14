# Ask Cozy — Cross-Domain Semantic Request Architecture FRD

**Status:** Draft v1.0 for owner review

**Date:** 2026-11-14

**Scope:** All Ask Cozy homeowner turns, all product domains, reads, analyses, guided workflows, and confirmed writes

**Primary objective:** Make the correctness of a basic home question depend on its meaning and the home's authorised data—not on matching one expected sentence

**Supersedes:** The target-understanding, query-planning, capability-selection, answer-verification, and evaluation design in `ASK_COZY_UNDERSTANDING_RELIABILITY_FRD.md` where this document is more specific

**Does not supersede:** Existing authentication, property authorisation, privacy, safety-boundary, consequential-action confirmation, domain business rules, or canonical domain-service requirements

---

## 1. Executive decision

Ask Cozy shall use one cross-domain semantic request architecture for every homeowner turn.

The system shall no longer treat a prompt as a sentence that must resemble a registered example. It shall interpret the prompt into a typed **Semantic Request Plan**, validate that plan against the current user's authorised property context and the registered data/capability ontology, and then execute it through one of two deterministic planners:

1. a **Data Query Planner** for facts, lists, details, counts, comparisons, aggregates, missing-data questions, and relations; or
2. a **Capability Planner** for calculations, assessments, recommendations, workflows, and commands.

The semantic interpreter may propose meaning. It may not query arbitrary tables, invent fields or capabilities, bypass authorisation, execute a write, or compose the final factual answer. Deterministic code remains authoritative for validation, execution, provenance, and effect control.

This architecture applies across Ask Cozy. Warranty prompts are regression examples, not the design boundary.

---

## 2. Why this FRD exists

Homeowners do not know Ask Cozy's operation names, example phrases, record models, or internal domain boundaries. The following are semantically ordinary requests:

- “list down all items which don't have warranty”
- “provide details of all items without warranty”
- “how many appliances are not having warranty”
- “which items are having warranty”
- “show plumbing and electrical maintenance due next month”
- “which appliances have no manual or receipt?”
- “how much did I spend on repairs last year?”
- “what claims are still open and what documents are missing?”
- “which projects need a permit?”
- “what changed in my ownership costs?”

Differences in politeness, grammar, inflection, word order, projection (`LIST`, `DETAIL`, `COUNT`), polarity (`HAS` versus `HAS_NOT`), or a named relation must not send equivalent requests to unrelated operations or guidance.

The current system contains useful foundations—operation registration, a data-point catalogue, query templates, domain handlers, safety boundaries, property-scoped authorisation, typed presentation blocks, composition, and an understanding-provider interface—but still has multiple phrase-sensitive routing and query layers. Coverage is therefore bounded by hand-written vocabulary and examples rather than by the home's actual data and registered capabilities.

This is an architectural defect, not a request for more warranty regexes.

---

## 3. Governing product outcomes

### 3.1 Required outcomes

Ask Cozy shall:

1. Understand equivalent homeowner wording consistently across every supported domain.
2. Answer a populated, authorised home-data question directly when a safe deterministic read path exists.
3. Distinguish list, detail, count, aggregate, comparison, existence, missingness, and analysis requests.
4. Preserve positive and negative meaning, including `has`, `does not have`, `missing`, `expired`, and `unknown` as distinct states.
5. Resolve named items, rooms, projects, documents, policies, claims, and other entities against the authorised property's records—not only a global noun list.
6. Support relational questions spanning registered entities without treating the presence of two entity nouns as ambiguity by default.
7. Select a registered domain capability for analyses and workflows without depending on one canonical prompt.
8. Carry semantic context across turns so that “what about the kitchen?” refines the prior subject and request rather than starting an unrelated turn.
9. Produce an answer whose rows, count, polarity, fields, time range, and provenance are structurally entailed by the execution result.
10. Fail closed without fabricating relevance, while returning an intent-preserving next step.
11. Measure correctness on independent prompt families and seeded property scenarios across all domains.

### 3.2 Non-goals

This FRD does not require:

- correct interpretation of every possible utterance;
- a general-purpose chatbot;
- model-authored factual answers;
- arbitrary natural-language-to-SQL;
- exposing internal tables or operation identifiers to homeowners;
- removal of authentication, authorisation, safety interception, confirmation, or domain invariants;
- enabling every registered operation merely because it is labelled read-only;
- release cohorts, staged rollout machinery, or manual production certification for nonexistent users;
- a bespoke deterministic rule for each discovered prompt.

---

## 4. Definitions

### 4.1 Semantic Request Plan

A typed, provider-independent representation of what the homeowner requested. It expresses meaning, not execution code.

### 4.2 Data Query

A read over registered entities, fields, and relations using an allowlisted query algebra. Examples include listing appliances without warranties, counting open claims, comparing annual tax bills, and finding projects missing permits.

### 4.3 Capability

A registered product function that performs domain logic beyond retrieval, such as reserve planning, replacement guidance, recall review, refinance analysis, seller preparation, or a confirmed command.

### 4.4 Projection

The requested output shape: `EXISTS`, `COUNT`, `LIST`, `DETAIL`, `AGGREGATE`, `COMPARE`, `TIMELINE`, or `ANALYSIS`.

### 4.5 Polarity and record state

`HAS`, `HAS_NOT`, `UNKNOWN`, `EXPIRED`, `INACTIVE`, `MISSING_EVIDENCE`, and `NOT_APPLICABLE` are separate states. Absence of a linked record is not automatically proof that a real-world warranty, policy, permit, or document does not exist.

### 4.6 Semantic equivalence family

Independently written prompts that request the same plan, including grammatical variation, reordered clauses, synonyms, typos, and conversational framing.

### 4.7 Execution receipt

The typed, immutable result of a query or capability execution. It records the validated plan, resolved entities, applied filters, result rows or measures, missing-data states, authorisation decision, provenance, and answer-contract variant.

---

## 5. Product-domain scope

The architecture shall cover every registered Ask capability and every owner-visible property datum. Reporting shall use the canonical domain registry; it shall not hard-code a permanent domain count.

The initial cross-domain evaluation shall include at least these groups:

| Domain group | Representative meanings that must be expressible |
|---|---|
| Property profile | facts, rooms, systems, condition, property attributes |
| Appliances and inventory | items, categories, location, age, cost, condition, replacement |
| Maintenance and seasonal care | due, overdue, completed, upcoming, cost, service gaps |
| Warranties, insurance, and coverage | linked, active, expired, absent, evidence missing, coverage gaps |
| Claims and incidents | status, type, date, amount, checklist, documents, timeline |
| Documents and records | presence, absence, type, item/project linkage, evidence completeness |
| Ownership costs and reserves | spending, budgets, trends, funding gaps, forecasts |
| Property tax and financing | bills, assessments, appeals, loans, refinance, break-even |
| Projects, DIY, permits, quotes | status, dependencies, permit need, quotes, materials, next steps |
| Buyer and seller preparation | deadlines, readiness, checklist, documents, decisions |
| Risk, recalls, inspections, and environment | findings, recalls, hazards, mitigation, evidence |
| Home events and timeline | changes, service, replacements, incidents, historical sequence |
| Household and account context | roles, lifecycle applicability, authorised recovery |
| Cross-domain and composed requests | multiple independent or dependent facets in one turn |

Adding a domain shall require ontology and execution registration, not changes to a central list of prompt sentences.

---

## 6. Target architecture

```text
RAW HOMEOWNER MESSAGE
  │
  ├─ 1. pre-property safety / restricted-request / explicit-command boundary
  │
  ├─ 2. authenticate + authorise property, role, lifecycle and runtime availability
  │
  ├─ 3. protect identifiers; create raw + normalised + minimised representations
  │
  ├─ 4. semantic interpreter
  │       └─ typed Semantic Request Plan with source spans and alternatives
  │
  ├─ 5. deterministic plan validator
  │       ├─ ontology membership
  │       ├─ eligibility / authorisation / sensitivity
  │       ├─ entity and slot resolution
  │       ├─ confidence / ambiguity / effect policy
  │       └─ facet dependency validation
  │
  ├─ 6A. Data Query Planner ───────┐
  │       facts / relations         │
  │       counts / comparisons      ├─ typed execution receipt
  │                                 │
  └─ 6B. Capability Planner ────────┘
          analysis / workflow / command
                    │
          7. deterministic domain execution
                    │
          8. structural answer verifier + renderer
                    │
          9. semantic conversation-state update
```

Safety boundaries run on the complete original message before any property read. A governing boundary ends the turn. A write target can only open its own preview and must pass the existing confirmation and pre-effect revalidation flow.

---

## 7. Canonical Semantic Request Plan

### FR-PLAN-1 — Required envelope

Every interpreted turn shall return one of:

- `MATCH`
- `NONE_FITS`
- `INSUFFICIENT_TEXT`
- `BOUNDARY`
- `SCHEMA_INVALID`
- `PROVIDER_UNAVAILABLE`

A `MATCH` shall contain one to six ordered facets. Each facet shall include:

```ts
interface SemanticFacet {
  id: string;
  sourceSpan: { start: number; end: number; text: string };
  requestClass: 'DATA_QUERY' | 'CAPABILITY' | 'COMMAND';
  domainCandidates: RankedDomainCandidate[];
  subject: EntityReference | null;
  relations: RelationConstraint[];
  polarity: 'POSITIVE' | 'NEGATIVE' | 'UNKNOWN' | null;
  projection: 'EXISTS' | 'COUNT' | 'LIST' | 'DETAIL' |
              'AGGREGATE' | 'COMPARE' | 'TIMELINE' | 'ANALYSIS';
  fields: FieldReference[];
  filters: FilterExpression[];
  sort: SortExpression[];
  limit: number | null;
  time: TimeExpression | null;
  groupBy: FieldReference[];
  targetCandidates: RankedTargetCandidate[];
  requiredSlots: RequiredSlot[];
  dependsOn: string[];
  evidence: {
    jobMatch: string;
    subjectNamed: boolean;
    relationNamed: boolean;
    projectionNamed: boolean;
    polarityNamed: boolean;
  };
  confidenceSignals: ConfidenceSignals;
}
```

The production contract may use equivalent names, but it shall preserve every semantic dimension above.

### FR-PLAN-2 — Three target kinds

The understanding contract shall support:

1. `QUERY` — a semantic data query compiled through the Query Registry;
2. `CAPABILITY` — a semantic job resolved through the Capability Registry; and
3. `COMMAND` — a consequential action that can only produce a confirmation preview.

A generic query shall not be disguised as `DATA_POINT_READ` with ad hoc parameters. A domain analysis shall not be disguised as a query.

### FR-PLAN-3 — Meaning preservation

Normalisation may annotate or derive canonical tokens, but shall preserve:

- original text;
- protected spans;
- normalized text;
- provider-minimised text;
- source offsets;
- negation;
- comparison direction;
- time boundaries;
- quantity and units;
- conjunction/disjunction;
- requested projection.

The system shall never destructively strip a preamble if doing so can change meaning. Safety evaluation shall use the raw message and, where applicable, the normalized representation; either may trigger a boundary.

### FR-PLAN-4 — Multi-facet semantics

Clause splitting shall be semantic, not limited to a fixed list of second-clause prefixes. Dependencies shall be explicit. Independent safe facets may execute when another facet needs clarification. A dependent facet shall not execute until its dependency is resolved.

### FR-PLAN-5 — No silent partial interpretation

If a qualifier, field, relation, time constraint, entity, or requested facet cannot be represented or validated, it shall be reported as unresolved. The system shall not execute the representable subset while presenting it as a complete answer.

---

## 8. Semantic ontology and registries

### FR-ONT-1 — Entity Registry

Every queryable entity shall declare:

- stable entity id;
- homeowner-facing singular and plural labels;
- owning domain;
- property-scope rule;
- minimum audience;
- sensitivity class;
- identity fields and safe display fields;
- supported fields;
- supported relations;
- resolver adapter;
- query adapter;
- provenance adapter.

### FR-ONT-2 — Field Registry

Every queryable field shall declare its type, units, null semantics, enum vocabulary, supported operators, projection eligibility, sort/group/aggregate eligibility, audience floor, sensitivity, and canonical data-point identity.

### FR-ONT-3 — Relation Registry

Relations shall be first-class, directional declarations. Each relation shall define:

- source and target entity;
- cardinality;
- canonical storage path;
- inverse name;
- supported predicates such as `HAS_ANY`, `HAS_NONE`, `HAS_ACTIVE`, `HAS_EXPIRED`, `MISSING_EVIDENCE`, and `IN_ROOM`;
- treatment of `UNKNOWN` and unlinked legacy records;
- authorisation propagation;
- query compiler implementation;
- seeded verification scenarios.

Equivalent business relationships shall have one canonical storage and query definition. In particular, item-to-warranty status shall not be computed through competing links or handler-specific predicates.

### FR-ONT-4 — Capability Registry

Every routable capability shall declare:

- stable capability id and semantic job id;
- owning domain and operation adapter;
- read, preview, or effect class;
- audience, lifecycle, runtime, and entity requirements;
- input schema and required slots;
- supported projections;
- composability and dependency rules;
- grounded-check or typed execution-receipt contract;
- answer variants;
- recovery behavior;
- representative positive, adjacent-negative, and cross-domain examples.

Routing shall be hierarchical:

```text
domain set → request class → semantic job → capability → operation adapter
```

Operation ids remain execution implementation details. The semantic interpreter shall not need to choose among hundreds of flat operation names in one prompt.

### FR-ONT-5 — Registry completeness

Build-time governance shall fail when an owner-visible field has no data-point registration, a declared relation has no compiler, a routable capability has no execution contract, or a registered answer variant is not produced by its handler code path.

Source scanning alone shall not establish conformance.

---

## 9. Dynamic entity and context resolution

### FR-ENT-1 — Property-backed resolution

After property authorisation, resolvers shall match against the property's actual item names, room names, project titles, providers, documents, claims, policies, tasks, and other registered entity identities. Global aliases may improve recall but shall not define the universe of resolvable entities.

### FR-ENT-2 — Candidate states

Entity resolution shall return one of:

- `RESOLVED`
- `MULTIPLE_MATCHES`
- `MISSING`
- `UNAUTHORISED`
- `NOT_APPLICABLE`

It shall never silently choose between materially different property records.

### FR-ENT-3 — Context inheritance

Conversation state shall store semantic references, not only text:

- active property;
- prior plan and facets;
- resolved entity ids;
- active domain and capability;
- filters, relation, polarity, projection, and time range;
- outstanding slots and clarification options;
- execution ids and workflow/thread ids.

“What about the kitchen?”, “only the expired ones”, “how many?”, and “show details” shall refine the prior plan when unambiguous. Context shall expire or be cleared when a new explicit subject conflicts with it.

### FR-ENT-4 — No context privilege escalation

Inherited entities and filters shall be reauthorised on every turn and immediately before execution or preview.

---

## 10. Data Query Planner

### FR-QUERY-1 — Query algebra

The planner shall support an allowlisted algebra:

```text
FROM <registered entity>
WHERE <typed predicates and registered relation predicates>
PROJECT <exists | count | list | detail | aggregate | compare | timeline>
FIELDS <registered visible fields>
GROUP BY <registered groupable fields>
SORT <registered sortable fields>
LIMIT <bounded integer>
TIME <property-timezone interval>
```

No provider-generated SQL, Prisma object, delegate name, column name, or unrestricted expression may execute.

### FR-QUERY-2 — Required shapes

For every eligible registered entity/relation pair, the planner shall support where meaningful:

1. single-record detail;
2. multi-record list;
3. filtered list;
4. exists / does-not-exist;
5. count;
6. sort and top-k;
7. aggregate and group;
8. time-series and period comparison;
9. missing field or missing related record;
10. positive and negative cross-entity relations;
11. historical gaps and timeline sequences.

Unsupported combinations shall return a precise capability absence or clarification; they shall not be mapped to the nearest unrelated query.

### FR-QUERY-3 — Projection correctness

The result shall honor the requested projection:

- `COUNT` returns a count and the population definition;
- `LIST` returns matching labels;
- `DETAIL` returns declared requested fields for each match;
- `EXISTS` returns yes/no/unknown with evidence;
- `AGGREGATE` declares measure, function, and population;
- `COMPARE` identifies both periods or groups and the delta;
- `TIMELINE` returns ordered dated events with precision.

### FR-QUERY-4 — Positive, negative, and unknown

`HAS_NONE` shall be evaluated against a canonical relation and shall remain distinct from `UNKNOWN` and `MISSING_EVIDENCE`. Answers shall state which meaning was used—for example, “no warranty linked in your home record,” not “has no warranty” when the record cannot prove real-world absence.

### FR-QUERY-5 — Time semantics

Relative and calendar periods shall be resolved in the property's timezone. The plan and receipt shall store inclusive/exclusive boundaries and date precision. “Last year,” “next two weeks,” “in October,” and comparisons between periods shall not silently degrade to all-time results.

### FR-QUERY-6 — Limits and completeness

Result limits shall be explicit. If more rows match than are displayed, the answer shall report the total and truncation. Predicate overflow shall clarify or decline; it shall never drop filters silently.

---

## 11. Capability Planner

### FR-CAP-1 — Semantic job selection

Capabilities shall be selected by semantic job, required inputs, entity applicability, role, lifecycle, and runtime availability. Example-sentence similarity may provide evidence but shall not be the sole decision rule.

### FR-CAP-2 — Eligible catalogue only

The interpreter and planner shall receive only capabilities eligible for the authorised user/property context, or opaque eligibility-safe descriptors where revealing availability would expose restricted information.

### FR-CAP-3 — Read admission

A read capability may execute only when it has either:

- a standardized typed execution receipt plus structural validator; or
- a capability-specific grounded check and code-path answer contract.

An operation's `READ` label alone is insufficient. Conversely, a valid deterministic match shall not be discarded merely because a sentence-specific fast-path certificate is absent; it remains candidate evidence for semantic validation and normal capability selection.

### FR-CAP-4 — Commands and effects

A command plan may open only the matching confirmation preview. The pre-effect step shall recheck property membership, role, lifecycle, record version, required slots, and idempotency. No model confidence can authorize an effect.

### FR-CAP-5 — Capability absence

If the requested analysis or workflow is not registered, Ask shall preserve the interpreted intent in its response, identify the missing capability without claiming the user asked something else, and record unsupported demand.

---

## 12. Understanding and confidence policy

### FR-UND-1 — Interpreter implementation

The architecture shall support a real structured-output understanding provider. A deterministic semantic parser may produce or supplement the same plan contract. Provider-specific schemas shall adapt into the canonical plan; downstream execution shall not depend on provider-native output.

### FR-UND-2 — Two-stage retrieval

For large catalogues, interpretation shall use bounded two-stage retrieval:

1. choose up to four domain candidates plus overflow metadata;
2. search capabilities, entities, fields, and relations inside up to three domain groups concurrently;
3. merge candidates deterministically by facet and source span;
4. validate every target against the full eligible registry.

The limits are latency/cost controls, not permission to omit an independently requested facet without disclosure.

### FR-UND-3 — Confidence is multidimensional

The decision policy shall consider at least:

- request-class confidence;
- domain recall;
- target margin;
- entity resolution;
- relation and polarity evidence;
- slot completeness;
- projection evidence;
- effect/materiality class;
- language/locale;
- route type;
- provider availability.

A provider label such as `HIGH` shall never map directly to a fixed probability.

### FR-UND-4 — Risk-stratified admission

Certification and thresholds shall be stratified by semantic risk:

| Stratum | Default behavior |
|---|---|
| Exact, reversible, property-scoped data read | execute when plan and entity/relation validation pass |
| Aggregate/comparison/derived read | execute with typed receipt and structural verification |
| Recommendation or material analysis | execute registered capability; disclose assumptions |
| Ambiguous entity, polarity, relation, or material slot | clarify |
| Write or consequential action | preview and explicit confirmation only |
| Safety/restricted boundary | governing boundary response |

The system shall not require the same evidence budget for a reversible list query and a consequential write. It shall report both success-rate and incorrect-high-confidence bounds; one shall not be substituted for the other.

### FR-UND-5 — Deterministic fast paths

A certified deterministic rule may bypass semantic interpretation only when its stable id, hash, ownership, positive families, adjacent negatives, cross-operation collisions, entity requirements, and telemetry lineage are current. An uncertified rule may nominate candidates but may not establish route trust by itself.

---

## 13. Execution receipts and answer correctness

### FR-ANS-1 — Typed receipt

Every executed query or capability shall produce a typed receipt containing:

- validated plan version and facet id;
- target entity/capability and operation adapter;
- resolved record ids;
- applied predicates, relations, time bounds, sort, group, and limit;
- row count and total match count;
- selected fields or measures;
- missing/unknown/not-applicable states;
- provenance and source timestamps;
- authorization and applicability decision;
- answer variant id;
- child execution ids for composed turns.

### FR-ANS-2 — Structural entailment

Before rendering, the verifier shall prove that the answer variant is compatible with:

- request class;
- subject/entity;
- relation;
- polarity;
- projection;
- requested fields;
- filters and time range;
- result cardinality;
- provenance;
- missing-data state.

Bag-of-words similarity or source scanning alone shall never establish answer correctness.

### FR-ANS-3 — Operation-owned variants

Handlers shall export typed answer variants shared by the handler, receipt validator, and renderer. A build-time test shall execute or statically trace each declared code path sufficiently to establish that the handler produces the registered variant. Source-scan-only contracts cannot bypass relevance validation.

### FR-ANS-4 — Composed answers

The public response contract shall represent up to the supported six child facets without a lower child-execution cap. Each facet shall be labeled answered, missing data, clarified, unavailable, unsupported, or withheld due to dependency. Partial completion shall be explicit.

### FR-ANS-5 — Honest fallback

Remote fallback claim selection shall initialize with no selected claims. Provider error, timeout, schema failure, or zero verified matches shall not cause arbitrary grounded facts to be shown. Fallback may use only structurally relevant facts and must preserve the requested intent.

---

## 14. Privacy, security, and authorization

### FR-SEC-1

Safety, restricted-request, explicit-command, and emergency boundaries shall inspect the complete raw message before property access. Normalized text shall receive a second boundary check. A boundary on either representation governs.

### FR-SEC-2

Known identifiers shall be protected before normalization. The final provider payload shall be minimized independently and checked for routing-meaning loss. Provider terms and homeowner-text processing approval shall be recorded before provider use.

### FR-SEC-3

Every query and capability shall be property scoped and audience filtered at execution, even when the same checks passed during planning. Counts and existence answers are data disclosures and use the same authorization floor as their underlying records.

### FR-SEC-4

Model output shall never contain executable database identifiers, delegate names, raw predicates, SQL, or effect instructions. All references resolve through server-owned registries.

### FR-SEC-5

Logs and evaluation artifacts shall separate raw, protected, minimized, and semantic representations with appropriate retention and access controls. Telemetry shall not log raw home-record values merely to debug routing.

---

## 15. Recovery contract

Every unresolved turn shall end in exactly one typed recovery:

| Recovery | Required response |
|---|---|
| Missing record data | name the missing field/relation and offer an authorized capture path |
| Ambiguous entity | show materially distinct matching entities |
| Ambiguous meaning | ask one question that distinguishes the competing plans |
| Unauthorized | state that the action/data is unavailable to this role and who can act, without leaking data |
| Lifecycle-inapplicable | explain why and offer the applicable alternative |
| Capability absent | preserve the requested job and record unsupported demand |
| Provider unavailable | use a verified deterministic route or state temporary inability; show no arbitrary facts |
| Unsupported query combination | name the unsupported combination; do not answer a broader query |
| Out of domain | concise boundary with a home-related redirect |
| Safety/restricted | governing safety response |

A one-option clarification loop, unrelated guidance card, or false “which records?” prompt when the relation is expressible is a failure.

---

## 16. Evaluation and quality gates

### FR-EVAL-1 — Evaluation unit

The primary unit is an independently authored **semantic scenario family**, not a prompt copied from a rule. Each family shall include:

- canonical labelled Semantic Request Plan;
- at least one seeded property scenario with populated data;
- missing-data and unknown-state variants;
- role/lifecycle variants where applicable;
- natural paraphrases from independent authors;
- grammatical, polite, reordered, typo, and inflection variants;
- adjacent-negative and cross-domain collision prompts;
- expected execution receipt and answer assertions.

### FR-EVAL-2 — Coverage

The sealed suite shall cover every registered domain, semantic job, entity, relation, projection, effect class, and answer variant. Metrics shall be reported macro-by-domain and distribution-weighted. A strong warranty score cannot hide failures in documents, maintenance, projects, finance, buyer/seller, risk, or any other domain.

### FR-EVAL-3 — Layered metrics

The system shall report separately:

1. plan schema-valid rate;
2. facet recall and precision;
3. domain top-k recall;
4. entity resolution accuracy;
5. relation/polarity accuracy;
6. projection accuracy;
7. query-equivalence accuracy;
8. capability-selection accuracy;
9. exact row-set/count/aggregate accuracy;
10. answer-entailment accuracy;
11. missing-data recovery accuracy;
12. authorization/effect safety;
13. provider unavailability and fallback outcomes;
14. end-to-end resolved rate;
15. wrong-answer and false-decline rates;
16. latency by route.

### FR-EVAL-4 — Product gates

Before claiming the architecture meets the product objective, the sealed suite shall demonstrate:

| Metric | Gate |
|---|---:|
| End-to-end resolved rate, macro-by-domain | lower 95% confidence bound ≥ 90% |
| Populated-data direct-answer rate | lower 95% confidence bound ≥ 90% |
| Plan facet recall and precision | each ≥ 95% |
| Entity, relation/polarity, and projection accuracy | each ≥ 95% |
| Exact query result correctness | ≥ 99% on deterministic seeded scenarios |
| Answer structural entailment | ≥ 99% |
| False decline on supported, answerable prompts | ≤ 1% |
| Incorrect high-confidence selection | upper 95% confidence bound < 1% per risk stratum |
| Wrong write routing or unconfirmed effect | zero observed; statistical bound reported |
| Dead-end or unrelated fallback | ≤ 1% |

No result may be described as “90% of real homeowner prompts” until a representative adjudicated real-traffic distribution exists. Offline results shall be labelled sealed-proxy results.

### FR-EVAL-5 — Metamorphic invariants

For a meaning-preserving transformation, the validated plan and deterministic result shall remain equivalent. Required transformations include polite framing, singular/plural, active/passive possession, common negation forms, clause reordering where dependencies are unchanged, punctuation, casing, common typos, and follow-up projection changes.

### FR-EVAL-6 — Diagnostic sweeps

Routing sweeps and example hit rates remain diagnostics. They do not prove answer correctness because they do not, by themselves, verify entity resolution, query semantics, exact rows, handler output, or answer entailment.

---

## 17. Current-state baseline and known architectural gaps

The following figures are implementation baselines, not permanent requirements. They shall be regenerated from source by the implementation plan.

| Area | Current observed baseline (2026-11-14) | Consequence |
|---|---:|---|
| Registered operations | 231 total; 124 message-routable | a flat operation choice is too broad and counts must be derived |
| Routing sweep | 708 prompts; 13.4% direct hit; 63.8% fallback; 3.4% misroute | current phrase coverage is not a correctness architecture |
| Data catalogue | 107 points across 10 catalogue domains | catalogue is useful but does not cover all owner-visible data |
| Query templates | 11 | generic querying is sparse relative to the property model |
| Weighted data reachability | 32% direct; 57% reachable | routing alone cannot reach the 90% objective |
| Answer contracts | 5 code-path, 11 typed-but-untested, 108 source-scan-only | most operations lack structural answer evidence |
| Human-confirmed sealed rows | 0 of 10,716 proposed | current certification claims are not established |

Known high-priority correctness gaps to address during implementation include:

1. competing item-to-warranty relationship paths that can yield contradictory coverage answers;
2. fallback claim selection that can retain unrelated candidates after provider failure;
3. semantic token expansion that conflates insurance, claims, policies, coverage, and warranties;
4. noun-list and handler-local entity/category/time vocabularies;
5. multi-entity ambiguity instead of relation parsing;
6. incomplete positive/negative relation symmetry;
7. source-scan answer contracts;
8. default-disabled model understanding and certification policy not differentiated by semantic risk;
9. follow-up handling bound to specific operations and sentence patterns.

These are cross-domain examples of missing abstractions. Fixing them individually without the registries, plan contract, planners, receipts, and evaluation system in this FRD does not satisfy the architecture.

---

## 18. Delivery requirements

Implementation shall be incremental by architectural seam, not by adding prompt phrases domain by domain.

### Phase 0 — Baseline and invariants

- Generate authoritative operation, domain, entity, field, relation, capability, and answer-variant inventories.
- Reconcile counts and archive superseded implementation-ledger rows.
- Define seeded scenarios and independent semantic families across all domains.
- Add exact current failures as regression tests, labelled containment rather than coverage proof.

**Exit:** inventories are generated; contradictions and uncovered owner-visible data are explicit; no 90% claim.

### Phase 1 — Immediate correctness containment

- Select one canonical item-to-warranty relation and update all readers/writers; define reconciliation for existing rows.
- Make remote fallback fail closed with an empty selection on error.
- Separate warranty, insurance, policy, coverage, and claim semantic tokens.
- Remove any answer-gate bypass based only on source-scan contracts.

**Exit:** known contradictory and unrelated-answer paths are closed.

### Phase 2 — Ontology and typed plan

- Implement Entity, Field, Relation, and Capability registries.
- Extend the understanding contract with `QUERY`, `CAPABILITY`, and `COMMAND` facets.
- Preserve raw/normalized/minimized text and source spans.
- Add property-backed entity resolution and semantic conversation state.

**Exit:** representative prompts from every domain produce validated plans without execution.

### Phase 3 — Data Query Planner

- Implement the safe query algebra and compiler.
- Migrate current data-point queries into registered entities/relations.
- Add symmetric positive/negative, absence, time-series, comparison, and cross-entity shapes.
- Produce typed query receipts and deterministic renderers.

**Exit:** seeded query scenarios across every registered relation pass exact row/count assertions.

### Phase 4 — Capability Planner

- Introduce semantic jobs and hierarchical capability retrieval.
- Adapt eligible operations through stable capability adapters.
- Require typed receipts/grounded checks before read execution.
- Preserve preview and confirmation for commands.

**Exit:** supported analyses/workflows route by meaning across all domains without blanket read enablement.

### Phase 5 — Structural answer verification

- Replace source-scan trust with handler-owned typed variants.
- Verify relation, polarity, projection, fields, rows, counts, and provenance from receipts.
- Support six child executions in the public contract.

**Exit:** every routable capability has a code-path contract and the answer gate has no bag-of-words trust path.

### Phase 6 — Provider, calibration, and end-to-end evaluation

- Connect the real provider through the canonical plan schema and minimization boundary.
- Run two-stage domain/capability retrieval.
- Calibrate by semantic risk stratum.
- Execute the sealed cross-domain suite and publish layer metrics.

**Exit:** all FR-EVAL gates pass, or the result identifies failed domains/strata without a completion claim.

---

## 19. Required implementation artifacts

The implementation is incomplete until the repository contains:

1. versioned semantic plan schemas;
2. generated entity/field/relation/capability registry manifests;
3. safe query compiler and registry-owned adapters;
4. capability planner and operation adapters;
5. property-backed entity resolver;
6. semantic conversation-state contract;
7. typed execution-receipt schemas;
8. handler-owned answer-variant manifests and conformance checks;
9. cross-domain sealed evaluation manifest;
10. seeded property scenario catalogue;
11. metamorphic paraphrase runner;
12. per-layer measurement report;
13. unsupported-demand telemetry;
14. current requirement-to-evidence matrix.

Generated inventories shall be checked into or reproducibly generated by repository scripts. Hand-maintained totals in prose are informative only.

---

## 20. Acceptance examples

The following examples illustrate plan equivalence. They are not a phrase allowlist.

| Prompt family | Required semantic plan |
|---|---|
| “list items without warranty”; “which things have no warranty recorded?” | `QUERY InventoryItem LIST relation Warranty HAS_NONE` |
| “provide details of all items without warranty” | same relation, projection `DETAIL` |
| “how many appliances are not having warranty” | same relation, category `APPLIANCE`, projection `COUNT` |
| “which items are having warranty” | `QUERY InventoryItem LIST relation Warranty HAS_ANY` |
| “what maintenance is due next month?” | `QUERY MaintenanceTask LIST status open, due next calendar month` |
| “show plumbing and electrical tasks” | one query with category set `{PLUMBING,ELECTRICAL}` or two explicit facets; neither category dropped |
| “which appliances have overdue maintenance?” | `QUERY InventoryItem LIST relation MaintenanceTask HAS_OVERDUE` |
| “which appliances don't have a manual or receipt?” | registered document-relation predicate with explicit `OR` semantics |
| “how much did I spend on repairs last year?” | aggregate actual repair cost over last calendar year in property timezone |
| “compare this year's tax bill with last year's” | `COMPARE` two registered periods and compute deterministic delta |
| “what claims are open and what documents are missing?” | two related facets with claim entity dependency and explicit partial-completion behavior |
| “do I have recalls and which items are affected?” | recall-review capability plus affected-item receipt, not generic guidance |
| “should I repair the furnace or replace it?” | registered decision capability with resolved furnace and required cost/condition slots |
| “what about the kitchen?” after an inventory list | prior plan refined by room relation, with inherited projection |

For every row, seeded data shall assert the exact plan, records, counts, missingness semantics, and answer variant.

---

## 21. Decisions recorded by this FRD

1. **Cross-domain scope:** approved by the request for a holistic Ask Cozy architecture.
2. **Typed plan over prompt rules:** the primary routing unit is a Semantic Request Plan.
3. **Two planners:** data retrieval and domain capabilities are separate deterministic execution paths.
4. **Third target kind:** `QUERY` is first-class rather than overloaded onto single data points.
5. **Dynamic resolution:** authorised property data participates in entity resolution.
6. **Canonical relations:** one registered business relationship definition owns each cross-entity predicate.
7. **No blanket read bypass:** read admission requires typed structural evidence, not merely a read label.
8. **Risk-stratified calibration:** reversible data reads and consequential actions use different thresholds and controls.
9. **Typed receipts:** answer correctness is verified structurally against execution.
10. **Cross-domain evaluation:** completion is gated macro-by-domain and cannot be inferred from routing examples.

---

## 22. Owner decisions still required before implementation changes behavior

1. Which persisted item-to-warranty relation becomes canonical, and how existing conflicting rows are reconciled.
2. The final list of owner-visible entities/fields deliberately excluded from Ask, if any.
3. Provider and homeowner-text processing approval for semantic interpretation.
4. Latency and cost budgets for single-stage and two-stage interpretation.
5. Whether `UNKNOWN` warranty/coverage state should default to a separate result group or be excluded unless explicitly requested. Recommendation: separate group.
6. Which recommendation/analysis capabilities require additional materiality disclosures beyond their existing domain rules.

These decisions do not block Phase 0 inventories, schema design, pure planners, seeded fixtures, or containment of known contradictory/fabricated-answer paths.

---

## 23. Completion definition

This FRD is not complete because a new provider is connected, because several example prompts pass, or because deterministic routing hit rate rises.

It is complete only when:

- all required artifacts in §19 exist;
- every registered domain is represented in the ontology and sealed suite;
- every owner-visible included datum has a deterministic authorised read path;
- registered relations use one canonical definition;
- every routable capability has a typed execution and answer contract;
- provider output is advisory and fully validated;
- exact seeded result and safety tests pass;
- all gates in §16 pass with reported confidence intervals; and
- the current requirement-to-evidence matrix contains no unresolved P0/P1 requirement.

Until then, Ask Cozy may have improved coverage, but the cross-domain semantic architecture shall not be reported as complete or as providing a 90% guarantee.
