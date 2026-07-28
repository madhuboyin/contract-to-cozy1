import type { Response } from 'express';
import { z } from 'zod';
import type { CustomRequest } from '../types';
import {
  AnalyticsEvent,
  AnalyticsFeature,
  AnalyticsModule,
  analyticsEmitter,
} from '../services/analytics';
import {
  OWNERSHIP_COST_CURRENT_LENSES,
  ownershipCostReadModelService,
} from '../services/ownershipCosts/ownershipCostReadModel.service';
import { ownershipCostChangeService } from '../services/ownershipCosts/ownershipCostChange.service';
import {
  ownershipCostForecastService,
} from '../services/ownershipCosts/ownershipCostForecast.service';
import {
  ownershipCostVariabilityService,
} from '../services/ownershipCosts/ownershipCostVariability.service';
import {
  OWNERSHIP_COST_DECISION_ACTIONS,
  OWNERSHIP_COST_NOTIFICATION_TYPES,
  ownershipCostDecisionService,
} from '../services/ownershipCosts/ownershipCostDecision.service';
import { OwnershipCostAccessDeniedError } from '../services/ownershipCosts/ownershipCostObservation.service';
import {
  OWNERSHIP_COST_CATEGORIES,
} from '../services/ownershipCosts/ownershipCost.contract';
import {
  ownershipCostCalculationDurationSeconds,
  ownershipCostCalculationsTotal,
} from '../lib/metrics';
function validationErrorResponse(error: z.ZodError) {
  return {
    success: false,
    message: 'Invalid ownership-cost request.',
    errors: error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

export const ownershipCostReadQuerySchema = z.object({
  lens: z.enum(OWNERSHIP_COST_CURRENT_LENSES)
    .default('OPERATING_EXPENSE'),
}).strict();

const ownershipCostForecastQuerySchema = ownershipCostReadQuerySchema.extend({
  horizonYears: z.coerce.number().int().min(1).max(10).default(5),
}).strict();

const ownershipCostScenarioOverridesSchema = z.object({
  categoryGrowthRates: z.record(
    z.enum(OWNERSHIP_COST_CATEGORIES),
    z.number().finite().min(-0.25).max(0.5),
  ).optional(),
  categoryAnnualAdjustmentsCents: z.record(
    z.enum(OWNERSHIP_COST_CATEGORIES),
    z.number().int().safe().min(-100_000_000).max(100_000_000),
  ).optional(),
}).strict().default({});

const ownershipCostScenarioCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  lens: z.enum(OWNERSHIP_COST_CURRENT_LENSES)
    .default('OPERATING_EXPENSE'),
  horizonYears: z.number().int().min(1).max(10).default(5),
  overrides: ownershipCostScenarioOverridesSchema,
}).strict();

const ownershipCostScenarioPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  lens: z.enum(OWNERSHIP_COST_CURRENT_LENSES).optional(),
  horizonYears: z.number().int().min(1).max(10).optional(),
  overrides: ownershipCostScenarioOverridesSchema.optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one scenario field is required.' },
);

const ownershipCostScenarioListQuerySchema = z.object({
  includeArchived: z.enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
}).strict();

const ownershipCostPlanningDecisionSchema = z.object({
  lens: z.enum(OWNERSHIP_COST_CURRENT_LENSES)
    .default('OPERATING_EXPENSE'),
  decisionType: z.enum([
    'MONTHLY_CASH_BUFFER',
    'CAPITAL_RESERVE',
  ]),
}).strict();

const ownershipCostDecisionSchema = z.object({
  action: z.enum(OWNERSHIP_COST_DECISION_ACTIONS),
  category: z.enum(OWNERSHIP_COST_CATEGORIES).optional(),
  sourceChangeId: z.string().trim().min(1).max(160).nullable().optional(),
  scenarioId: z.string().trim().min(1).max(160).nullable().optional(),
  sourceActionId: z.string().trim().min(1).max(160).nullable().optional(),
  explanation: z.string().trim().min(1).max(1200).nullable().optional(),
  reason: z.string().trim().min(1).max(1000).nullable().optional(),
  revisitAt: z.string().datetime().nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.category && !value.sourceChangeId) {
    ctx.addIssue({
      code: 'custom',
      path: ['category'],
      message: 'A category or source change is required.',
    });
  }
  if (value.action === 'SNOOZE' && !value.revisitAt) {
    ctx.addIssue({
      code: 'custom',
      path: ['revisitAt'],
      message: 'SNOOZE requires a revisit date.',
    });
  }
  if (['DISMISS', 'NO_ACTION', 'RESOLVE'].includes(value.action) && !value.reason) {
    ctx.addIssue({
      code: 'custom',
      path: ['reason'],
      message: `${value.action} requires a homeowner reason.`,
    });
  }
});

