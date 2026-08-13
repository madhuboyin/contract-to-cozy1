# ContractToCozy Skill Platform

This package implements the static Version 1 Skill contracts described in
`docs/product/CONTRACTTOCOZY_SKILL_PLATFORM_FRD.md`.

- `skill.contract.ts` contains machine-enforced Skill types.
- `skillRegistry.ts` contains immutable Skill definitions, validation, operation lookup,
  and effective consumer/Skill/operation policy resolution.

The initial Maintenance Skill references existing Ask operations and canonical adapters.
It does not introduce database tables or migrations. Skill identity is derived from the
registered operation until the user applies any future persistence schema changes.
