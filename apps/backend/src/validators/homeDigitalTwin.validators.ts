import { z } from 'zod';
import {
  HomeTwinScenarioType,
  HomeTwinImpactType,
  HomeTwinImpactDirection,
  HomeTwinComponentType,
} from '@prisma/client';

// ============================================================================
// TWIN INIT
// ============================================================================

export const initTwinBodySchema = z.object({
  forceRefresh: z.boolean().optional().default(false),
});

// ============================================================================
// COMPONENT CONFIRMATION
// ============================================================================

export const confirmComponentBodySchema = z.object({
  isUserConfirmed: z.boolean(),
});

// ============================================================================
// SCENARIO LIST QUERY
// ============================================================================

export const listScenariosQuerySchema = z.object({
  status: z
    .enum(['DRAFT', 'READY', 'COMPUTED', 'FAILED', 'ARCHIVED'])
    .optional(),
  includeArchived: z
    .preprocess((v) => v === 'true' || v === true, z.boolean())
    .optional()
    .default(false),
});

// ============================================================================
// PER-TYPE INPUT PAYLOAD SCHEMAS
// ============================================================================

/**
 * REPLACE_COMPONENT / UPGRADE_COMPONENT
 * Accepts either replacementCost or projectCost (alias).
 * riskReductionPercent is supported explicitly (e.g. new roof → 55% risk drop).
 */
const replaceOrUpgradePayloadSchema = z.object({
  componentType: z.nativeEnum(HomeTwinComponentType),
  assumptions: z
    .object({
      replacementCost:       z.number().positive().optional(),
      projectCost:           z.number().positive().optional(),      // alias
      newUsefulLifeYears:    z.number().int().min(1).max(100).optional(),
      efficiencyGainPercent: z.number().min(0).max(100).optional(),
      riskReductionPercent:  z.number().min(0).max(100).optional(),
      annualSavings:         z.number().nonnegative().optional(),   // direct override
    })
    .optional()
    .default({}),
});

/**
 * REPAIR_COMPONENT
 * Smaller-scope alternative to replace/upgrade — addresses the immediate
 * issue without resetting the system's age. Both fields are optional
 * because a reasonable reviewed default exists for each (see
 * REPAIR_COST_FRACTION_OF_REPLACEMENT / REPAIR_DEFAULT_EXTENDED_LIFE_YEARS
 * in homeDigitalTwinScenario.service.ts) — the homeowner isn't required to
 * have a quote in hand to explore the option.
 */
const repairPayloadSchema = z.object({
  componentType: z.nativeEnum(HomeTwinComponentType),
  assumptions: z
    .object({
      repairCost:        z.number().positive().optional(),
      extendedLifeYears: z.number().min(0).max(30).optional(),
    })
    .optional()
    .default({}),
});

/**
 * WAIT_MONITOR
 * The "do nothing yet" option — no cost inputs, just when to revisit.
 */
const waitMonitorPayloadSchema = z.object({
  reviewMonths: z.number().int().min(1).max(60).optional(),
});

/**
 * ENERGY_IMPROVEMENT (insulation / windows / solar)
 * upfrontCost + energySavingsPerYear are the primary inputs.
 */
const energyImprovementPayloadSchema = z.object({
  upfrontCost:                   z.number().nonnegative(),
  energySavingsPerYear:          z.number().nonnegative(),
  carbonOffsetTonsCO2PerYear:    z.number().nonnegative().optional(),
  comfortImpactDescription:      z.string().max(500).optional(),
  resilienceImpactDescription:   z.string().max(500).optional(),
});

/**
 * RESILIENCE_IMPROVEMENT (backup power, sump pump, storm shutters, etc.)
 */
const resilienceImprovementPayloadSchema = z.object({
  upfrontCost:                          z.number().nonnegative(),
  riskReductionPercent:                 z.number().min(0).max(100).optional(),
  estimatedInsuranceSavingsPerYear:     z.number().nonnegative().optional(),
  estimatedPropertyValueChange:         z.number().optional(),
  resilienceImpactDescription:          z.string().max(500).optional(),
});

