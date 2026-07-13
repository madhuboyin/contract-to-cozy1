// apps/backend/src/personalization/catalog/fixtureTypes.ts
//
// Golden-fixture format for the personalization catalog, per
// docs/personalization/10-testing-strategy.md: "Store versioned, synthetic
// fixtures: household, property/assets, context, history, expected traits,
// eligible/suppressed definitions, rank bands, explanation reason codes and
// actions. Never copy production household data." and "every active
// definition has positive, negative, unknown and suppression fixture."
//
// No rule evaluator exists yet, so nothing actually evaluates these fixtures
// against real logic — this defines the shape and the fixtures directory
// convention that Phase 1's evaluator will read from, and validateFixtures.ts
// checks fixture files conform to it and that ACTIVE definitions have full
// coverage.
import { z } from 'zod';

export const FIXTURE_KINDS = ['positive', 'negative', 'unknown', 'suppression'] as const;
export type FixtureKind = (typeof FIXTURE_KINDS)[number];

export const catalogFixtureSchema = z.object({
  definitionCode: z.string().min(1),
  kind: z.enum(FIXTURE_KINDS),
  description: z.string().min(1),
  input: z.object({
    household: z.record(z.string(), z.unknown()).default({}),
    property: z.record(z.string(), z.unknown()).default({}),
    context: z.record(z.string(), z.unknown()).default({}),
    history: z.record(z.string(), z.unknown()).default({}),
  }),
  expected: z.object({
    traits: z.record(z.string(), z.unknown()).default({}),
    eligible: z.boolean(),
    suppressed: z.boolean().default(false),
    suppressionReason: z.string().optional(),
    rankBand: z.string().optional(),
    explanationReasonCodes: z.array(z.string()).default([]),
    actions: z.array(z.string()).default([]),
  }),
});

export type CatalogFixture = z.infer<typeof catalogFixtureSchema>;
