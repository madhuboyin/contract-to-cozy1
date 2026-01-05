// apps/backend/src/routes/insuranceQuote.routes.ts
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { CustomRequest } from '../types';

export const insuranceQuoteRouter = Router();

/**
 * POST /api/properties/:propertyId/insurance-quotes
 * Creates an insurance quote request (lead) from a coverage gap action or manual.
 */
insuranceQuoteRouter.post(
  '/properties/:propertyId/insurance-quotes',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { propertyId } = req.params;

      const homeownerProfile = await prisma.homeownerProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!homeownerProfile) {
        return res.status(404).json({ success: false, message: 'Homeowner profile not found' });
      }

      const {
        inventoryItemId,
        source = 'COVERAGE_GAP',
        gapType,
        exposureCents,
        currency = 'USD',
        preferredContact,
        contactEmail,
        contactPhone,
        zipCode,
        notes,
      } = req.body || {};

      // Basic validation (keep lightweight)
      if (preferredContact && !['EMAIL', 'SMS', 'PHONE'].includes(preferredContact)) {
        return res.status(400).json({ success: false, message: 'Invalid preferredContact' });
      }

      const created = await prisma.insuranceQuoteRequest.create({
        data: {
          homeownerProfileId: homeownerProfile.id,
          propertyId,
          inventoryItemId: inventoryItemId || null,
          source,
          gapType: gapType || null,
          exposureCents: typeof exposureCents === 'number' ? exposureCents : null,
          currency,
          preferredContact: preferredContact || null,
          contactEmail: contactEmail || null,
          contactPhone: contactPhone || null,
          zipCode: zipCode || null,
          notes: notes || null,
          status: 'NEW',
        },
      });

      // OPTIONAL (recommended): create an in-app notification using your notifications system.
      // If you already have a helper/service, call it here. Otherwise keep V1 as DB-only.
      // Example pseudo:
      // await NotificationService.create({
      //   userId,
      //   propertyId,
      //   type: 'INSURANCE_QUOTE_REQUESTED',
      //   title: 'Insurance quote request submitted',
      //   message: 'We’ll follow up with options shortly.',
      //   entityType: 'INSURANCE_QUOTE_REQUEST',
      //   entityId: created.id,
      // });

      return res.json({ success: true, data: { quoteRequest: created } });
    } catch (err: any) {
      console.error('[INSURANCE_QUOTE] create failed', err);
      return res.status(500).json({ success: false, message: err.message || 'Failed to create quote request' });
    }
  }
);
