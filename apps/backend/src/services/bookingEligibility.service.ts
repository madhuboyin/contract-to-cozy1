// apps/backend/src/services/bookingEligibility.service.ts
//
// Booking-time eligibility gate. See
// docs/functional/PROVIDER_TRUST_COMPLIANCE_FRD.md, Section 7.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import { ProviderCredentialType, ServiceCategory } from '@prisma/client';

export type EligibilityCheck = {
  isEligible: boolean;
  missingCredentialTypes: ProviderCredentialType[];
};

class BookingEligibilityService {
  /**
   * Single indexed read against ProviderCategoryEligibility — no live
   * credential joins, so this is cheap enough to run on every booking
   * creation and confirmation (Section 7).
   *
   * Fails closed on a cache miss (no row ever computed for this
   * provider+category): treated as not eligible rather than silently
   * passing, since "no evidence reviewed" is exactly the state this
   * feature exists to catch. A missing row usually means
   * ProviderComplianceService.recomputeProviderStatus hasn't run yet for
   * this provider — the missing-credential sweep job (Section 11) and
   * every credential lifecycle event should keep this populated.
   */
  async checkProviderEligibility(providerProfileId: string, category: ServiceCategory): Promise<EligibilityCheck> {
    const record = await prisma.providerCategoryEligibility.findUnique({
      where: {
        providerProfileId_serviceCategory: {
          providerProfileId,
          serviceCategory: category,
        },
      },
      select: { isEligible: true, missingCredentialTypes: true },
    });

    if (!record) {
      logger.warn(
        { providerProfileId, category },
        '[BOOKING_ELIGIBILITY] no cached ProviderCategoryEligibility row — treating as ineligible'
      );
      return { isEligible: false, missingCredentialTypes: [] };
    }

    return { isEligible: record.isEligible, missingCredentialTypes: record.missingCredentialTypes };
  }

  /**
   * Hard gate at PENDING -> CONFIRMED (Section 7.2). Booking creation itself
   * stays a soft warning so window-shopping isn't blocked; confirmation is
   * where a provider losing eligibility between browse and confirm actually
   * matters.
   */
  async assertProviderEligible(providerProfileId: string, category: ServiceCategory): Promise<void> {
    const { isEligible, missingCredentialTypes } = await this.checkProviderEligibility(providerProfileId, category);

    if (!isEligible) {
      throw new APIError(
        `This provider is not currently verified for ${category}${
          missingCredentialTypes.length ? ` (missing: ${missingCredentialTypes.join(', ')})` : ''
        }`,
        400,
        'PROVIDER_NOT_ELIGIBLE',
        { providerProfileId, category, missingCredentialTypes }
      );
    }
  }
}

export const bookingEligibilityService = new BookingEligibilityService();