const ownershipCostNotificationPreferencesSchema = z.object(
  Object.fromEntries(
    OWNERSHIP_COST_NOTIFICATION_TYPES.map((type) => [type, z.boolean().optional()]),
  ) as Record<typeof OWNERSHIP_COST_NOTIFICATION_TYPES[number], z.ZodOptional<z.ZodBoolean>>,
).strict().refine(
  (value) => Object.values(value).some((setting) => setting !== undefined),
  { message: 'At least one notification preference is required.' },
);

function ownershipCostError(error: unknown, res: Response) {
  if (error instanceof OwnershipCostAccessDeniedError) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
  const message = error instanceof Error
    ? error.message
    : 'Ownership costs are temporarily unavailable.';
  const noSnapshot = message.includes('No ownership-cost snapshot');
  return res.status(noSnapshot ? 404 : 503).json({
    success: false,
    message,
  });
}

async function respondWithCurrentCost(
  req: CustomRequest,
  res: Response,
  refresh: boolean,
) {
  const parsed = ownershipCostReadQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }

  const stopTimer = ownershipCostCalculationDurationSeconds.startTimer({
    lens: parsed.data.lens,
    refresh: refresh ? 'true' : 'false',
  });
  try {
    const ownershipCosts = await ownershipCostReadModelService.getCurrent(
      req.params.propertyId,
      req.user!.userId,
      parsed.data.lens,
      { refresh },
    );
    if (refresh) {
      await ownershipCostChangeService.refreshObservedChanges(
        req.params.propertyId,
        req.user!.userId,
        parsed.data.lens,
      );
    }
    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.OWNERSHIP_COSTS,
      metadataJson: {
        capability: 'ownership-costs',
        lens: ownershipCosts.selectedLens,
        coverageStatus: ownershipCosts.snapshot.coverageStatus,
        confirmedCategoryCount:
          ownershipCosts.coverage.confirmedCategoryCount,
        estimatedCategoryCount:
          ownershipCosts.coverage.estimatedCategoryCount,
        missingCategoryCount:
          ownershipCosts.coverage.missingCategoryCount,
        lastKnownGood: ownershipCosts.snapshot.lastKnownGood,
        refresh,
      },
    });
    ownershipCostCalculationsTotal.inc({
      lens: parsed.data.lens,
      outcome: ownershipCosts.snapshot.lastKnownGood
        ? 'LAST_KNOWN_GOOD'
        : 'SUCCEEDED',
    });
    return res.json({
      success: true,
      data: { ownershipCosts },
    });
  } catch (error) {
    ownershipCostCalculationsTotal.inc({
      lens: parsed.data.lens,
      outcome: error instanceof OwnershipCostAccessDeniedError
        ? 'ACCESS_DENIED'
        : 'FAILED',
    });
    return ownershipCostError(error, res);
  } finally {
    stopTimer();
  }
}

export async function getOwnershipCosts(
  req: CustomRequest,
  res: Response,
) {
  return respondWithCurrentCost(req, res, false);
}

export async function recalculateOwnershipCosts(
  req: CustomRequest,
  res: Response,
) {
  return respondWithCurrentCost(req, res, true);
}

export async function getOwnershipCostChanges(
  req: CustomRequest,
  res: Response,
) {
  const parsed = ownershipCostReadQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }
  try {
    const ownershipCostChanges =
      await ownershipCostChangeService.getObservedChanges(
        req.params.propertyId,
        req.user!.userId,
        parsed.data.lens,
      );
    return res.json({
      success: true,
      data: { ownershipCostChanges },
    });
  } catch (error) {
    return ownershipCostError(error, res);
  }
}

export async function getOwnershipCostForecast(
  req: CustomRequest,
  res: Response,
) {
  const parsed = ownershipCostForecastQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }
  try {
    const ownershipCostForecast =
      await ownershipCostForecastService.getForecast(
        req.params.propertyId,
        req.user!.userId,
        parsed.data.lens,
        parsed.data.horizonYears,
      );
    return res.json({
      success: true,
      data: { ownershipCostForecast },
    });
  } catch (error) {
    return ownershipCostError(error, res);
  }
}

