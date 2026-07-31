// apps/backend/src/modules/gazette/services/gazetteShare.service.ts
// Preserves owner revocation for legacy share links. Creation and public
// access are retired at the route boundary.

import { createHash } from 'crypto';
import { GazetteShareLink } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';

export class GazetteShareService {
  /**
   * Revoke an active share link. Verifies ownership via userId.
   */
  static async revokeShareLink(
    tokenHash: string,
    userId: string,
  ): Promise<GazetteShareLink> {
    const shareLink = await prisma.gazetteShareLink.findFirst({
      where: { tokenHash },
    });

    if (!shareLink) {
      throw new APIError('Share link not found', 404, 'SHARE_LINK_NOT_FOUND');
    }

    // Verify ownership via property → homeownerProfile
    const property = await prisma.property.findFirst({
      where: {
        id: shareLink.propertyId,
        homeownerProfile: { userId },
      },
    });

    if (!property) {
      throw new APIError('Access denied', 403, 'FORBIDDEN');
    }

    const updated = await prisma.gazetteShareLink.update({
      where: { id: shareLink.id },
      data: {
        status: 'REVOKED' as any,
        revokedAt: new Date(),
      },
    });

    return updated;
  }

  /**
   * Hash a raw token using SHA-256.
   * Used for revoke: client provides rawToken, we hash to look up.
   */
  static hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
