import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { HomeDigitalTwinService } from '../services/homeDigitalTwin.service';
import { HomeDigitalTwinScenarioService } from '../services/homeDigitalTwinScenario.service';
import { HomeDigitalTwinRecommendationsService } from '../services/homeDigitalTwinRecommendations.service';
import { HomeDigitalTwinFactReadinessService } from '../services/homeDigitalTwinFactReadiness.service';
import { getPlanningContextEnvelope } from '../services/planningContext/context';
import JobQueueService from '../services/JobQueue.service';

const twinService = new HomeDigitalTwinService();
const scenarioService = new HomeDigitalTwinScenarioService();
const recommendationsService = new HomeDigitalTwinRecommendationsService();
const factReadinessService = new HomeDigitalTwinFactReadinessService();

// ============================================================================
// TWIN ENDPOINTS
// ============================================================================

export async function getTwin(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId } = req.params;
    const twin = await twinService.getTwin(propertyId);

    // Projection staleness: compare the context version the twin was computed
    // from with the property's current DIGITAL_TWIN context.
    const context = req.user?.userId
      ? await getPlanningContextEnvelope(
          propertyId,
          req.user.userId,
          'DIGITAL_TWIN',
          (twin as { contextVersion?: string | null } | null)?.contextVersion ?? null,
        )
      : null;

    res.json({ success: true, data: { twin, context } });
  } catch (err) {
    next(err);
  }
}

export async function initTwin(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId } = req.params;
    const forceRefresh = req.body.forceRefresh === true;
    const twin = await twinService.initTwin(propertyId, forceRefresh);
    res.status(201).json({ success: true, data: { twin } });
  } catch (err) {
    next(err);
  }
}

export async function refreshTwin(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId } = req.params;
    const twin = await twinService.refreshTwin(propertyId);
    res.json({ success: true, data: { twin } });
  } catch (err) {
    next(err);
  }
}

// ============================================================================
// FACT READINESS (Home Record hub summary)
// ============================================================================

export async function getFactReadiness(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId } = req.params;
    const summary = await factReadinessService.getSummary(propertyId);
    res.json({ success: true, data: { summary } });
  } catch (err) {
    next(err);
  }
}

// ============================================================================
// RECOMMENDED SCENARIOS
// ============================================================================

export async function getRecommendedScenarios(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId } = req.params;
    const recommendations = await recommendationsService.getRecommendations(propertyId);
    res.json({ success: true, data: { recommendations } });
  } catch (err) {
    next(err);
  }
}

// ============================================================================
// SCENARIO ENDPOINTS
// ============================================================================

const VALID_SCENARIO_STATUSES = new Set([
  'DRAFT', 'READY', 'COMPUTED', 'FAILED', 'ARCHIVED',
]);

export async function listScenarios(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId } = req.params;
    const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
    const status = statusParam && VALID_SCENARIO_STATUSES.has(statusParam)
      ? (statusParam as 'DRAFT' | 'READY' | 'COMPUTED' | 'FAILED' | 'ARCHIVED')
      : undefined;
    const twin = await getTwinIdForProperty(propertyId);
    const scenarios = await scenarioService.listScenarios(twin.id, {
      status,
      includeArchived: req.query.includeArchived === 'true',
    });
    res.json({ success: true, data: { scenarios } });
  } catch (err) {
    next(err);
  }
}

export async function createScenario(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      throw new APIError('Authentication required', 401, 'NOT_AUTHENTICATED');
    }
    const twin = await getTwinIdForProperty(propertyId);
    const scenario = await scenarioService.createScenario(
      twin.id,
      propertyId,
      userId,
      req.body,
    );
    res.status(201).json({ success: true, data: { scenario } });
  } catch (err) {
    next(err);
  }
}

export async function getScenario(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId, scenarioId } = req.params;
    const twin = await getTwinIdForProperty(propertyId);
    const scenario = await scenarioService.getScenario(scenarioId, twin.id);
    res.json({ success: true, data: { scenario } });
  } catch (err) {
    next(err);
  }
}

