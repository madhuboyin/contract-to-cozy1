---
title: "ContractToCozy Skill Platform"
subtitle: "Governed capability architecture for AI Home Concierge and Home Intelligence"
document_type: "Functional Requirements Document"
status: "Implemented beta baseline"
version: "1.1"
date: "August 14, 2026"
accountable_product_area: "Homeowner Product / Home Intelligence / AI Home Concierge"
parent_documents:
  - "AI_HOME_CONCIERGE_ASK_REDO_FRD.md v1.6"
  - "AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md v1.3"
---

# ContractToCozy Skill Platform

## Functional Requirements Document

| Field | Value |
| --- | --- |
| Status | Implemented beta baseline |
| Version | 1.1 |
| Date | August 14, 2026 |
| Product area | Homeowner Product / Home Intelligence / AI Home Concierge |
| Active consumers | Ask, Home Actions, Concierge Home |
| Future consumers | Proactive intelligence, notification continuations, mobile experiences, major-event journeys, approved external interfaces |
| Parent Ask contract | [AI Home Concierge — Ask Redo v1.6](./AI_HOME_CONCIERGE_ASK_REDO_FRD.md) |
| Parent intelligence contract | [AI Home Concierge — Intelligence, Personalization, and Proactive Concierge v1.3](./AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md) |
| Development posture | Beta architectural refactor; no real-user migration or launch-gate program |

---

## 1. Executive decision

ContractToCozy shall introduce a governed Skill Platform between AI Home Concierge orchestration and the existing Ask operation registry.

The platform shall organize registered operations into coherent homeowner capabilities without replacing canonical domain services, durable Ask execution, Property Context, Decision Threads, Home Actions, confirmation, authorization, or the Living Home Record.

The target architecture is:

```text
ContractToCozy Experience
        ↓
Goal and intent resolution
        ↓
Skill Router
        ↓
Skill Registry
        ↓
Registered Skill and Operation
        ↓
Context Composition
        ↓
Governed Adapter
        ↓
Canonical Domain Service
        ↓
Living Home Record
```

The architectural objective is to allow ContractToCozy to add and evolve homeowner capabilities without continually adding capability-specific behavior to the central Concierge.

The platform is not an autonomous-agent framework, open plugin runtime, generic tool-execution environment, or replacement for domain ownership.

### 1.1 Current implementation status

The Version 1 beta engineering baseline is implemented. This is an implementation-completeness statement for the no-real-user beta posture; it is not a production-readiness, launch, privacy, security, or external-delivery approval.

Implementation snapshot as of August 14, 2026:

| Area | Implemented evidence |
| --- | --- |
| Delivery phases | SP0 through SP5 complete |
| Skill catalog | 14 immutable registered Skill packages covering the initial representative taxonomy |
| Governed adapters | 30 versioned adapters bound to existing canonical operations and domain owners |
| Active consumers | Ask, Concierge Home, and Home Actions; Concierge Home and Home Actions invoke Property Record reads through the consumer-governed Skill runtime |
| Routing | Deterministic operation ownership, versioned local semantic index, bounded candidate ranking, and fail-closed clarification; no LLM or embedding routing call |
| Context | Registered provider contracts, bounded composition, authorization propagation, deduplication, provenance, freshness/conflict handling, timeout, and degraded-mode behavior |
| Runtime controls | Global Ask, Consumer, Domain, Skill, Operation, Context Provider, Adapter, and Narrative Synthesis controls are live; manifest feature-flag and kill-switch names are validated runtime bindings |
| Evaluation | Every registered Skill has immutable routing, operation, ambiguity, policy, context, negative, degraded-mode, model-disabled, handoff, and performance fixtures |
| Package scaffolding | Generated manifests retain only versioned adapter references; generated evaluation packages are deeply immutable |
| Verification | 168 Ask tests passing, TypeScript validation passing, and taxonomy expansion verified without Skill-specific core-router branches |
| Database impact | No database schema change or migration script required by the completed Skill Platform slices |
| Deferred boundaries | External connectors and model-assisted routing remain unimplemented until a concrete requirement introduces their governed runtimes |

---

## 2. Development posture

### 2.1 Beta assumptions

AI Home Concierge / Ask remains in beta and has no real users. Therefore:

- this work is an architectural refactor, not a customer migration;
- existing beta abstractions may be removed or reshaped when superseded;
- no dual-running period is required solely for backward compatibility;
- no customer cohort, production launch gate, general-availability approval, or user-data migration is required by this FRD;
- synthetic fixtures and test properties shall be used for development and evaluation;
- implementation shall optimize for a clean long-term architecture and fast delivery; and
- canonical domain services and persisted domain truth shall still be protected from accidental duplication or corruption.

### 2.2 Non-blocking internal review

Architecture, product, domain, privacy, security, UX, and operations review may occur continuously and may produce follow-up work. Internal review shall not block ordinary development of the beta platform.

Development is blocked only by mechanically enforceable conditions required for correctness, including:

- invalid schemas or manifests;
- failing automated tests;
- unauthorized data access;
- violation of canonical domain ownership;
- unsafe or unconfirmed material writes;
- circular executable dependencies;
- incompatible registered versions; or
- unresolved defects that make the current development slice incorrect.

Approval workflows, committee certification, launch sign-offs, cohort rollout, and production-readiness gates are outside this FRD. Before real-user use or external delivery begins, a separate readiness amendment may define the applicable operational, privacy, security, and launch requirements.

### 2.3 No migration program

This FRD contains no user migration, rollout cohort, legacy compatibility period, or launch rollback program. Existing Ask operation implementations may be reused inside Skills, but the central Ask architecture may be refactored directly because the product is not serving real users.

Data-schema changes required by the refactor shall use normal repository schema-change practices. They are implementation changes, not customer migrations.

---

## 3. Normative relationship and precedence

### 3.1 Parent contracts

This FRD extends the two parent Ask documents. It does not weaken their established runtime contracts for:

- durable `AskSession` and `AskExecution` state;
- backend-owned execution-state transitions;
- deterministic-first routing and execution;
- registered, versioned operations;
- typed response blocks;
- Property Context capture and automatic resume;
- entity and intent clarification;
- authorization, confirmation, idempotency, and freshness checks;
- canonical service ownership;
- model boundaries;
- professional boundaries and grounded evidence;
- retention, redaction, and audit;
- Decision Threads, Scenarios, Recommendation Snapshots, Home Actions, Home Signals, preferences, and outcome lineage; and
- failure isolation, kill switches, and degraded behavior.

### 3.2 Conflict rule

When contracts conflict, precedence is:

1. canonical domain ownership and data-integrity rules;
2. authorization, safety, confirmation, consent, and privacy enforcement;
3. this Skill Platform FRD for Skill-specific behavior;
4. parent Ask and intelligence behavior not explicitly amended here; and
5. human-readable `SKILL.md` guidance.

`SKILL.md` shall never override executable policy.

### 3.3 Terminology

