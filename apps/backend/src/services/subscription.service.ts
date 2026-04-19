// apps/backend/src/services/subscription.service.ts

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export type SubscriptionTier = 'FREE' | 'PREMIUM' | 'PRO';

export interface TierLimits {
  maxProperties: number;
  maxVaultItems: number;
  maxMagicScansPerMonth: number;
  hasPrioritySupport: boolean;
  hasCertifiedReports: boolean;
}

const TIER_CONFIG: Record<SubscriptionTier, TierLimits> = {
  FREE: {
    maxProperties: 1,
    maxVaultItems: 10,
    maxMagicScansPerMonth: 3,
    hasPrioritySupport: false,
    hasCertifiedReports: false,
  },
  PREMIUM: {
    maxProperties: 5,
    maxVaultItems: 500,
    maxMagicScansPerMonth: 100,
    hasPrioritySupport: true,
    hasCertifiedReports: true,
  },
  PRO: {
    maxProperties: 25,
    maxVaultItems: 5000,
    maxMagicScansPerMonth: 1000,
    hasPrioritySupport: true,
    hasCertifiedReports: true,
  }
};

export class SubscriptionService {
  /**
   * Get the current tier for a user.
   * Defaults to FREE if no subscription record exists.
   */
  async getUserTier(userId: string): Promise<SubscriptionTier> {
    try {
      const profile = await prisma.homeownerProfile.findUnique({
        where: { userId },
        select: { 
          id: true,
          // Assuming there's a field for tier in the profile or a related subscription table
          // For now we'll check a simulated 'tier' field or default to FREE
        }
      });

      // MOCK: In a real app, you'd check a `Subscription` table or Stripe status
      // We'll use a metadata field or default
      return 'FREE'; 
    } catch (error) {
      logger.error({ err: error, userId }, 'Error fetching user tier');
      return 'FREE';
    }
  }

  /**
   * Check if a user has access to a specific feature based on their tier.
   */
  async canUseFeature(userId: string, feature: keyof TierLimits): Promise<boolean> {
    const tier = await this.getUserTier(userId);
    const limits = TIER_CONFIG[tier];
    const value = limits[feature];
    
    if (typeof value === 'boolean') return value;
    return value > 0;
  }

  /**
   * Check if a user has reached their limit for a specific measurable resource.
   */
  async hasRemainingLimit(userId: string, feature: 'maxVaultItems' | 'maxMagicScansPerMonth'): Promise<boolean> {
    const tier = await this.getUserTier(userId);
    const limits = TIER_CONFIG[tier];
    const limitValue = limits[feature];

    if (feature === 'maxVaultItems') {
      const homeownerProfile = await prisma.homeownerProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      const uploadOwners = homeownerProfile
        ? [userId, homeownerProfile.id]
        : [userId];

      const count = await prisma.document.count({
        where: { uploadedBy: { in: uploadOwners } }
      });
      return count < limitValue;
    }

    if (feature === 'maxMagicScansPerMonth') {
      // Assuming we track scans in an analytics or log table
      // For now, allow
      return true;
    }

    return true;
  }

  getTierConfig(tier: SubscriptionTier): TierLimits {
    return TIER_CONFIG[tier];
  }
}

export const subscriptionService = new SubscriptionService();
