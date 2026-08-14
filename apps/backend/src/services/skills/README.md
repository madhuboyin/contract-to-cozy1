# ContractToCozy Skill Platform

This package implements the static Version 1 Skill contracts described in
`docs/product/CONTRACTTOCOZY_SKILL_PLATFORM_FRD.md`.

- `skill.contract.ts` contains machine-enforced Skill types.
- `skillRegistry.ts` contains immutable Skill definitions, validation, operation lookup,
  and effective consumer/Skill/operation policy resolution.
- `skillEvaluationRegistry.ts` binds every manifest's `evaluationSuite` to immutable
  routing, operation, ambiguity, policy, context, negative, degraded-mode,
  model-disabled, handoff, and performance fixtures. Startup rejects missing, stale,
  incomplete, cross-Skill, or unbounded packages.
- `skillHandoff.ts` registers optional cross-Skill follow-up suggestions. It emits typed
  metadata only after Ask rechecks target ownership, goal registration, consumer policy,
  runtime controls, and dependency health; it has no adapter or peer-execution path.
- `skillLineageRegistry.ts` retains minimized immutable identity for current and retired
  Skill versions. Historical entries contain no executable policy, adapter, provider, or
  dependency data and therefore cannot re-enter routing or execution.
- `skillDependencyRegistry.ts` is the startup-resolved catalog for explicit operation,
  provider, canonical-service, platform, workflow, and presentation contracts. Manifests
  may request an exact version or a supported caret-compatible range; resolution always
  selects one deterministic highest compatible version.

The registered Skills reference existing Ask operations and canonical adapters. New Ask
executions persist a versioned Skill binding after the additive `AskExecution` schema
changes are applied by the database owner; this package does not ship migration scripts.

The Version 1 registry represents all fourteen Skills in the FRD's initial taxonomy. Each
entry reuses an existing canonical operation and adapter; catalog expansion does not add
Skill-specific branches to the core router or move domain logic into the Skill layer.

Version 1 performance visibility uses bounded registry dimensions only. Routing, context
composition, provider fan-out and payload, adapter resolution, canonical execution,
presentation validation, and optional model work are timed separately. The smoke suite is
designed to report component p95 values and detect unbounded behavior without turning
aspirational production percentiles into beta development gates. Each initial Ask execution
also writes one bounded `SKILL_EXECUTION_TELEMETRY` event that joins routing, provider,
dependency, risk, execution/model, latency-band, result, and error dimensions without using
high-cardinality Prometheus labels.

Every registered property-scoped Skill declares the shared `property.identity-context`
provider at Skill and operation scope. It establishes the selected Living Home Record identity
and version before canonical execution; domain-specific providers are added only when an
operation needs additional composed cross-domain inputs. Maintenance additionally consumes
its task-context provider. The package scaffolder inserts the identity provider automatically
for property-required operations, and registry validation rejects manual manifests that omit it.

Handoffs are persisted with the source execution and rendered as a draftable next question.
Selecting one does not execute anything: the new question returns through normal Ask routing,
property authorization, ambiguity handling, and current runtime-health checks.

Before replacing or removing a registered Skill version, copy its minimized identity into
`HISTORICAL_SKILL_LINEAGE` and point `supersededByVersion` to another registered version of
the same Skill. Startup rejects duplicate or orphaned lineage. Historical metadata can label
saved responses, but cannot satisfy routing, policy, binding, adapter, or provider lookup.

## Create a Skill package

First register the canonical Ask operation, its direct adapter, and any context providers.
The operation must not already belong to another Skill. Then create a JSON spec matching
`SkillPackageScaffoldSpec` and run:

```bash
npm run skill:create -- --spec ./path/to/new-skill.json
```

Use `--output-root <directory>` to render into a review directory before placing the package
under `src/services/skills`. The command validates semantic metadata, operation ownership,
adapter/provider registration, consumers, risk policy, ambiguity coverage, negative cases,
and the governed handoff target. It creates the directory atomically and never overwrites an
existing Skill package.

The generated package contains:

- `SKILL.md` with selection, exclusion, consumer, ownership, and boundary guidance;
- `skill.manifest.ts` with operation, adapter, provider, policy, dependency, budget, and
  runtime-control declarations;
- `skill.evaluation.ts` with routing, operation, ambiguity, policy, context, negative,
  degraded-mode, model-disabled, handoff, and performance fixtures; and
- `index.ts` exports.

The command prints the two explicit registration imports and a completion checklist. Add the
manifest to `SKILL_DEFINITIONS` and the evaluation package to
`SKILL_EVALUATION_PACKAGES`; no capability-specific Ask orchestration change is required.

## Add audience applicability

Every governed property operation must have an immutable audience policy keyed by the exact
operation ID and version. This is applicability and presentation policy, not authentication or
property authorization; those controls remain authoritative and are never replaced by persona
logic.

1. Declare the shared `property.journey-context@1.0.0` provider at Skill and operation scope.
   Keep `property.identity-context` required; the journey provider is additional bounded
   lifecycle context and must not become a replacement authorization source.
2. Add the operation to `askAudiencePolicy.ts` with eligible operating modes, the existing
   operation role floor, unknown-context behavior, typed-request behavior, and discovery
   behavior. Never infer account role or lifecycle from question text or the client.
3. Use `ALLOW_GENERAL` only when the canonical operation can provide correct, useful guidance
   without lifecycle context. Material or lifecycle-specific operations should explain or block
   when the mode is unknown.