export async function listScenarioRuns(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId, scenarioId } = req.params;
    const twin = await getTwinIdForProperty(propertyId);
    const runs = await scenarioService.listScenarioRuns(scenarioId, twin.id);
    res.json({ success: true, data: { runs } });
  } catch (err) {
    next(err);
  }
}

export async function updateScenario(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId, scenarioId } = req.params;
    const twin = await getTwinIdForProperty(propertyId);
    const scenario = await scenarioService.updateScenario(
      scenarioId,
      twin.id,
      req.body,
    );
    res.json({ success: true, data: { scenario } });
  } catch (err) {
    next(err);
  }
}

export async function computeScenario(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId, scenarioId } = req.params;
    const twin = await getTwinIdForProperty(propertyId);
    await scenarioService.getScenario(scenarioId, twin.id);
    await JobQueueService.enqueueHomeDigitalTwinScenarioCompute(propertyId, twin.id, scenarioId);
    const scenario = await scenarioService.getScenario(scenarioId, twin.id);
    res.status(202).json({ success: true, data: { scenario, queued: true } });
  } catch (err) {
    next(err);
  }
}

export async function getScenarioReadiness(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId } = req.params;
    const twin = await getTwinIdForProperty(propertyId);
    const { componentId, componentType, scenarioType } = req.query as {
      componentId?: string;
      componentType?: string;
      scenarioType: string;
    };
    const readiness = await scenarioService.getReadiness(twin.id, {
      componentId,
      componentType: componentType as any,
      scenarioType: scenarioType as any,
    });
    res.json({ success: true, data: { readiness } });
  } catch (err) {
    next(err);
  }
}

export async function compareScenarios(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId, componentId } = req.params;
    const twin = await getTwinIdForProperty(propertyId);
    const comparison = await scenarioService.compareScenarios(twin.id, componentId);
    res.json({ success: true, data: { comparison } });
  } catch (err) {
    next(err);
  }
}

export async function ensureComparisonOptions(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId, componentId } = req.params;
    const userId = req.user?.userId;
    if (!userId) throw new APIError('Authentication required', 401, 'UNAUTHORIZED');
    const twin = await getTwinIdForProperty(propertyId);
    const comparison = await scenarioService.ensureComparisonOptions(
      twin.id,
      propertyId,
      componentId,
      userId,
    );
    await Promise.all(
      comparison.options
        .filter((option) => option.status !== 'COMPUTED')
        .map((option) =>
          JobQueueService.enqueueHomeDigitalTwinScenarioCompute(
            propertyId,
            twin.id,
            option.id,
          )),
    );
    res.status(202).json({ success: true, data: { comparison, queued: true } });
  } catch (err) {
    next(err);
  }
}

export async function recordScenarioDecision(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId, scenarioId } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      throw new APIError('Authentication required', 401, 'NOT_AUTHENTICATED');
    }
    const twin = await getTwinIdForProperty(propertyId);
    const scenario = await scenarioService.recordDecision(scenarioId, twin.id, {
      decisionStatus: req.body.decisionStatus,
      decisionReason: req.body.decisionReason,
      userId,
    });
    res.json({ success: true, data: { scenario } });
  } catch (err) {
    next(err);
  }
}

export async function deleteScenario(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId, scenarioId } = req.params;
    const twin = await getTwinIdForProperty(propertyId);
    await scenarioService.deleteScenario(scenarioId, twin.id, propertyId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getScenarioHandoff(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId, scenarioId } = req.params;
    const twin = await getTwinIdForProperty(propertyId);
    const handoff = await scenarioService.getHandoffContext(scenarioId, twin.id, propertyId);
    res.json({ success: true, data: { handoff } });
  } catch (err) {
    next(err);
  }
}

// ============================================================================
// HELPER
// ============================================================================

async function getTwinIdForProperty(propertyId: string) {
  const twin = await prisma.homeDigitalTwin.findUnique({
    where: { propertyId },
    select: { id: true },
  });
  if (!twin) {
    throw new APIError(
      'Digital twin not found for this property. Use /init to create one.',
      404,
      'TWIN_NOT_FOUND',
    );
  }
  return twin;
}
