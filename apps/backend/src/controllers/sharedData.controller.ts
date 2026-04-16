import { Response } from 'express';
import { CustomRequest } from '../types';
import { AssumptionSetService } from '../services/assumptionSet.service';
import { PreferenceProfileInput, PreferenceProfileService } from '../services/preferenceProfile.service';
import { signalService } from '../services/signal.service';
import { logger } from '../lib/logger';

const preferenceProfileService = new PreferenceProfileService();
const assumptionSetService = new AssumptionSetService();

function requireUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new Error('Authentication required.');
  }
  return userId;
}

export async function getPreferenceProfile(req: CustomRequest, res: Response) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;

    const [profile, defaults] = await Promise.all([
      preferenceProfileService.getCurrentProfile(propertyId),
      preferenceProfileService.resolvePostureDefaults(propertyId),
    ]);

    return res.json({
      success: true,
      data: {
        profile,
        defaults,
      },
    });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    logger.error({ err: error }, 'Error reading preference profile');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to read preference profile.',
    });
  }
}

export async function upsertPreferenceProfile(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const payload = (req.body ?? {}) as PreferenceProfileInput;

    const profile = await preferenceProfileService.upsertProfile(propertyId, userId, payload);

    return res.json({
      success: true,
      data: {
        profile,
      },
    });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    logger.error({ err: error }, 'Error upserting preference profile');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to upsert preference profile.',
    });
  }
}

export async function createAssumptionSet(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;

    const created = await assumptionSetService.create({
      propertyId,
      toolKey: String(req.body.toolKey),
      scenarioKey: req.body.scenarioKey ?? null,
      preferenceProfileId: req.body.preferenceProfileId ?? null,
      assumptionsJson: req.body.assumptionsJson ?? {},
      createdByUserId: userId,
    });

    return res.status(201).json({
      success: true,
      data: {
        assumptionSet: created,
      },
    });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    logger.error({ err: error }, 'Error creating assumption set');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to create assumption set.',
    });
  }
}

export async function listAssumptionSets(req: CustomRequest, res: Response) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;

    const toolKey = typeof req.query.toolKey === 'string' ? req.query.toolKey : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

    const assumptionSets = await assumptionSetService.listRecent(propertyId, {
      toolKey,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    return res.json({
      success: true,
      data: {
        assumptionSets,
      },
    });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    logger.error({ err: error }, 'Error listing assumption sets');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to list assumption sets.',
    });
  }
}

export async function getAssumptionSet(req: CustomRequest, res: Response) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;
    const assumptionSetId = req.params.assumptionSetId;

    const assumptionSet = await assumptionSetService.getById(propertyId, assumptionSetId);
    if (!assumptionSet) {
      return res.status(404).json({
        success: false,
        message: 'Assumption set not found for this property.',
      });
    }

    const isUsed = await assumptionSetService.isUsed(propertyId, assumptionSetId);

    return res.json({
      success: true,
      data: {
        assumptionSet,
        isUsed,
      },
    });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    logger.error({ err: error }, 'Error reading assumption set');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to read assumption set.',
    });
  }
}

export async function listPropertySignals(req: CustomRequest, res: Response) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;

    const signalKey = typeof req.query.signalKey === 'string' ? req.query.signalKey : undefined;
    const roomId = typeof req.query.roomId === 'string' ? req.query.roomId : undefined;
    const homeItemId = typeof req.query.homeItemId === 'string' ? req.query.homeItemId : undefined;
    const freshOnly =
      typeof req.query.freshOnly === 'string'
        ? req.query.freshOnly.toLowerCase() === 'true'
        : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

    const signals = await signalService.listSignals(propertyId, {
      signalKey,
      roomId,
      homeItemId,
      freshOnly,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    return res.json({
      success: true,
      data: {
        signals,
      },
    });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    logger.error({ err: error }, 'Error listing shared signals');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to list shared signals.',
    });
  }
}
