// apps/backend/src/modules/gazette/controllers/gazetteInternal.controller.ts
// Admin/internal gazette controller. Static methods, try/catch → next(error).

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../types/auth.types';
import { APIError } from '../../../middleware/error.middleware';
import { prisma } from '../../../lib/prisma';
import { GazetteMapper } from '../mappers/gazette.mapper';
import { GazetteGenerationJobRunnerService } from '../services/gazetteGenerationJobRunner.service';
import { GazettePublishService } from '../services/gazettePublish.service';
import { GenerationOptions } from '../types/gazette.types';

export class GazetteInternalController {
  /**
   * POST /api/internal/gazette/generate
   * Trigger gazette generation for a property.
   */
  static async generate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { propertyId, weekStart, weekEnd, dryRun = false } = req.body as {
        propertyId: string;
        weekStart?: string;
        weekEnd?: string;
        dryRun?: boolean;
      };

      const options: GenerationOptions = {
        propertyId,
        dryRun,
      };

      // Build custom week window if provided
      if (weekStart && weekEnd) {
        options.weekWindow = {
          weekStart: new Date(weekStart),
          weekEnd: new Date(weekEnd),
        };
      }

      const result = await GazetteGenerationJobRunnerService.generate(options);

      return res.status(dryRun ? 200 : 201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

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
   * POST /api/internal/gazette/editions/:editionId/regenerate
   * Safely regenerate an edition (reset + re-run).
   */
  static async regenerate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { editionId } = req.params;

      const result = await GazetteGenerationJobRunnerService.regenerateEdition(editionId);

      return res.json({
        success: true,
        data: result,
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

      const jobs = await GazetteGenerationJobRunnerService.getJobs({
        propertyId,
        stage,
        limit: limit ? parseInt(limit, 10) : undefined,
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
