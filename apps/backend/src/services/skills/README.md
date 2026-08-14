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

The registered Skills reference existing Ask operations and canonical adapters. New Ask
executions persist a versioned Skill binding after the additive `AskExecution` schema
changes are applied by the database owner; this package does not ship migration scripts.

Version 1 performance visibility uses bounded registry dimensions only. Routing, context
composition, provider fan-out and payload, adapter resolution, canonical execution,
presentation validation, and optional model work are timed separately. The smoke suite is
designed to detect unbounded behavior without turning aspirational production percentiles
into beta development gates.
