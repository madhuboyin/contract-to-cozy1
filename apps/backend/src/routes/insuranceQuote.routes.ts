// apps/backend/src/routes/insuranceQuote.routes.ts
import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { CustomRequest } from '../types';

export const insuranceQuoteRouter = Router();

/**
 * POST /api/properties/:propertyId/insurance-quotes
 * Temporarily unavailable until recipient, disclosure, consent, fulfillment,
 * and quote-outcome controls are implemented.
 */
insuranceQuoteRouter.post(
  '/properties/:propertyId/insurance-quotes',
  authenticate,
  propertyAuthMiddleware,
  async (_req: CustomRequest, res: Response) => {
    return res.status(503).json({
      success: false,
      code: 'INSURANCE_QUOTE_HANDOFF_UNAVAILABLE',
      message: 'Insurance quote requests are unavailable while consent and fulfillment controls are being completed.',
    });
  }
);