- **Domain:** A broad ContractToCozy business area.
- **Skill:** A versioned homeowner capability containing one or more governed operations.
- **Operation:** A bounded executable Ask capability with an input, policy, adapter, and typed result contract.
- **Tool:** A technical capability available to an allowed operation.
- **Adapter:** A stable boundary from an operation to a canonical service or approved external connector.
- **Context provider:** A registered, authorization-aware producer of bounded typed context.
- **Consumer:** A ContractToCozy experience permitted to discover or invoke a Skill operation.
- **Canonical service:** The authoritative owner of a domain fact, calculation, command, workflow, or artifact.
- **Material operation:** An operation that can meaningfully affect safety, finances, coverage, legal/tax posture, household access, external communication, spending, or a durable home record.

---

## 4. Existing functionality baseline

The Skill Platform shall build on the following repository functionality documented as implemented in Ask Redo v1.6:

- durable sessions, executions, events, clarifications, captures, confirmations, and receipts;
- deterministic operation routing before optional model classification;
- a versioned operation registry with validation and evaluation fixtures;
- property selection and property-scoped authorization;
- owner, contributor, and viewer enforcement;
- typed result blocks and safe unsupported-block behavior;
- canonical inline capture, context-version checks, and automatic resume;
- durable ambiguity clarification and fail-closed entity resolution;
- idempotent confirmation and canonical mutation recovery;
- operation, remote-generation, and global kill switches;
- bounded telemetry, metrics, alerts, retention, and deletion;
- deterministic functionality during model outage; and
- current registered operation families including maintenance, coverage, Home Actions, savings, inventory, property summary, ownership cost, sell/hold/rent, refinance, household, repair/replace, capital planning, property tax, renovation, major-event entry, capability discovery, monitors, and bounded home guidance.

The intelligence amendment additionally defines canonical contracts for:

- Decision Threads;
- typed preferences;
- registered Decision Context composition;
- Scenarios;
- Recommendation Snapshots;
- logical Home Intelligence Graph reads;
- Change Intelligence;
- canonical Home Actions ranking;
- proactive continuity; and
- verified outcomes.

The Skill Platform shall reference these capabilities. It shall not create competing stores or engines for them.

---

## 5. Problem statement

The current operation registry provides a strong execution abstraction, but direct growth of a flat catalog creates long-term pressure in:

- semantic routing across similar operations;
- discoverability of coherent homeowner capabilities;
- ownership and documentation;
- context-provider access;
- consumer-specific availability;
- dependency and version management;
- evaluation and conflict detection;
- feature controls and observability; and
- addition of new capabilities without edits to central Ask logic.

Registering hundreds of operations directly against one central router would cause the Concierge to accumulate domain-specific knowledge and make semantic conflicts harder to detect.

The platform needs an intermediate capability abstraction that preserves the proven operation execution model while reducing central orchestration complexity.

---

## 6. Product goals and success measures

### 6.1 Goals

The Skill Platform shall:

- organize operations around coherent homeowner outcomes;
- make capability ownership and semantic scope explicit;
- support hierarchical Domain → Skill → Operation routing;
- keep operation execution deterministic-first and backend governed;
- allow new Skills to register without capability-specific central-router code;
- compose only declared, bounded, authorized context;
- prevent uncontrolled peer Skill execution;
- support independent Skill versioning, testing, enablement, and disabling;
- preserve canonical sources of truth;
- support existing Ask execution, capture, confirmation, and response contracts;
- support future ContractToCozy consumers without automatically broadening permissions;
- provide machine-readable policy and human/AI-readable documentation;
- expose clear runtime lineage and health; and
- enable fast development through templates, validation, and reusable contracts.

### 6.2 Development success measures

The foundation is successful when:

- a new read-only Skill can be added through a Skill package and registration export without editing core routing or execution implementation;
- a new operation can be added to an existing Skill without scanning or modifying unrelated Skills;
- invalid dependencies, adapters, providers, result blocks, versions, or policies fail CI or startup deterministically;
- deterministic operations remain usable with all model features disabled;
- disabling one Skill leaves unrelated Skills functional;
- no Skill can access an adapter or provider that its manifest does not allow;
- skill ambiguity returns clarification instead of silent execution;
- material operations retain existing confirmation, authorization, freshness, and idempotency behavior; and
- a fourth representative Skill can be added after the foundation without changing the Skill Router implementation.

### 6.3 Version 1 product emphasis

Version 1 is functionality-led. Its purpose is to establish the complete, usable Skill architecture and representative end-to-end capabilities, not to build an advanced performance-optimization platform before runtime behavior is measured.

Version 1 shall retain only the structural safeguards needed to avoid an inherently inefficient design:

- static manifest validation at build or startup rather than per request;
- in-process registration and direct internal adapters;
- deterministic-first routing with bounded model fallback;
- operation-specific context retrieval rather than loading every provider declared by a Skill;
- hard context, payload, provider-timeout, and execution-timeout limits;
- no duplicate invocation of the same provider request within one composition;
- optional-provider failure isolation;
- no recursive Skill execution; and
- basic timing visibility and performance smoke tests.

Missing an aspirational latency objective shall not block unrelated Version 1 functional development unless the regression makes the affected journey unusable or reveals an unbounded execution pattern.

### 6.4 Non-goals

The platform shall not:

- replace canonical domain services or the Living Home Record;
- replace `AskExecution`, `AskSession`, Decision Threads, Property Context, Home Actions, or domain workflows;
- expose arbitrary database tables, files, URLs, code execution, or shell access;
- create a generic autonomous-agent runtime;
- allow recursive agent-to-agent or Skill-to-Skill orchestration;
- permit user-installed or unrestricted third-party code;
- infer runtime capability availability from model knowledge;
- require MCP for internal in-process capability access;
- make Markdown executable policy;
- create a second capability registry for user-visible product destinations;
- require a graph database, vector database, or separate runtime service without measured need;
- implement speculative caching, routing partitioning, workload isolation, or distributed performance infrastructure in Version 1; or
- add launch governance, customer migration, or approval gates to beta development.

---

## 7. Governing architecture principles

1. Skills represent homeowner capabilities, not implementation functions.
2. Canonical domain services remain authoritative.
3. Skills group and constrain operations; they do not replace operation governance.
4. Ask owns orchestration; Skills do not become autonomous agents.
5. Context is composed through registered providers; Skills do not query arbitrary storage.
6. A Skill may suggest a next capability but may not execute a peer Skill.
7. Internal integration uses governed adapters; external connectors are exceptional boundaries.
8. Machine contracts enforce behavior; documentation explains it.
9. Effective permission is the intersection of consumer, Skill, operation, provider, adapter, and canonical-service policy.
10. The most restrictive applicable policy wins.
11. Unknown, unavailable, stale, conflicting, false, and zero remain distinct states.
12. A scenario is not a fact, a change is not an action, and a recommendation is not an outcome.
13. Model output cannot establish availability, authorization, canonical truth, completion, or permission to mutate.
14. The architecture shall favor static registration, typed contracts, and in-process boundaries until measured requirements justify distribution.

---

## 8. Capability taxonomy

### 8.1 Hierarchy