export async function recalculateOwnershipCostForecast(
  req: CustomRequest,
  res: Response,
) {
  const parsed = ownershipCostForecastQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }
  try {
    const ownershipCostForecast =
      await ownershipCostForecastService.recalculateForecast(
        req.params.propertyId,
        req.user!.userId,
        parsed.data.lens,
        parsed.data.horizonYears,
      );
    return res.json({
      success: true,
      data: { ownershipCostForecast },
    });
  } catch (error) {
    return ownershipCostError(error, res);
  }
}

export async function listOwnershipCostScenarios(
  req: CustomRequest,
  res: Response,
) {
  const parsed = ownershipCostScenarioListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }
  try {
    const ownershipCostScenarios =
      await ownershipCostForecastService.listScenarios(
        req.params.propertyId,
        req.user!.userId,
        parsed.data.includeArchived,
      );
    return res.json({
      success: true,
      data: { ownershipCostScenarios },
    });
  } catch (error) {
    return ownershipCostError(error, res);
  }
}

export async function createOwnershipCostScenario(
  req: CustomRequest,
  res: Response,
) {
  const parsed = ownershipCostScenarioCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }
  try {
    const ownershipCostScenario =
      await ownershipCostForecastService.createScenario(
        req.params.propertyId,
        req.user!.userId,
        parsed.data,
      );
    return res.status(201).json({
      success: true,
      data: { ownershipCostScenario },
    });
  } catch (error) {
    return ownershipCostError(error, res);
  }
}

export async function updateOwnershipCostScenario(
  req: CustomRequest,
  res: Response,
) {
  const parsed = ownershipCostScenarioPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }
  try {
    const ownershipCostScenario =
      await ownershipCostForecastService.updateScenario(
        req.params.propertyId,
        req.params.scenarioId,
        req.user!.userId,
        parsed.data,
      );
    return res.json({
      success: true,
      data: { ownershipCostScenario },
    });
  } catch (error) {
    return ownershipCostError(error, res);
  }
}

export async function deleteOwnershipCostScenario(
  req: CustomRequest,
  res: Response,
) {
  try {
    await ownershipCostForecastService.deleteScenario(
      req.params.propertyId,
      req.params.scenarioId,
      req.user!.userId,
    );
    return res.status(204).send();
  } catch (error) {
    return ownershipCostError(error, res);
  }
}

export async function getOwnershipCostVariability(
  req: CustomRequest,
  res: Response,
) {
  const parsed = ownershipCostReadQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }
  try {
    const ownershipCostVariability =
      await ownershipCostVariabilityService.getVariability(
        req.params.propertyId,
        req.user!.userId,
        parsed.data.lens,
      );
    return res.json({
      success: true,
      data: { ownershipCostVariability },
    });
  } catch (error) {
    return ownershipCostError(error, res);
  }
}

export async function recordOwnershipCostPlanningDecision(
  req: CustomRequest,
  res: Response,
) {
  const parsed = ownershipCostPlanningDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }
  try {
    const ownershipCostPlanningDecision =
      await ownershipCostVariabilityService.recordPlanningDecision(
        req.params.propertyId,
        req.user!.userId,
        parsed.data.lens,
        parsed.data.decisionType,
      );
    return res.status(201).json({
      success: true,
      data: { ownershipCostPlanningDecision },
    });
  } catch (error) {
    return ownershipCostError(error, res);
  }
}

export async function getOwnershipCostDecisions(
  req: CustomRequest,
  res: Response,
) {
  try {
    const ownershipCostDecisions = await ownershipCostDecisionService.list(
      req.params.propertyId,
      req.user!.userId,
    );
    return res.json({
      success: true,
      data: { ownershipCostDecisions },
    });
  } catch (error) {
    return ownershipCostError(error, res);
  }
}

export async function recordOwnershipCostDecision(
  req: CustomRequest,
  res: Response,
) {
  const parsed = ownershipCostDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }
  try {
    const ownershipCostDecision = await ownershipCostDecisionService.record(
      req.params.propertyId,
      req.user!.userId,
      parsed.data,
    );
    return res.status(201).json({
      success: true,
      data: { ownershipCostDecision },
    });
  } catch (error) {
    return ownershipCostError(error, res);
  }
}

export async function updateOwnershipCostNotificationPreferences(
  req: CustomRequest,
  res: Response,
) {
  const parsed = ownershipCostNotificationPreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }
  try {
    const ownershipCostNotificationPreferences =
      await ownershipCostDecisionService.updateNotificationPreferences(
        req.params.propertyId,
        req.user!.userId,
        parsed.data,
      );
    return res.json({
      success: true,
      data: { ownershipCostNotificationPreferences },
    });
  } catch (error) {
    return ownershipCostError(error, res);
  }
}
