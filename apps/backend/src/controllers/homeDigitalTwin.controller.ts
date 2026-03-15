import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { HomeDigitalTwinService } from '../services/homeDigitalTwin.service';
import { HomeDigitalTwinScenarioService } from '../services/homeDigitalTwinScenario.service';

const twinService = new HomeDigitalTwinService();
const scenarioService = new HomeDigitalTwinScenarioService();

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
    res.json({ success: true, data: { twin } });
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
// SCENARIO ENDPOINTS
// ============================================================================

export async function listScenarios(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId } = req.params;

    const twin = await getTwinIdForProperty(propertyId);

    const scenarios = await scenarioService.listScenarios(twin.id, {
      status: req.query.status as any,
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
    const userId = req.user!.userId;

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

export async function computeScenario(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { propertyId, scenarioId } = req.params;

    const twin = await getTwinIdForProperty(propertyId);

    const scenario = await scenarioService.computeScenario(scenarioId, twin.id);
    res.json({ success: true, data: { scenario } });
  } catch (err) {
    next(err);
  }
}

// ============================================================================
// HELPER
// ============================================================================

async function getTwinIdForProperty(propertyId: string) {
  const { prisma } = await import('../lib/prisma');
  const twin = await prisma.homeDigitalTwin.findUnique({
    where: { propertyId },
    select: { id: true },
  });
  if (!twin) {
    const { APIError } = await import('../middleware/error.middleware');
    throw new APIError(
      'Digital twin not found for this property. Use /init to create one.',
      404,
      'TWIN_NOT_FOUND',
    );
  }
  return twin;
}