```text
DOMAIN
  └── SKILL
        └── OPERATION
              └── ADAPTER / TOOL
                    └── CANONICAL SERVICE
```

### 8.2 Initial domains

- `HOME_CARE`
- `HOME_PROTECTION`
- `HOME_FINANCE`
- `HOME_TRANSACTION`
- `HOME_PROJECTS`
- `HOME_INTELLIGENCE`
- `HOUSEHOLD`

### 8.3 Skill admission rubric

A capability qualifies as a Skill only when it has:

- a stable homeowner outcome;
- a coherent semantic scope and explicit exclusions;
- one accountable owner;
- one or more independently valuable operations;
- shared context and policy characteristics;
- representative homeowner language;
- an evaluation boundary; and
- no need to act primarily as implementation infrastructure for other Skills.

Monitoring infrastructure, context retrieval, priority ranking, notification delivery, and graph reads shall remain platform services unless they independently satisfy the homeowner-outcome rubric.

### 8.4 Initial representative Skills

This table is the directional product taxonomy, not a requirement to implement every row in Version 1. Version 1 shall implement the Skills named in §29 plus any additional Skills needed to prove catalog extensibility and multi-surface access. Remaining rows are admitted incrementally when their canonical capability is ready and they satisfy the Skill admission rubric; absence of an unadmitted row is not a platform-completeness defect.

Current implementation evidence: all fourteen representative rows are registered as immutable Skill packages backed by existing canonical operations and governed adapters. This implementation status does not change the admission rule or require future taxonomy rows to be created before their canonical capability exists.

| Domain | Skill | Representative operations |
| --- | --- | --- |
| `HOME_CARE` | Maintenance | status, create, complete, update, monitor |
| `HOME_CARE` | Repair or Replace | analyze, scenario, explain recommendation change |
| `HOME_CARE` | Capital Planning | upcoming expenses, reserve gap, replacement timeline |
| `HOME_PROTECTION` | Coverage | review, gaps, expiration, evidence readiness |
| `HOME_FINANCE` | Refinance | analyze, scenario, threshold monitor |
| `HOME_FINANCE` | Ownership Cost | monthly cost, annual cost, category analysis |
| `HOME_FINANCE` | Savings | opportunities, rebates, benefits, optimization |
| `HOME_FINANCE` | Property Tax | assessment readiness, appeal readiness |
| `HOME_TRANSACTION` | Seller Preparation | readiness, repair priority, major-event entry |
| `HOME_TRANSACTION` | Sell/Hold/Rent | analyze, scenario |
| `HOME_PROJECTS` | Renovation | readiness, project context, permit readiness |
| `HOME_PROJECTS` | Quote Comparison | create workspace, review, compare |
| `HOME_INTELLIGENCE` | Property Record | summary, completeness, timeline, inventory lookup |
| `HOUSEHOLD` | Household | membership summary, invite, role information |

Change Intelligence and Priority Intelligence remain orchestrator/read-platform capabilities initially. Their user-facing operations may later be assigned to a Skill if the admission rubric is satisfied.

---

## 9. Skill package contract

Each Skill shall have a logical package:

```text
skills/<skill-id>/
  SKILL.md
  skill.manifest.ts
  index.ts
  operations/
  context/
  adapters/
  policies/
  presentation/
  evals/
```

Physical folders may follow monorepo conventions, but every logical responsibility shall be represented.

### 9.1 `SKILL.md`

`SKILL.md` shall document:

- purpose and homeowner outcome;
- supported homeowner jobs and goals;
- representative language;
- selection and exclusion guidance;
- operations;
- required and optional context;
- output expectations;
- safety and professional boundaries;
- related capabilities;
- representative conversations; and
- evaluation expectations.

It shall not authorize adapters, writes, connectors, context access, rollout, or execution.

### 9.2 Machine manifest

The initial contract shall include equivalent typed concepts to:

```ts
interface SkillDefinition {
  id: string;
  version: string;
  domain: SkillDomain;
  displayName: string;
  description: string;
  homeownerJobs: HomeownerJob[];
  supportedGoals: string[];
  aliases: string[];
  operations: SkillOperationReference[];
  requiredContextProviders: ContextProviderReference[];
  optionalContextProviders: ContextProviderReference[];
  allowedAdapters: AdapterReference[];
  allowedExternalConnectors: ConnectorReference[];
  consumerPolicy: SkillConsumerPolicy;
  riskPolicy: SkillRiskPolicy;
  authorizationFloor: HouseholdRole;
  allowedResultBlocks: AskResultBlockType[];
  dependencies: SkillDependency[];
  contextBudget: SkillContextBudget;
  evaluationSuite: string;
  featureFlag: string;
  killSwitch: string;
  owner: string;
  lifecycleStatus: SkillLifecycleStatus;
  operationalStatus: "ENABLED" | "DISABLED";
}
```

Typed references shall be preferred over unrestricted strings.

### 9.3 Lifecycle and operational state

Lifecycle state and operational state are separate:

```text
DRAFT → DEVELOPMENT → ACTIVE → DEPRECATED → RETIRED
```

`ENABLED` or `DISABLED` may apply independently to any non-retired lifecycle state.

Because this FRD governs beta development, lifecycle states describe code maturity and intended use; they are not approval or launch gates.

---

## 10. Registry architecture

### 10.1 Skill Registry ownership

The `SkillRegistry` is the authoritative runtime catalog for executable homeowner capabilities.

It owns:

- Skill identity and version;
- semantic scope and supported goals;
- operation membership;
- consumer eligibility;
- declared context, adapters, dependencies, and outputs;
- runtime enabled state;
- health summary; and
- evaluation metadata.

It does not own product navigation, operation execution, domain calculations, canonical data, or context-provider implementation.

### 10.2 Registry boundaries

| Registry | Authority |
| --- | --- |
| Capability Registry | User-visible product destinations, availability, readiness, and launch context |
| Skill Registry | Executable homeowner-capability identity, semantics, grouping, and Skill policy |
| Ask Operation Registry | Operation execution contract, mutation policy, adapter, schemas, timeout, and result contract |
| Context Provider Registry | Bounded context retrieval contracts and provider versions |
| Adapter/Tool Registry | Approved technical access to canonical services |
| Connector Registry | Approved external-provider access and transmission policy |

A Skill may reference a Capability Registry entry. It shall not copy the entry or become a competing navigation source.

### 10.3 Registration model

Initial registration shall be code-owned, statically discoverable at build/startup, and deterministic. Runtime database discovery is not required.

Definitions are immutable by version. Dynamic health, feature flags, and kill-switch state are evaluated separately from immutable definitions.

### 10.4 Registration validation

CI and application startup shall reject:

- duplicate Skill IDs and duplicate active versions;
- invalid semantic versions;
- missing operations or incompatible operation versions;
- unregistered adapters, providers, connectors, blocks, or consumers;
- missing owner, evaluation suite, feature flag, or kill switch;
- undeclared material-operation policy;
- invalid authorization or risk policy;
- dependency cycles;
- dependencies on executable peer Skills;
- context budgets above platform maxima; and
- manifest exports that differ from their runtime registration.

