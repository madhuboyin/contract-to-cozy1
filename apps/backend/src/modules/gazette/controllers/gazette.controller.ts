// apps/backend/src/modules/gazette/controllers/gazette.controller.ts
// Homeowner-facing gazette controller. Static methods, try/catch → next(error).

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../types/auth.types';
import { APIError } from '../../../middleware/error.middleware';
import { prisma } from '../../../lib/prisma';
import { GazetteMapper } from '../mappers/gazette.mapper';
import { GazetteShareService } from '../services/gazetteShare.service';
import { shareTokenSchema, editionIdParamSchema } from '../validators/gazette.validators';
import { GazetteEdition } from '@prisma/client';
import { analyticsEmitter } from '../../../services/analytics/emitter';
import { AnalyticsModule, AnalyticsFeature, AnalyticsSource, ProductAnalyticsEventType } from '../../../services/analytics/taxonomy';

export class GazetteController {
  /**
   * GET /api/gazette/current?propertyId=xxx
   * Return the latest published edition for a property.
   */
  static async getCurrent(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId } = req.query as { propertyId: string };

      if (!propertyId) {
        throw new APIError('propertyId is required', 400, 'MISSING_PROPERTY_ID');
      }

      await GazetteController._verifyPropertyOwnership(propertyId, req.user!.userId);

      const edition = await prisma.gazetteEdition.findFirst({
        where: {
          propertyId,
          status: 'PUBLISHED' as any,
        },
        orderBy: { publishedAt: 'desc' },
        include: {
          stories: {
            orderBy: { rank: 'asc' },
          },
        },
      });

      if (!edition) {
        return res.json({
          success: true,
          data: null,
          message: 'No published edition found',
        });
      }

      // Analytics — gazette edition viewed
      analyticsEmitter.track({
        eventType: ProductAnalyticsEventType.FEATURE_OPENED,
        userId: req.user!.userId,
        propertyId,
        moduleKey: AnalyticsModule.GAZETTE,
        featureKey: AnalyticsFeature.GAZETTE_EDITION,
        source: AnalyticsSource.HOME_TOOLS,
      });

      return res.json({
        success: true,
        data: GazetteMapper.toEditionDto(edition as any),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/gazette/editions?propertyId=xxx&page=1&pageSize=10
   * Return paginated list of edition cards for a property.
   */
  static async getEditions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId, page = '1', pageSize = '10' } = req.query as {
        propertyId: string;
        page?: string;
        pageSize?: string;
      };

      if (!propertyId) {
        throw new APIError('propertyId is required', 400, 'MISSING_PROPERTY_ID');
      }

      await GazetteController._verifyPropertyOwnership(propertyId, req.user!.userId);

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSizeNum = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 10));
      const skip = (pageNum - 1) * pageSizeNum;

      const [editions, total] = await Promise.all([
        prisma.gazetteEdition.findMany({
          where: { propertyId },
          orderBy: { weekStart: 'desc' },
          skip,
          take: pageSizeNum,
        }),
        prisma.gazetteEdition.count({ where: { propertyId } }),
      ]);

      return res.json({
        success: true,
        data: {
          editions: editions.map((e) => GazetteMapper.toEditionCard(e)),
          pagination: {
            page: pageNum,
            pageSize: pageSizeNum,
            total,
            totalPages: Math.ceil(total / pageSizeNum),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/gazette/editions/:editionId
   * Return full edition detail with stories.
   */
  static async getEdition(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { editionId } = req.params;

      const edition = await GazetteController.verifyEditionOwnership(
        editionId,
        req.user!.userId,
      );

      const editionWithStories = await prisma.gazetteEdition.findUnique({
        where: { id: editionId },
        include: {
          stories: { orderBy: { rank: 'asc' } },
        },
      });

      if (!editionWithStories) {
        throw new APIError('Edition not found', 404, 'EDITION_NOT_FOUND');
      }

      return res.json({
        success: true,
        data: GazetteMapper.toEditionDto(editionWithStories as any),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/gazette/editions/:editionId/share
   * Create a share link for a published edition.
   */
  static async createShare(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { editionId } = req.params;

      const edition = await GazetteController.verifyEditionOwnership(
        editionId,
        req.user!.userId,
      );

      const { rawToken, shareLink } = await GazetteShareService.createShareLink(
        editionId,
        edition.propertyId,
        req.body?.metadata,
      );

      // Analytics — share created
      analyticsEmitter.track({
        eventType: ProductAnalyticsEventType.TOOL_USED,
        userId: req.user!.userId,
        propertyId: edition.propertyId,
        moduleKey: AnalyticsModule.GAZETTE,
        featureKey: AnalyticsFeature.GAZETTE_SHARE,
        source: AnalyticsSource.HOME_TOOLS,
        metadataJson: { editionId },
      });

      return res.status(201).json({
        success: true,
        data: {
          shareLink: GazetteMapper.toShareLinkDto(shareLink, rawToken),
          shareUrl: `/gazette/share/${rawToken}`,
          note: 'Store the rawToken securely — it will not be shown again.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/gazette/share/:token/revoke
   * Revoke a share link by its raw token.
   */
  static async revokeShare(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;

      if (!token) {
        throw new APIError('Token is required', 400, 'MISSING_TOKEN');
      }

      // Validate token format before hashing/lookup
      const tokenParse = shareTokenSchema.safeParse(token);
      if (!tokenParse.success) {
        throw new APIError('Share link not found', 404, 'SHARE_LINK_NOT_FOUND');
      }

      const tokenHash = GazetteShareService.hashToken(token);
      const shareLink = await GazetteShareService.revokeShareLink(
        tokenHash,
        req.user!.userId,
      );

      return res.json({
        success: true,
        data: GazetteMapper.toShareLinkDto(shareLink),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/gazette/share/:token (public — no auth required)
   * Return a share-safe view of an edition using a raw share token.
   */
  static async getPublicEdition(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;

      if (!token) {
        throw new APIError('Token is required', 400, 'MISSING_TOKEN');
      }

      // Validate token format before hitting the DB — prevents timing attacks on arbitrary strings
      const tokenParse = shareTokenSchema.safeParse(token);
      if (!tokenParse.success) {
        throw new APIError('Share link not found or expired', 404, 'SHARE_LINK_NOT_FOUND');
      }

      const { edition, shareLink } = await GazetteShareService.getPublicEdition(token);

      return res.json({
        success: true,
        data: {
          edition,
          shareInfo: {
            viewCount: shareLink.viewCount,
            expiresAt: shareLink.expiresAt,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Verify that a property belongs to the authenticated user's homeowner profile.
   */
  private static async _verifyPropertyOwnership(
    propertyId: string,
    userId: string,
  ): Promise<void> {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId },
      },
    });

    if (!property) {
      throw new APIError('Property not found or access denied', 404, 'PROPERTY_NOT_FOUND');
    }
  }

  /**
   * Load an edition and verify it belongs to the authenticated user.
   */
  static async verifyEditionOwnership(
    editionId: string,
    userId: string,
  ): Promise<GazetteEdition> {
    const edition = await prisma.gazetteEdition.findUnique({
      where: { id: editionId },
    });

    if (!edition) {
      throw new APIError('Edition not found', 404, 'EDITION_NOT_FOUND');
    }

    // Verify the property belongs to this user
    const property = await prisma.property.findFirst({
      where: {
        id: edition.propertyId,
        homeownerProfile: { userId },
      },
    });

    if (!property) {
      throw new APIError('Edition not found or access denied', 404, 'EDITION_NOT_FOUND');
    }

    return edition;
  }
}