4. Add operation-bound landing prompts to `askLifecyclePromptPolicy.ts` only when the displayed
   question deterministically routes to the same operation evaluated for discovery. Preserve
   exact-context prompt precedence, four-card maximum, deduplication, and safe general fallback.
5. Keep canonical facts and calculations in the adapter/domain service. Audience presentation
   may add bounded lifecycle framing and remove unusable CTAs, but must not rewrite evidence,
   amounts, rankings, status, or authorization decisions.
6. Extend policy validation and the evaluation package with eligible, ineligible, unknown-mode,
   owner/contributor/viewer, discovery, and confirmation-recheck fixtures.

Startup validation fails closed when a registered operation lacks a policy, the policy version
does not match the immutable operation version, its role floor is weaker, its modes are invalid,
or the journey provider is absent. Initial execution telemetry persists only bounded audience
enums and policy/provider lineage; do not add raw questions, preferences, financial detail,
addresses, names, or unbounded entity identifiers.

Audience behavior has independent controls:

- `ASK_ACCOUNT_ROLE_ELIGIBILITY_ENABLED` / `ASK_ACCOUNT_ROLE_ELIGIBILITY_KILL_SWITCH` pauses
  Ask fail-closed; it must never be used to bypass the homeowner account guard.
- `ASK_AUDIENCE_POLICY_ENABLED` / `ASK_AUDIENCE_POLICY_KILL_SWITCH` evaluates through safe
  `UNKNOWN` context when disabled.
- `ASK_AUDIENCE_DISCOVERY_ENABLED` / `ASK_AUDIENCE_DISCOVERY_KILL_SWITCH` falls back to general
  unknown-context prompts when disabled.
- `ASK_AUDIENCE_PRESENTATION_ENABLED` / `ASK_AUDIENCE_PRESENTATION_KILL_SWITCH` removes only
  lifecycle framing; household-role CTA filtering remains enforced.
- Existing context-provider controls independently disable the journey provider and retain its
  required/optional degraded behavior.

## Add a governed adapter

An adapter is a versioned policy boundary around an existing canonical Ask operation. It
does not own business logic and is not a second implementation of the canonical service.
Prefer reusing an existing registered adapter. Add one only when a registered operation has
a new canonical-service boundary that the Skill Platform must govern.

If the product capability does not yet have a canonical Ask operation, implement and test
that operation first. A new Skill package may reuse registered operations without changing
core Ask orchestration; creating a net-new operation is separate domain and Ask work.

1. Define the canonical operation in `src/services/ask/askOperationRegistry.ts` and set its
   `adapterKey` to the stable adapter ID. Preserve the operation's property requirement,
   execution mode, risk class, role floor, allowed result blocks, and typed result contract.
2. Add the adapter definition to
   `src/services/skills/adapters/skillAdapterRegistry.ts`. Its ID must exactly match the
   operation's `adapterKey`, and its version must use `major.minor` format.
3. Declare all fields required by `SkillAdapterDefinition`:
   - stable `id` and `version`;
   - `canonicalOwner` and `allowedOperations`;
   - versioned `inputContract` and `outputContract`;
   - `effect`, authorization behavior, timeout, retry safety, idempotency policy, typed
     error contract, and health contract.
4. Use `READ`, `SAFE`, and `NOT_APPLICABLE` for a side-effect-free canonical read. Use
   `MUTATION_PREPARATION`, `CLAIM_GUARDED`, and `CONFIRMATION_RECEIPT` for a material
   mutation path. The adapter may prepare a mutation, but existing Ask confirmation,
   freshness recheck, execution claim, authorization, and idempotency controls remain
   authoritative.
5. Reference the exact `{ id, version }` in the owning Skill's `allowedAdapters`. Reference
   the operation from that Skill and include the same adapter in its expected/prohibited
   evaluation coverage. One operation may have only one registered adapter owner.
6. Keep canonical execution in the existing domain service and Ask operation dispatch. Do
   not place domain rules in the adapter registry, call another Skill, broaden the role
   floor, or bypass typed Ask results.

Adapter availability is controlled independently with the normalized environment key
`ASK_ADAPTER_<ADAPTER_ID>_ENABLED` or
`ASK_ADAPTER_<ADAPTER_ID>_KILL_SWITCH`; punctuation in the adapter ID becomes `_` and the
key is uppercased. A disabled or missing required adapter removes the affected operation
from routing without disabling unrelated Skills.

Add or update tests that prove:

- type checking and registry validation accept the adapter and reject invalid identity,
  version, operation-key, duplicate ownership, timeout, effect, retry-policy, or
  idempotency declarations;
- the owning Skill declares the exact adapter version;
- consumer policy and the authorization floor are enforced before canonical execution;
- disabled or unavailable adapter state fails closed with the typed degraded/unavailable
  behavior;
- reads call only the expected canonical service; and
- mutation preparation retains confirmation, claim, and retry protections.

Run the focused checks from `apps/backend`:

```bash
node --test tests/ask/skillAdapterRegistry.test.js \
  tests/ask/skillPlatformFoundation.test.js \
  tests/ask/skillExecutionBinding.test.js \
  tests/ask/skillRuntimeHealth.test.js \
  tests/ask/skillPackageScaffold.test.js
npx tsc --noEmit
npm run test:ask
```

Before considering the extension complete, confirm that startup validation passes, the
Skill evaluation package covers every declared operation/adapter, no capability-specific
branch was added to the Skill router, and documentation names the canonical owner and
failure behavior.