Documentation differences may produce a non-blocking warning unless they imply a missing machine contract. Executable policy remains authoritative.

---

## 11. Routing and discovery

### 11.1 Hierarchical routing

The routing cascade shall be:

1. deterministic safety and boundary interception;
2. existing high-confidence deterministic operation rules;
3. deterministic Skill candidate generation from registered goals, aliases, entities, launch context, and Decision Thread context;
4. policy, consumer, authorization, dependency, and availability filtering;
5. bounded classification from versioned, reviewed Skill metadata when deterministic confidence is insufficient;
6. Skill selection;
7. operation selection within the Skill; and
8. concise clarification when material ambiguity remains.

The router selects; it does not execute or calculate domain results.

### 11.2 Routing result

Each routing result shall record:

```text
skillCandidates[]
selectedSkillId/version nullable
skillConfidence
operationCandidates[]
selectedOperationId/version nullable
operationConfidence
routingPath
routingReasonCodes[]
clarificationReason nullable
```

Allowed terminal routing outcomes include:

- `RESOLVED`
- `AMBIGUOUS_SKILL`
- `AMBIGUOUS_OPERATION`
- `UNSUPPORTED`
- `BLOCKED`
- `UNAVAILABLE`

### 11.3 Ambiguity

Material ambiguity shall fail closed. Recency, raw chat, or a model guess alone shall not select a property, entity, Decision Thread, material Skill, or write target.

### 11.4 Semantic index

A semantic index may be generated only from registered Skill metadata and reviewed examples. It is a routing aid, not a capability source.

The index shall record its build version and Skill-definition versions. A stale or unavailable index shall degrade to deterministic routing and clarification.

Version 1 classification shall remain deterministic and locally executable; material ambiguity shall go to clarification. Model- or embedding-assisted classification is optional and deferred until measured routing quality demonstrates a concrete need, with a separately reviewed evaluation, cost, privacy, and kill-switch design. The platform Definition of Done does not require an LLM call.

### 11.5 Capability discovery

Ask shall recommend a Skill only after confirming:

- it is registered and enabled;
- the consumer is permitted;
- the selected property is supported;
- the user satisfies discovery visibility policy;
- dependencies are healthy enough for the declared behavior; and
- a referenced product capability and destination are available when a destination is presented.

---

## 12. Operation execution

`AskOperationDefinition` remains the authoritative execution abstraction.

The Skill Platform shall add Skill identity and effective-policy resolution without weakening operation requirements for:

- parameter and result schemas;
- scope and entity types;
- canonical owner and executor adapter;
- mutation and confirmation policy;
- supported roles;
- safety and professional boundaries;
- deterministic eligibility and synthesis policy;
- timeout and idempotency; and
- evaluation fixtures.

An execution shall bind the resolved Skill and operation versions before context composition. Runtime registration changes shall not silently change an in-flight execution.

Material confirmation shall bind:

- Skill version;
- operation version;
- effective policy version;
- input and context digest/version;
- target property and entity;
- exact action payload;
- confirmation version and expiry; and
- idempotency key.

A mismatch at confirmation shall expire or refresh the action rather than execute a changed command.

---

## 13. Context Provider architecture

### 13.1 Provider contract

Skills shall obtain cross-domain information through registered `SkillContextProvider` contracts.

Each provider shall declare:

- stable ID and immutable schema version;
- canonical owner;
- input and output schemas;
- supported property and entity scope;
- authorization propagation;
- sensitivity and redaction policy;
- freshness and expiry behavior;
- cache scope and invalidation;
- timeout and maximum payload;
- provenance format;
- unknown, stale, unavailable, and conflict behavior; and
- evaluation fixtures.

### 13.2 Composition

The Decision Context Composer shall:

- invoke only manifest-declared providers;
- recheck property and role access;
- execute independent providers in parallel where safe;
- deduplicate identical reads within one execution;
- retrieve providers required by the selected operation and its current requirement state rather than eagerly loading every provider allowed by the Skill;
- enforce fact, entity, document, history-event, byte, latency, and cost budgets;
- preserve source, version, freshness, confidence, sensitivity, and evidence metadata;
- distinguish canonical facts, preferences, scenarios, and assumptions;
- cancel remaining work when the overall execution is no longer valid; and
- return a typed context DTO to the operation.

### 13.3 Missing and degraded context

Provider results shall distinguish:

- `AVAILABLE`
- `UNKNOWN`
- `STALE`
- `CONFLICTING`
- `UNAUTHORIZED`
- `UNAVAILABLE`
- `TIMED_OUT`
- `NOT_APPLICABLE`

Required context follows the registered operation policy:

- required safety/applicability/calculation context blocks or requests capture;
- optional enhancer failure is omitted and disclosed;
- stale material data is refreshed, disclosed, or blocked according to contract; and
- conflicting data shall not be silently resolved by a model.

### 13.4 No arbitrary data access

Skill code shall not directly query arbitrary application tables. Direct ORM access is permitted only inside the owning canonical domain implementation, not in Skill orchestration code.

Large property records, raw document collections, and unrestricted graph neighborhoods shall never be serialized wholesale.

---

## 14. Dependencies and Skill handoff

### 14.1 Prohibited peer execution

A Skill shall not directly invoke another Skill or recursively route through the Skill Platform.

### 14.2 Allowed dependencies

Dependencies shall target explicit contracts:

- `CONTEXT_PROVIDER`
- `OPERATION_CONTRACT`
- `CANONICAL_SERVICE_CAPABILITY`
- `PLATFORM_CAPABILITY_AVAILABILITY`
- `WORKFLOW_PRECONDITION`
- `PRESENTATION_CAPABILITY`

A peer Skill ID may be recorded as a catalog relationship or suggestion but shall not be an executable dependency.

### 14.3 Handoff

A Skill result may return:

```text
suggestedNextSkillId
suggestedGoal
reasonCodes[]
contextReferenceIds[]
```

Ask owns the transition and shall reapply normal discovery, authorization, routing, and ambiguity policy before the suggested Skill is used.

Decision Threads may record primary and related Skills for lineage. Related Skills do not imply runtime chaining.

---

## 15. Authorization, risk, confirmation, and consumers

### 15.1 Effective policy

Effective execution policy is the intersection of:

- consumer policy;
- Skill policy;
- operation policy;
- provider policy;
- adapter or connector policy;
- canonical-service policy; and
- current property/household authorization.

No layer may broaden the permissions of a stricter layer.

### 15.2 Risk model

Risk shall use composable dimensions rather than one ambiguous severity enum:

```text
effect: READ | WRITE | EXTERNAL_TRANSMISSION
materiality: LOW | MATERIAL | CRITICAL
riskDomains[]: HOME_SAFETY | FINANCIAL | COVERAGE | TAX_LEGAL |
               HOUSEHOLD_SECURITY | PRIVACY | EXTERNAL_COMMUNICATION
reversibility: REVERSIBLE | PARTIALLY_REVERSIBLE | IRREVERSIBLE
```

