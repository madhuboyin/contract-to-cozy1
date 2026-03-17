// apps/backend/src/modules/gazette/services/gazetteShare.service.ts
// Handles share link creation, revocation, and public edition access.

import { createHash, randomBytes } from 'crypto';
import { GazetteShareLink } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';
import { GazetteEditionDto } from '../dto/gazette.dto';
import { GazetteMapper } from '../mappers/gazette.mapper';

const SHARE_LINK_EXPIRY_DAYS = 30;

export class GazetteShareService {
  /**
   * Create a share link for a published edition.
   * Returns the raw token (never stored) and the share link record.
   */
  static async createShareLink(
    editionId: string,
    propertyId: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ rawToken: string; shareLink: GazetteShareLink }> {
    // Verify edition is published
    const edition = await prisma.gazetteEdition.findFirst({
      where: { id: editionId, propertyId },
    });

    if (!edition) {
      throw new APIError('Edition not found', 404, 'EDITION_NOT_FOUND');
    }

    if (edition.status !== 'PUBLISHED') {
      throw new APIError(
        'Only published editions can be shared',
        400,
        'EDITION_NOT_PUBLISHED',
      );
    }

    // Generate raw token and hash it
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = GazetteShareService.hashToken(rawToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SHARE_LINK_EXPIRY_DAYS);

    const shareLink = await prisma.gazetteShareLink.create({
      data: {
        editionId,
        propertyId,
        tokenHash,
        status: 'ACTIVE' as any,
        expiresAt,
        metadataJson: (metadata ?? undefined) as any,
      },
    });

    return { rawToken, shareLink };
  }

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
   * Retrieve a public edition using a raw share token.
   * Only returns share-safe stories. Increments view count.
   */
  static async getPublicEdition(
    rawToken: string,
  ): Promise<{ edition: GazetteEditionDto; shareLink: GazetteShareLink }> {
    const tokenHash = GazetteShareService.hashToken(rawToken);
    const now = new Date();

    const shareLink = await prisma.gazetteShareLink.findFirst({
      where: {
        tokenHash,
        status: 'ACTIVE' as any,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    if (!shareLink) {
      throw new APIError('Share link not found or expired', 404, 'SHARE_LINK_NOT_FOUND');
    }

    // Load edition with share-safe stories only
    const edition = await prisma.gazetteEdition.findFirst({
      where: { id: shareLink.editionId },
      include: {
        stories: {
          where: { shareSafe: true },
          orderBy: { rank: 'asc' },
        },
      },
    });

    if (!edition) {
      throw new APIError('Edition not found', 404, 'EDITION_NOT_FOUND');
    }

    // Increment view count and update last viewed
    const updatedShareLink = await prisma.gazetteShareLink.update({
      where: { id: shareLink.id },
      data: {
        viewCount: { increment: 1 },
        lastViewedAt: now,
      },
    });

    const editionDto = GazetteMapper.toPublicEditionDto(edition as any);

    return { edition: editionDto, shareLink: updatedShareLink };
  }

  /**
   * Hash a raw token using SHA-256.
   * Used for revoke: client provides rawToken, we hash to look up.
   */
  static hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
