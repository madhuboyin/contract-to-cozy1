// apps/backend/src/modules/gazette/controllers/gazetteInternal.controller.ts
// Admin/internal gazette controller. Static methods, try/catch → next(error).

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../types/auth.types';
import { prisma } from '../../../lib/prisma';
import { GazetteMapper } from '../mappers/gazette.mapper';

export class GazetteInternalController {
  /**
   * GET /api/internal/gazette/editions/:editionId/trace
   * Return all selection traces for an edition.
   */
  static async getTrace(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { editionId } = req.params;

      const traces = await prisma.gazetteSelectionTrace.findMany({
        where: { editionId },
        orderBy: [{ included: 'desc' }, { finalRank: 'asc' }],
      });

      return res.json({
        success: true,
        data: traces.map((t) => GazetteMapper.toTraceDto(t)),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/internal/gazette/editions/:editionId/candidates
   * Return all candidates for an edition.
   */
  static async getCandidates(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { editionId } = req.params;

      const candidates = await prisma.gazetteStoryCandidate.findMany({
        where: { editionId },
        orderBy: [{ selectionRank: 'asc' }, { compositeScore: 'desc' }],
      });

      return res.json({
        success: true,
        data: candidates.map((c) => GazetteMapper.toCandidateDto(c)),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/internal/gazette/jobs?propertyId=&stage=&limit=
   * List generation jobs with optional filters.
   */
  static async getJobs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId, stage, limit } = req.query as {
        propertyId?: string;
        stage?: string;
        limit?: string;
      };

      const requestedLimit = Number.parseInt(limit ?? '50', 10);
      const jobs = await prisma.gazetteGenerationJob.findMany({
        where: {
          ...(propertyId ? { propertyId } : {}),
          ...(stage ? { stage: stage as never } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: Number.isFinite(requestedLimit)
          ? Math.min(200, Math.max(1, requestedLimit))
          : 50,
      });

      return res.json({
        success: true,
        data: jobs.map((j) => GazetteMapper.toJobDto(j)),
      });
    } catch (err) {
      next(err);
    }
  }
}