### 15.3 Confirmation

Existing Ask prepare → review → confirm → recheck → claim → mutate → artifact behavior remains authoritative.

No Skill may treat unrelated conversational assent as confirmation, bypass freshness checks, or execute a material write selected solely by a model.

### 15.4 Consumer policy

Every Skill shall declare operations allowed per consumer, for example:

```text
ASK: status, create
HOME_ACTIONS: status
CONCIERGE_HOME: status, recommend
PROACTIVE: recommend
NOTIFICATION_CONTINUATION: status
```

Consumer eligibility does not replace user authorization. A consumer receives only the operations explicitly allowed to it.

---

## 16. Adapters, tools, and external connectors

### 16.1 Internal boundary

Internal operations shall normally use direct, governed in-process adapters to canonical services. An internal network or MCP hop shall not be added solely for architectural symmetry.

### 16.2 Adapter requirements

Each adapter shall declare:

- stable ID and version;
- canonical owner;
- allowed operations;
- input/output schemas;
- authorization behavior;
- timeout and retry safety;
- idempotency behavior for mutations;
- error mapping; and
- health contract.

### 16.3 External connector requirements

An external connector shall additionally declare:

- provider and credentials owner;
- allowed transmitted data classes;
- consent requirements;
- rate limits and quotas;
- cache and freshness policy;
- circuit breaker and failure behavior;
- privacy and retention policy; and
- permitted Skills and operations.

External connector failure shall not disable unrelated functionality. External MCP integration is optional and shall be introduced only for a concrete product need.

Partner Skills and external exposure of ContractToCozy Skills are future scope.

---

## 17. Versioning and compatibility

### 17.1 Versioning units

Skills, operations, providers, adapters, schemas, policies, semantic indexes, and presentation blocks shall be independently versioned.

Breaking Skill changes include:

- removed or semantically reassigned operations;
- incompatible supported-goal changes;
- more restrictive authorization affecting existing callers;
- incompatible context meaning;
- incompatible output contract; or
- persisted-lineage changes that cannot be read by the prior major version.

### 17.2 Dependency resolution

Manifest dependencies shall use either an exact version or an explicitly supported compatible range. Runtime activation shall resolve a deterministic version set at startup.

Activation fails when a required version cannot be resolved. Optional dependencies follow declared degraded behavior.

### 17.3 In-flight execution pinning

Executions, clarifications, captures, and confirmations shall remain pinned to their bound contract versions. If a compatible version is no longer executable, the execution shall return `EXPIRED` or `UNAVAILABLE` with a safe restart path.

### 17.4 Historical lineage

Retired definitions shall remain resolvable as minimized historical metadata for execution, recommendation, and outcome lineage. Retirement shall not require keeping executable code active indefinitely.

---

## 18. Runtime states, health, and kill switches

### 18.1 Health

Skill health shall be derived from registration validity and required dependency health. It shall distinguish:

- `HEALTHY`
- `DEGRADED`
- `UNAVAILABLE`
- `DISABLED`

### 18.2 Kill-switch hierarchy

The following controls may exist:

```text
Global Ask
Consumer
Domain
Skill
Operation
Context Provider
Adapter
External Connector
LLM Routing
Narrative Synthesis
```

The most restrictive active switch wins.

Version 1 shall make Global Ask, Consumer, Domain, Skill, Operation, Context Provider, Adapter, and Narrative Synthesis controls live where the corresponding runtime exists. A Skill's manifest-declared feature-flag and kill-switch names are authoritative runtime bindings and shall be unique and validated. External Connector and LLM Routing controls become mandatory only when those optional runtimes are introduced; their absence before then shall not create inert placeholder behavior.

Disabling a Skill shall:

- remove it from new routing and discovery candidates;
- prevent new executions;
- preserve historical reads and lineage;
- prevent pending material confirmation unless an explicit safe-completion policy exists;
- leave unrelated Skills operational; and
- return a typed `UNAVAILABLE` state with an appropriate alternative when possible.

Monitor or workflow artifacts already created remain governed by their canonical owner. Disabling a Skill does not silently delete or disable canonical artifacts.

---

## 19. Ask API, persistence, and response contracts

### 19.1 Execution response extension

The existing Ask response shall add:

```ts
skill?: {
  id: string;
  version: string;
  domain: string;
} | null;
```

The existing operation, context, blocks, capture, clarification, confirmation, and suggestion fields remain authoritative.

### 19.2 Execution persistence

`AskExecution` or its typed metadata shall record:

- Skill ID and version;
- operation ID and version;
- routing path, confidence, and reason codes;
- effective policy version/digest;
- context-provider IDs and versions;
- adapter and connector IDs/versions where permitted;
- semantic-index/model version when used;
- dependency state;
- result status; and
- safe lineage references.

Raw model reasoning, unrestricted prompts, raw document contents, and unnecessary sensitive values shall not be stored.

### 19.3 Existing statuses and blocks

The Skill Platform shall reuse the parent Ask execution statuses and typed presentation blocks. Intelligence blocks such as `WHY_NOW`, `CHANGE_SUMMARY`, `PRIORITY_LIST`, `SCENARIO_COMPARISON`, `DECISION_PROGRESS`, `PREFERENCE_REFERENCE`, `OUTCOME_SUMMARY`, and `RECOMMENDATION_CHANGE` remain governed by their parent contracts.

Skills shall declare allowed blocks. The renderer shall reject undeclared or unsupported blocks visibly and safely.

### 19.4 Error codes

Add stable codes where needed:

- `ASK_SKILL_UNSUPPORTED`
- `ASK_SKILL_AMBIGUOUS`
- `ASK_SKILL_DISABLED`
- `ASK_SKILL_DEPENDENCY_UNAVAILABLE`
- `ASK_SKILL_VERSION_UNAVAILABLE`
- `ASK_SKILL_POLICY_MISMATCH`
- `ASK_CONTEXT_PROVIDER_UNAVAILABLE`
- `ASK_CONTEXT_BUDGET_EXCEEDED`

Clients shall depend on stable codes, not domain-specific diagnostic strings.

---

## 20. LLM boundaries

Models may assist with:

- semantic candidate ranking;
- ambiguous homeowner-language interpretation;
- entity/reference candidate generation;
- clarification wording; and
- optional narrative synthesis from validated results.

Models may not decide or establish:

- Skill or operation registration;
- availability or enabled state;
- authorization or consent;
- adapter, provider, connector, or tool access;
- canonical facts or writes;
- whether a material operation requires confirmation;
- external transmission permission;
- whether an operation completed; or
- a new persistent Skill, graph edge, policy, outcome, or recommendation truth.

All deterministic paths shall remain functional when local and remote models are unavailable.

---

## 21. Observability and analytics

Every execution shall emit bounded telemetry for:

```text
skillId/version
operationId/version
consumer
routingPath
skillConfidenceBand
operationConfidenceBand
routingReasonCodes
contextProviderIds/versions/statuses
dependencyStatus
effectiveRiskPolicy
executionMode
routingLatencyBand
contextCompositionLatencyBand
providerLatencyBands
adapterLatencyBand
canonicalOperationLatencyBand
presentationLatencyBand
totalLatencyBand
modelUsage/costBand
resultStatus
errorCode
```