/**
 * ADD_FEATURE / RENOVATION
 * General home improvement with a cost and optional value/savings outputs.
 */
const addFeatureOrRenovationPayloadSchema = z.object({
  upfrontCost:                   z.number().nonnegative(),
  estimatedPropertyValueChange:  z.number().optional(),
  annualSavings:                 z.number().optional(),
  description:                   z.string().max(500).optional(),
});

/**
 * REMOVE_FEATURE
 * Records cost savings from removing something (e.g. pool removal).
 */
const removeFeaturePayloadSchema = z.object({
  removalCost:                   z.number().nonnegative().optional(),
  annualSavings:                 z.number().optional(),
  estimatedPropertyValueChange:  z.number().optional(),
  description:                   z.string().max(500).optional(),
});

/**
 * CUSTOM
 * Caller provides pre-computed impact rows directly.
 */
const customPayloadSchema = z
  .object({
    expectedImpacts: z
      .array(
        z.object({
          impactType:      z.nativeEnum(HomeTwinImpactType),
          valueNumeric:    z.number().optional().nullable(),
          valueText:       z.string().max(500).optional().nullable(),
          unit:            z.string().max(50).optional().nullable(),
          direction:       z.nativeEnum(HomeTwinImpactDirection),
          confidenceScore: z.number().min(0).max(1).optional().nullable(),
        }),
      )
      .optional(),
    description: z.string().max(500).optional(),
  })
  .passthrough(); // allow extra caller-defined fields

// ============================================================================
// PAYLOAD SCHEMA RESOLVER
// ============================================================================

function payloadSchemaFor(
  scenarioType: HomeTwinScenarioType,
): z.ZodTypeAny {
  switch (scenarioType) {
    case 'REPLACE_COMPONENT':
    case 'UPGRADE_COMPONENT':
      return replaceOrUpgradePayloadSchema;
    case 'REPAIR_COMPONENT':
      return repairPayloadSchema;
    case 'WAIT_MONITOR':
      return waitMonitorPayloadSchema;
    case 'ENERGY_IMPROVEMENT':
      return energyImprovementPayloadSchema;
    case 'RESILIENCE_IMPROVEMENT':
      return resilienceImprovementPayloadSchema;
    case 'ADD_FEATURE':
    case 'RENOVATION':
      return addFeatureOrRenovationPayloadSchema;
    case 'REMOVE_FEATURE':
      return removeFeaturePayloadSchema;
    case 'CUSTOM':
    default:
      return customPayloadSchema;
  }
}

// ============================================================================
// CREATE SCENARIO — validates inputPayload by scenarioType
// ============================================================================

export const createScenarioBodySchema = z
  .object({
    name:          z.string().min(1).max(255),
    scenarioType:  z.nativeEnum(HomeTwinScenarioType),
    description:   z.string().max(1000).optional().nullable(),
    inputPayload:  z.record(z.string(), z.unknown()),
    isPinned:      z.boolean().optional().default(false),
    // The specific real system this decision is about. Optional for
    // whole-property scenario types; recommended for REPAIR/REPLACE/
    // UPGRADE/WAIT once a property has more than one system of that type.
    componentId:   z.string().uuid().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const schema = payloadSchemaFor(data.scenarioType);
    const result = schema.safeParse(data.inputPayload);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ['inputPayload', ...issue.path],
        });
      }
    }
  });

// ============================================================================
// SCENARIO READINESS QUERY
// ============================================================================

export const scenarioReadinessQuerySchema = z.object({
  componentId: z.string().uuid().optional(),
  componentType: z.nativeEnum(HomeTwinComponentType).optional(),
  scenarioType: z.nativeEnum(HomeTwinScenarioType),
});

// ============================================================================
// UPDATE SCENARIO (archive / pin)
// ============================================================================

export const updateScenarioBodySchema = z
  .object({
    isPinned:   z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine(
    (d) => d.isPinned !== undefined || d.isArchived !== undefined,
    { message: 'At least one of isPinned or isArchived must be provided' },
  );
