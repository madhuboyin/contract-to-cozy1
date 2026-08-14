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

The registered Skills reference existing Ask operations and canonical adapters. New Ask
executions persist a versioned Skill binding after the additive `AskExecution` schema
changes are applied by the database owner; this package does not ship migration scripts.

Version 1 performance visibility uses bounded registry dimensions only. Routing, context
composition, provider fan-out and payload, adapter resolution, canonical execution,
presentation validation, and optional model work are timed separately. The smoke suite is
designed to detect unbounded behavior without turning aspirational production percentiles
into beta development gates.

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