Telemetry shall not contain raw questions, addresses, account values, rates, premiums, policy numbers, emails, preference values, scenario values, document contents, or unrestricted context.

Track:

- executions and success by Skill;
- skill and operation ambiguity;
- clarification rate;
- transitions and suggested handoffs;
- routing accuracy;
- context completeness and provider failure;
- authorization and policy rejection;
- latency and reliability;
- model-call rate and cost;
- repeated-question rate;
- typed degraded outcomes; and
- linked verified outcomes where the canonical outcome contract permits.

Critical authorization, privacy, confirmation, or safety failures are independent defects and shall not be averaged into a general quality score.

---

## 22. Performance, reliability, and cost

### 22.1 Version 1 posture

Version 1 shall establish bounded execution and enough measurement to identify genuine bottlenecks. It shall not require advanced caching, adaptive scheduling, workload partitioning, or performance infrastructure before the functional platform is proven.

The following values are design objectives and smoke-test reference points, not beta launch gates:

| Component | Initial objective |
| --- | --- |
| In-process Skill Registry lookup | p95 ≤ 25 ms |
| Deterministic Skill candidate generation and filtering | p95 ≤ 100 ms |
| Skill plus deterministic operation selection | Must preserve parent Ask deterministic routing budget where possible |
| Context composition overhead | p95 ≤ 500 ms for the initial bounded slice, excluding canonical engine execution |
| Semantic fallback | Bounded timeout; deterministic fallback and clarification remain available |

Performance tests shall report Skill-layer overhead separately from canonical operation execution.

A missed objective shall be recorded with the affected component and measured result. It blocks the affected Version 1 slice only when it causes an unusable journey, violates an existing parent Ask timeout, or demonstrates unbounded routing, payload, provider fan-out, or model use.

### 22.2 Reliability

- Invalid registration fails startup clearly.
- One Skill failure shall not crash Ask or poison other registry entries.
- Timeouts and circuit breakers apply per dependency.
- Optional dependency failure follows declared degraded behavior.
- Required dependency failure returns typed `UNAVAILABLE` or blocked behavior.
- Retries occur only for safe idempotent operations.
- Duplicate canonical writes remain prohibited.
- Registry version sets are immutable for the process lifetime or changed through an atomic reload contract.
- No request shall observe a partially updated registry.

### 22.3 Cost and payload limits

- Every Skill declares context and optional-model budgets.
- The composer shall prevent N+1 and duplicate canonical reads where possible.
- Model prompts shall contain only the minimum permitted typed context.
- Remote routing and synthesis are independently disableable.
- A budget overrun returns a bounded degraded result; it does not expand context automatically.

### 22.4 Version 2 performance optimization

Version 2 shall optimize measured bottlenecks after Version 1 supplies representative Skills and timing evidence. Candidate Version 2 work includes:

- sophisticated request-scoped and cross-request caching;
- provider query-plan generation and adaptive scheduling;
- formal semantic-routing candidate ceilings and index partitioning;
- advanced provider concurrency and fan-out control;
- consumer-specific quotas and workload isolation;
- per-Skill capacity planning and operation-family performance thresholds;
- large-property load, stress, and soak suites;
- telemetry sampling and cost optimization;
- automated performance-regression enforcement by operation family; and
- distributed cache or routing infrastructure if measurements justify it.

Version 2 shall select from this list using Version 1 telemetry and profiling. These capabilities shall not be implemented merely for architectural completeness.

---

## 23. Developer experience

Provide a reusable Skill template and generator or equivalent documented workflow.

The template shall include:

- `SKILL.md` outline;
- typed manifest;
- registration export;
- sample operation reference;
- context and adapter declarations;
- policy placeholders;
- routing, operation, ambiguity, authorization, negative, and degraded-mode fixtures; and
- validation commands.

A developer shall be able to answer from the package alone:

- what homeowner outcome the Skill owns;
- when it should and should not route;
- what operations and consumers are allowed;
- what context and adapters it may access;
- what risks and confirmation rules apply;
- what outputs it may return; and
- how correctness is evaluated.

Generated catalog documentation should combine manifest, operation metadata, evaluation metadata, and `SKILL.md` while clearly marking machine-authoritative fields.

---

## 24. Testing and evaluation

### 24.1 Required test layers

- manifest and schema tests;
- deterministic registration and dependency-resolution tests;
- Skill routing and operation routing tests;
- semantic-overlap and conflict tests;
- context-provider authorization and budget tests;
- adapter and canonical-service contract tests;
- consumer-policy tests;
- owner/contributor/viewer/no-access tests;
- confirmation pinning, idempotency, concurrency, and stale-version tests;
- negative, prompt-injection, external-transmission, and privacy tests;
- typed presentation and unsupported-block tests;
- timeout, partial-failure, restart, and kill-switch tests;
- model-disabled fallback tests; and
- basic performance smoke tests that separate Skill-layer overhead from canonical execution; and
- representative end-to-end journeys.

### 24.2 Every Skill evaluation package

Every Skill shall include:

- exact and paraphrased homeowner language;
- colloquial phrasing and misspellings;
- positive, negative, and exclusion examples;
- ambiguous Skill and ambiguous operation cases;
- known, missing, stale, conflicting, unauthorized, and unavailable context;
- entity, property, and Decision Thread ambiguity;
- expected and prohibited providers/adapters;
- expected statuses and typed blocks;
- expected canonical calls and prohibited calls;
- continuation and handoff examples;
- model-disabled behavior; and
- one bounded functional performance fixture; broader load and regression suites may be added in Version 2.

### 24.3 Initial measurable targets

For the maintained certified fixture set:

- deterministic legacy operation behavior for represented capabilities: 100% expected-operation parity unless intentionally changed in this refactor;
- critical authorization, cross-property access, unconfirmed material mutation, and prohibited external transmission failures: zero;
- manifest and dependency invalid cases rejected: 100%;
- material ambiguous cases producing clarification or safe block: 100%;
- declared-adapter/provider allowlist enforcement: 100%;
- Skill routing top-1 accuracy on unambiguous registered fixtures: ≥95%;
- unsupported requests incorrectly executed as a Skill: 0%; and
- model-disabled deterministic fixture pass rate: 100%.

These are development quality targets, not launch gates. A failing target creates an engineering defect or documented limitation; it does not require committee approval to continue unrelated development.

Version 1 performance smoke tests verify bounded behavior and guard against obvious architectural regression. They do not require statistically significant production-scale p95 certification. Version 2 may establish operation-family performance gates after representative workloads exist.

---

## 25. Implementation plan

The phases are dependency-ordered development slices, not migration or launch stages. Work may overlap when contracts are stable.

### Phase SP0 — Contracts and static registry

**Status: Complete.** Implemented evidence includes the typed contracts, static registry, deterministic version resolution, startup validation, package scaffolder, effective-policy resolver, execution telemetry identity, and registered read operations.

