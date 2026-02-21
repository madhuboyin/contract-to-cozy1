import { NextFunction, Response } from 'express';
import { PredictionStatus } from '@prisma/client';
import { CustomRequest } from '../types';
import {
  generateForecast,
  listForecast,
  updateForecastStatus,
} from '../services/maintenancePrediction.service';
import { APIError } from '../middleware/error.middleware';

function parseStatuses(value: unknown): PredictionStatus[] | undefined {
  if (!value) return undefined;

  const raw = Array.isArray(value)
    ? value.flatMap((entry) => String(entry).split(','))
    : String(value).split(',');

  const parsed = raw
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean)
    .filter((entry): entry is PredictionStatus =>
      Object.values(PredictionStatus).includes(entry as PredictionStatus)
    );

  return parsed.length > 0 ? parsed : undefined;
}

function parseLimit(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

export async function generateMaintenanceForecast(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { propertyId } = req.params;
    const result = await generateForecast(propertyId);
    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getMaintenanceForecast(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { propertyId } = req.params;
    const statuses = parseStatuses((req as any).query?.status);
    const limit = parseLimit((req as any).query?.limit);

    const predictions = await listForecast(propertyId, {
      statuses,
      limit,
    });

    return res.json({ success: true, data: predictions });
  } catch (error) {
    next(error);
  }
}

export async function patchMaintenanceForecastStatus(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { propertyId, predictionId } = req.params;
    const statusInput = String(req.body?.status ?? '').toUpperCase();

    if (!Object.values(PredictionStatus).includes(statusInput as PredictionStatus)) {
      throw new APIError('Invalid prediction status', 400, 'INVALID_STATUS');
    }

    const status = statusInput as PredictionStatus;
    const result = await updateForecastStatus(propertyId, predictionId, status);
    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
