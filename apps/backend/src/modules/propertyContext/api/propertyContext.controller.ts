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
import { evaluateProtectionContext } from '../../../services/protection/applicabilityPolicy';
import { evaluateFinancialContext } from '../../../services/financialContext/applicabilityPolicy';
import { evaluatePlanningContext } from '../../../services/planningContext/applicabilityPolicy';
import { evaluateAggregationContext } from '../../../services/aggregationContext/applicabilityPolicy';
import { evaluateProjectComplianceContext } from '../../../services/projectCompliance/applicabilityPolicy';
import { evaluateFeatureContext, evaluateFeatureContextInputSchema } from '../application/evaluateFeatureContext';
import {
  captureFeatureContext,
  PropertyContextIdempotencyConflictError,
  PropertyContextVersionConflictError,
} from '../application/captureFeatureContext';
import { getCaptureDefinitionForFact } from '../catalog/captureRegistry';
import { getFactDefinition } from '../catalog/factCatalog';

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

export async function getPropertyContextDecisionMatrix(req: AuthRequest, res: Response): Promise<Response> {
  try {
    const snapshot = await getPropertyContext(
      req.params.id,
      { userId: req.user!.userId },
      { scopes: [...PROPERTY_CONTEXT_SCOPES] },
    );
    return res.json({
      success: true,
      data: {
        propertyId: snapshot.propertyId,
        contextVersion: snapshot.contextVersion,
        protection: evaluateProtectionContext(snapshot),
        projectCompliance: evaluateProjectComplianceContext(snapshot),
        financial: evaluateFinancialContext(snapshot),
        planning: evaluatePlanningContext(snapshot),
        aggregation: evaluateAggregationContext(snapshot),
      },
    });
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

export async function postFeatureContextEvaluation(req: AuthRequest, res: Response): Promise<Response> {
  try {
    const input = evaluateFeatureContextInputSchema.parse(req.body);
    const data = await evaluateFeatureContext(req.params.id, req.user!.userId, input);
    return res.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ success: false, message: 'Invalid feature context request.' });
    }
    if (error instanceof Error && /not registered|Invalid Property Context/.test(error.message)) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return handleContextError(error, res);
  }
}

export async function postFeatureContextCapture(req: AuthRequest, res: Response): Promise<Response> {
  try {
    const data = await captureFeatureContext(req.params.id, req.user!.userId, req.body);
    return res.json({ success: true, data });
  } catch (error) {
    if (error instanceof PropertyContextVersionConflictError) {
      return res.status(409).json({ success: false, message: error.message, data: { evaluation: error.evaluation } });
    }
    if (error instanceof PropertyContextIdempotencyConflictError) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error instanceof Error && (error.name === 'ZodError' || /not registered|no longer active/.test(error.message))) {
      return res.status(400).json({ success: false, message: error.name === 'ZodError' ? 'Invalid context capture.' : error.message });
    }
    return handleContextError(error, res);
  }
}

export async function getCompatibleContextCaptureDefinition(req: AuthRequest, res: Response): Promise<Response> {
  try {
    const fact = getFactDefinition(req.params.factKey);
    await getPropertyContext(req.params.id, { userId: req.user!.userId }, { scopes: [fact.scope] });
    const definition = getCaptureDefinitionForFact(req.params.factKey);
    if (!definition) return res.status(404).json({ success: false, message: 'No scalar capture is registered for this fact.' });
    const { canonicalOwner: _canonicalOwner, ...data } = definition;
    return res.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not allowlisted')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return handleContextError(error, res);
  }
}