Deliver:

- Skill types, lifecycle, risk, consumer, dependency, and context-budget contracts;
- static Skill Registry and deterministic version resolution;
- startup and CI validation;
- standard package template and `SKILL.md` specification;
- effective-policy resolver;
- Skill identity on execution telemetry; and
- one small read-only reference Skill proving registration and invocation.

Completion evidence:

- invalid definitions fail deterministic tests;
- a registered Skill resolves without a model;
- no central router change is required to add a second fixture Skill; and
- existing Ask operation execution remains functional.

### Phase SP1 — Maintenance vertical slice

**Status: Complete.** Maintenance status, create, complete, update, and monitor operations retain their canonical implementations while using Skill policy, authorization, confirmation, context, telemetry, and runtime controls.

Represent Maintenance as the first full Skill using existing operation behavior:

- status;
- create task;
- complete task;
- update task; and
- monitor.

This slice shall prove reads, writes, entity clarification, inline capture, authorization, confirmation, freshness, idempotency, monitoring, typed outputs, consumer policy, telemetry, and Skill disabling.

Because there are no real users, obsolete Maintenance-specific central routing code may be consolidated or removed after equivalent behavior is covered by automated tests.

### Phase SP2 — Hierarchical routing

**Status: Complete.** Operation ownership and the deterministic semantic index resolve registered Skills without model assistance; ambiguity, negative routing, semantic conflicts, lineage, candidate ceilings, and model-disabled behavior are covered by automated evaluations.

Deliver:

- Skill candidate generator;
- deterministic Skill filtering;
- Skill → operation routing;
- durable Skill ambiguity clarification;
- versioned deterministic semantic index and bounded clarification fallback;
- semantic conflict suite; and
- routing lineage.

Model-assisted routing remains an optional later enhancement under §11.4 and is not required for SP2 completion.

Maintenance plus fixture Skills shall prove ambiguous and negative routing before broader catalog registration.

### Phase SP3 — Context composition

**Status: Complete.** Provider registration, authorization rechecks, declared-access enforcement, budgets, deduplication, provenance, freshness/conflict handling, timeout, and required/optional degraded behavior are operational.

Deliver:

- Context Provider Registry;
- registered provider contracts;
- Decision Context Composer integration;
- authorization propagation;
- context budgets, deduplication, provenance, freshness, conflict, timeout, and degraded-mode behavior; and
- prevention of undeclared data access and peer Skill execution.

### Phase SP4 — Decision and financial Skills

**Status: Complete.** Repair or Replace and Refinance use existing Decision Platform, inventory, refinance analysis, preference, scenario, outcome, and monitoring contracts with versioned Skill lineage and fail-closed policy checks.

Represent:

- Repair or Replace; and
- Refinance.

Reuse the existing canonical operations and intelligence contracts for Decision Threads, Scenarios, preferences, Recommendation Snapshots, and monitors. This slice proves material decision lineage, financial boundaries, optional external context, scenario isolation, and recommendation-change explanation.

### Phase SP5 — Catalog expansion and multi-surface access

**Status: Complete.** All fourteen representative Skills are registered with 30 governed adapters. The expansion added no Skill-specific core-router branches, and production Concierge Home and Home Actions paths invoke Property Record through explicit consumer policy.

Add Skills selected from the initial taxonomy and enable explicit consumers beyond Ask.

This phase shall prove that:

- new Skills do not require core router implementation changes;
- consumer-specific operation allowlists work;
- at least one production execution path outside Ask invokes a canonical operation through the consumer-governed Skill runtime;
- shared context is composed without peer Skill execution; and
- Capability Registry destinations and Skill execution identities remain separate.

### Deferred

The following require separate future requirements when a concrete need exists:

- external partner Skills;
- externally exposed ContractToCozy MCP capabilities;
- runtime installation of Skills;
- independently deployed third-party Skill packages;
- multi-property Skill execution; and
- production launch/readiness requirements for real users.

### Version 2 — Measured performance and scale

After Version 1 functionality is complete, Version 2 may implement the optimizations in §22.4 according to measured routing, context, adapter, model, payload, and consumer-load bottlenecks.

Version 2 planning shall begin with a performance profile rather than a predetermined infrastructure solution. It shall preserve the Version 1 direct-adapter and deterministic-first architecture unless evidence demonstrates that a different boundary is necessary.

---

## 26. Functional requirement registry

| ID | Requirement |
| --- | --- |
| `SKILL-FR-001` | The platform shall maintain a versioned registry of registered Skills. |
| `SKILL-FR-002` | Every Skill shall contain one or more registered operations. |
| `SKILL-FR-003` | The platform shall support Domain → Skill → Operation organization. |
| `SKILL-FR-004` | Every Skill shall define homeowner jobs, supported goals, selection examples, and exclusions. |
| `SKILL-FR-005` | Every Skill shall have human-readable `SKILL.md` documentation and a machine-enforced manifest. |
| `SKILL-FR-006` | Markdown shall not control authorization, safety, adapters, context access, connectors, writes, or runtime enablement. |
| `SKILL-FR-007` | The Skill Router shall resolve only registered, enabled, consumer-eligible Skills. |
| `SKILL-FR-008` | Material Skill or operation ambiguity shall request clarification or fail safely. |
| `SKILL-FR-009` | Existing `AskOperationDefinition` contracts shall remain authoritative for execution. |
| `SKILL-FR-010` | Skills shall consume canonical domain services only through registered adapters. |
| `SKILL-FR-011` | Skills shall obtain cross-domain context only through declared registered providers. |
| `SKILL-FR-012` | Context composition shall enforce authorization, provenance, freshness, sensitivity, and budgets. |
| `SKILL-FR-013` | Unknown, stale, unavailable, conflicting, false, and zero shall remain distinct. |
| `SKILL-FR-014` | Skills shall not directly execute peer Skills. |
| `SKILL-FR-015` | Dependencies shall target explicit provider, operation, service, platform, workflow, or presentation contracts. |
| `SKILL-FR-016` | Effective permission shall be the intersection of all applicable policies, with the most restrictive rule winning. |
| `SKILL-FR-017` | Material actions shall retain existing authorization, confirmation, freshness, claim, and idempotency behavior. |
| `SKILL-FR-018` | Each Skill shall declare consumer-specific operation eligibility. |
| `SKILL-FR-019` | Skills, operations, providers, adapters, policies, and schemas shall be versioned and resolved deterministically. |
| `SKILL-FR-020` | In-flight executions and confirmations shall be pinned to bound contract versions. |
| `SKILL-FR-021` | Each Skill shall be independently enableable and disableable without disabling unrelated Skills. |
| `SKILL-FR-022` | Disabling a Skill shall not delete or silently change canonical artifacts. |
| `SKILL-FR-023` | Skill and operation identity/version shall be recorded on execution and recommendation lineage. |
| `SKILL-FR-024` | Internal Skills shall not require MCP when a direct canonical-service adapter is appropriate. |
| `SKILL-FR-025` | External connectors shall be allowlisted and governed by explicit transmission and consent policy. |
| `SKILL-FR-026` | Deterministic Skill and operation paths shall work without language models. |
| `SKILL-FR-027` | Models shall not establish availability, authorization, canonical truth, completion, or write permission. |
| `SKILL-FR-028` | Registry definitions shall be immutable by version and shall never be partially visible at runtime. |
| `SKILL-FR-029` | CI and startup shall reject invalid registrations and incompatible dependencies. |
| `SKILL-FR-030` | Every Skill shall include routing, operation, ambiguity, policy, context, negative, and degraded-mode evaluations. |
| `SKILL-FR-031` | The Skill layer shall reuse existing Ask statuses, typed blocks, capture, clarification, and confirmation contracts. |
| `SKILL-FR-032` | The Skill Registry shall not duplicate Capability Registry destinations or canonical domain truth. |
| `SKILL-FR-033` | Skill telemetry shall use bounded safe dimensions and exclude sensitive homeowner values. |
| `SKILL-FR-034` | Historical Skill/version lineage shall remain readable after deprecation or retirement. |
| `SKILL-FR-035` | Adding a registered Skill shall not require capability-specific changes to core Ask orchestration. |
| `SKILL-FR-036` | Beta development shall not require user migration, launch cohorts, GA gates, or blocking internal approval workflows. |
| `SKILL-FR-037` | Version 1 shall prioritize complete functional capability while retaining bounded execution, deterministic-first routing, direct internal adapters, operation-specific context retrieval, basic timing, and performance smoke tests. |
| `SKILL-FR-038` | Advanced caching, query planning, workload isolation, performance infrastructure, and scale optimization shall be selected for Version 2 from measured Version 1 bottlenecks. |

