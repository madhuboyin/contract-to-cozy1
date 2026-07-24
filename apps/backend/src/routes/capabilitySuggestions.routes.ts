import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import {
  CAPABILITY_CONTEXT_SOURCE_KINDS,
  CAPABILITY_SUGGESTION_SURFACES,
} from '../productFramework/capabilities';
import { getCapabilitySuggestions } from '../services/capabilityRecommendation.service';
import type { CustomRequest } from '../types';
import { logger } from '../lib/logger';

const router = Router();

export const CapabilitySuggestionsQuerySchema = z.object({
  surface: z.enum(CAPABILITY_SUGGESTION_SURFACES).default('HOME'),
  limit: z.coerce.number().int().min(1).max(10).default(3),
  sourceKind: z.enum(CAPABILITY_CONTEXT_SOURCE_KINDS).optional(),
  sourceId: z.string().trim().min(1).max(160).optional(),
  sourceActionId: z.string().trim().min(1).max(160).optional(),
  sourceEntityType: z.string().trim().min(1).max(160).optional(),
  sourceEntityId: z.string().trim().min(1).max(160).optional(),
}).superRefine((value, ctx) => {
  if (Boolean(value.sourceKind) !== Boolean(value.sourceId)) {
    ctx.addIssue({
      code: 'custom',
      path: value.sourceKind ? ['sourceId'] : ['sourceKind'],
      message: 'sourceKind and sourceId must be provided together.',
    });
  }
  if (
    (value.sourceActionId || value.sourceEntityType || value.sourceEntityId)
    && (!value.sourceKind || !value.sourceId)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['sourceKind'],
      message: 'Source lineage fields require sourceKind and sourceId.',
    });
  }
  if (Boolean(value.sourceEntityType) !== Boolean(value.sourceEntityId)) {
    ctx.addIssue({
      code: 'custom',
      path: value.sourceEntityType ? ['sourceEntityId'] : ['sourceEntityType'],
      message: 'sourceEntityType and sourceEntityId must be provided together.',
    });
  }
});

/**
 * @swagger
 * /api/properties/{propertyId}/capability-suggestions:
 *   get:
 *     summary: Get contextual capability suggestions for a property
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: surface
 *         schema:
 *           type: string
 *           enum: [HOME, PROPERTY, WORKFLOW, RELATED, COMPLETION]
 *           default: HOME
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10
 *           default: 3
 *       - in: query
 *         name: sourceKind
 *         schema:
 *           type: string
 *           enum: [HOME_ACTION, JOURNEY, PROJECT, PROPERTY_CONTEXT, PERSONALIZATION, COMPLETION]
 *       - in: query
 *         name: sourceId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Versioned, ranked capability suggestions
 *       400:
 *         description: Invalid surface, limit, or source lineage
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Property not found or access denied
 *       500:
 *         description: Capability suggestions temporarily unavailable
 */
router.get(
  '/properties/:propertyId/capability-suggestions',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response): Promise<void> => {
    const parsed = CapabilitySuggestionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CAPABILITY_SUGGESTIONS_QUERY',
          message: 'The capability suggestions query is invalid.',
          details: parsed.error.flatten(),
        },
      });
      return;
    }
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required.',
        },
      });
      return;
    }
    try {
      const query = parsed.data;
      const data = await getCapabilitySuggestions({
        propertyId: req.params.propertyId,
        userId,
        surface: query.surface,
        limit: query.limit,
        sourceContext: query.sourceKind && query.sourceId
          ? {
              kind: query.sourceKind,
              id: query.sourceId,
              actionId: query.sourceActionId ?? null,
              entityType: query.sourceEntityType ?? null,
              entityId: query.sourceEntityId ?? null,
            }
          : null,
      });
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'Authorization, Cookie');
      res.status(200).json({ success: true, data });
    } catch (error) {
      logger.error(
        { err: error, propertyId: req.params.propertyId, userId },
        'Failed to evaluate capability suggestions',
      );
      res.status(500).json({
        success: false,
        error: {
          code: 'CAPABILITY_SUGGESTIONS_UNAVAILABLE',
          message: 'Capability suggestions are temporarily unavailable.',
        },
      });
    }
  },
);

export default router;
