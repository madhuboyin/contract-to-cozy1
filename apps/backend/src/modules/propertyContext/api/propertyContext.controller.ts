import { Response } from 'express';
import { AuthRequest } from '../../../types';
import { logger } from '../../../lib/logger';
import { getContextCompleteness } from '../application/getContextCompleteness';
import { getPropertyContext, PropertyContextAccessDeniedError } from '../application/getPropertyContext';
import { PROPERTY_CONTEXT_SCOPES, PropertyContextScope } from '../domain/contracts';
import {
  getProjectComplianceEnvelope,
  PROJECT_COMPLIANCE_FEATURES,
  type ProjectComplianceFeature,
} from '../../../services/projectCompliance/context';
import {
  capturePropertyFact,
  capturePropertyFactInputSchema,
  listPropertyFactEvidence,
} from '../application/capturePropertyFact';

export const PHASE_ONE_CONTEXT_SCOPES: PropertyContextScope[] = [
  'CORE',
  'LOCATION',
  'STRUCTURE',
  'EXTERIOR',
  'RESPONSIBILITY',
  'ROOMS',
  'INVENTORY',
  'PRODUCT_CONTEXT',
];

export function parseContextScopes(value: unknown, defaults = PHASE_ONE_CONTEXT_SCOPES): PropertyContextScope[] {
  if (value === undefined || value === null || value === '') return [...defaults];
  const raw = (Array.isArray(value) ? value.join(',') : String(value))
    .split(',')
    .map((scope) => scope.trim().toUpperCase())
    .filter(Boolean);
  if (raw.length === 0) return [...defaults];
  const invalid = raw.filter((scope) => !PROPERTY_CONTEXT_SCOPES.includes(scope as PropertyContextScope));
  if (invalid.length) throw new Error(`Invalid Property Context scopes: ${invalid.join(', ')}`);
  return [...new Set(raw as PropertyContextScope[])];
}

function handleContextError(error: unknown, res: Response): Response {
  if (error instanceof PropertyContextAccessDeniedError) {
    return res.status(404).json({ success: false, message: error.message });
  }
  if (error instanceof Error && error.message.startsWith('Invalid Property Context scopes:')) {
    return res.status(400).json({ success: false, message: error.message });
  }
  logger.error({ err: error }, 'Property Context request failed');
  return res.status(500).json({ success: false, message: 'Failed to retrieve property context' });
}

export async function getPropertyContextSnapshot(req: AuthRequest, res: Response): Promise<Response> {
  try {
    const scopes = parseContextScopes(req.query.scopes);
    const snapshot = await getPropertyContext(req.params.id, { userId: req.user!.userId }, { scopes });
    return res.json({ success: true, data: snapshot });
  } catch (error) {
    return handleContextError(error, res);
  }
}

export async function getPropertyContextCompleteness(req: AuthRequest, res: Response): Promise<Response> {
  try {
    const scopes = parseContextScopes(req.query.scopes);
    const snapshot = await getPropertyContext(req.params.id, { userId: req.user!.userId }, { scopes });
    return res.json({ success: true, data: getContextCompleteness(snapshot) });
  } catch (error) {
    return handleContextError(error, res);
  }
}

export async function getProjectCompliancePropertyContext(req: AuthRequest, res: Response): Promise<Response> {
  try {
    const rawFeature = String(req.query.feature ?? 'AGGREGATE').trim().toUpperCase();
    if (!PROJECT_COMPLIANCE_FEATURES.includes(rawFeature as ProjectComplianceFeature)) {
      return res.status(400).json({ success: false, message: `Invalid project/compliance feature: ${rawFeature}` });
    }
    const context = await getProjectComplianceEnvelope(
      req.params.id,
      req.user!.userId,
      rawFeature as ProjectComplianceFeature,
    );
    return res.json({ success: true, data: context });
  } catch (error) {
    return handleContextError(error, res);
  }
}

export async function patchPropertyContextFact(req: AuthRequest, res: Response): Promise<Response> {
  try {
    const input = capturePropertyFactInputSchema.parse(req.body);
    const data = await capturePropertyFact(req.params.id, req.user!.userId, req.params.factKey, input);
    return res.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && (/not writable|not supported|allowlisted/.test(error.message))) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ success: false, message: 'Invalid fact value' });
    }
    return handleContextError(error, res);
  }
}

export async function getPropertyContextFactEvidence(req: AuthRequest, res: Response): Promise<Response> {
  try {
    const evidence = await listPropertyFactEvidence(req.params.id, req.user!.userId, req.params.factKey);
    return res.json({ success: true, data: { evidence } });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not allowlisted')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return handleContextError(error, res);
  }
}