---

## 27. Acceptance criteria

The Skill Platform foundation is accepted for continued beta development when:

- the Skill Registry is the authoritative Skill catalog used by Ask for represented capabilities;
- Skill lifecycle and operational state are separate;
- a Skill manifest validates against typed contracts;
- invalid operations, adapters, providers, dependencies, consumers, policies, and blocks are rejected;
- one Skill can be disabled without affecting unrelated deterministic Ask operations;
- Maintenance is represented as a full Skill using canonical Maintenance services;
- reads, writes, capture, clarification, confirmation, idempotency, and monitors preserve their existing behavior;
- Ask records Skill and operation versions on executions;
- hierarchical routing clarifies material semantic overlap;
- undeclared provider and adapter access is prevented;
- context budgets and required/optional failure behavior are enforced;
- peer Skill execution and dependency cycles are prevented;
- model outage preserves deterministic behavior;
- Skill-layer timing is distinguishable from context-provider, adapter, canonical-operation, and optional-model time;
- performance smoke tests show bounded routing, provider use, payload size, and execution time for representative fixtures;
- unsupported output blocks fail visibly and safely;
- a new fixture or real Skill can be registered without capability-specific core-router code; and
- all affected automated tests pass.

No internal approval, real-user migration, cohort rollout, production certification, or launch sign-off is required to meet these beta-development acceptance criteria.

---

## 28. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Every feature becomes a Skill | Enforce the homeowner-outcome admission rubric and explicit exclusions |
| A Skill becomes a new monolith | Review semantic cohesion, operation count, context spread, and ownership boundaries |
| Multiple Skills claim the same intent | Conflict fixtures, deterministic ownership rules, and clarification |
| Skills recursively orchestrate peers | Disallow peer execution and executable Skill dependencies in types and runtime |
| Registry differs from execution | Typed references, startup resolution, immutable versions, and contract tests |
| Documentation drifts | Generate machine-authoritative catalog views and warn on semantic mismatch |
| Skill code bypasses canonical owners | Adapter allowlists and architecture tests preventing direct storage access |
| Context composition leaks or over-fetches | Provider authorization, minimization, budgets, provenance, and redaction |
| Version changes alter pending actions | Execution/confirmation version pinning and expiry on incompatibility |
| Infrastructure capabilities are mislabeled as Skills | Apply the stable-homeowner-outcome admission rubric |
| Model routing silently chooses wrong material capability | Confidence thresholds, deterministic signals, and fail-closed clarification |
| Platform work slows feature development | Deliver small reusable contracts and vertical slices; avoid distributed runtime and approval ceremony |
| External integration expands access | Explicit connector allowlists, data classes, consent, timeouts, and failure isolation |

---

## 29. Definition of Done

The initial Skill Platform implementation is complete when:

- canonical Skill contracts and the static Skill Registry are implemented;
- registration validation runs in CI and at startup;
- the standard Skill package and `SKILL.md` specification exist;
- effective-policy intersection is implemented;
- Maintenance, Repair or Replace, and Refinance are represented as Skills;
- Ask routes represented capability families through hierarchical Skill → operation resolution;
- context-provider registration and bounded composition are operational;
- Skill-level telemetry, health, feature flags, and kill switches work;
- operations continue to use canonical domain adapters;
- arbitrary Skill chaining and undeclared data access are prevented;
- confirmations are pinned to Skill, operation, policy, and context versions;
- deterministic behavior remains available without models;
- representative performance smoke tests demonstrate bounded execution without requiring production-scale optimization;
- a subsequent Skill can be added without modifying central Ask orchestration; and
- relevant contract, unit, integration, negative, authorization, concurrency, degraded-mode, and end-to-end tests pass.

**Implementation determination: Satisfied as of August 14, 2026.** SP0 through SP5 are complete, all fourteen representative Skills and 30 governed adapters are registered, non-Ask production invocation is operational, all registered Skills have evaluation packages, 168 Ask tests pass, and backend TypeScript validation passes.

This Definition of Done establishes the beta engineering architecture. It does not assert production readiness or authorize real-user data collection, proactive external delivery, partner Skills, or public launch.

Advanced caching, query planning, semantic-index partitioning, workload isolation, capacity engineering, and production-scale performance gates are not part of the Version 1 Definition of Done. They belong to Version 2 when supported by measured need.

---

## 30. Architectural north star

```text
                    CONTRACTTOCOZY EXPERIENCES

       Ask       Home Actions       Concierge Home       Mobile
        │             │                  │                  │
        └─────────────┴──────────────────┴──────────────────┘
                              │
                              ▼
                    AI HOME CONCIERGE
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
           Goals       Decision Threads    Home Signals
             │                │                │
             └────────────────┼────────────────┘
                              ▼
                         SKILL ROUTER
                              │
                              ▼
                        SKILL REGISTRY
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
         Home Care       Home Finance     Home Protection
             │                │                │
             └────────────────┼────────────────┘
                              ▼
                    CONTEXT COMPOSER
                              │
                              ▼
                   OPERATION / ADAPTERS
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
       Canonical Services  Platform Services  External Connectors
             │                │                │
             └────────────────┼────────────────┘
                              ▼
                     LIVING HOME RECORD
```

> ContractToCozy shall scale by adding governed homeowner capabilities around stable canonical services, not by continuously increasing the complexity or authority of one central AI system.
