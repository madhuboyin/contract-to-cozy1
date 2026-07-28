import { Response } from 'express';
import { CustomRequest } from '../types';
import { logger } from '../lib/logger';
import { savingsBenefitsUnifiedService } from '../services/savingsBenefitsUnified.service';

function requireUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) throw new Error('Authentication required.');
  return userId;
}

// ============================================================================
// GET /properties/:propertyId/savings-benefits
// ============================================================================

export async function getSavingsBenefitsUnifiedForProperty(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const { propertyId } = req.params;

    const result = await savingsBenefitsUnifiedService.getUnified(propertyId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const status =
      error?.message === 'Authentication required.' ? 401 :
      error?.message === 'Property not found or access denied.' ? 404 :
      500;
    logger.error({ err: error }, '[SavingsBenefitsUnified] getSavingsBenefitsUnifiedForProperty error');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to fetch unified savings and benefits view.',
    });
  }
}
