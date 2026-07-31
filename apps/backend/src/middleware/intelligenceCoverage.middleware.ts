import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger';

type CoverageCapability = 'HOME_RISK_REPLAY' | 'NEIGHBORHOOD_RADAR';

const REVIEWED_COVERAGE_FLAGS: Record<CoverageCapability, string> = {
  HOME_RISK_REPLAY: 'HOME_RISK_REPLAY_REVIEWED_COVERAGE_ENABLED',
  NEIGHBORHOOD_RADAR: 'NEIGHBORHOOD_REVIEWED_COVERAGE_ENABLED',
};

/**
 * External-intelligence features fail closed in production until a reviewed
 * live source and its coverage contract have been explicitly enabled.
 * Development and test environments remain available for fixtures and QA.
 */
export function requireReviewedIntelligenceCoverage(capability: CoverageCapability) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const flag = REVIEWED_COVERAGE_FLAGS[capability];
    const isProduction = process.env.NODE_ENV === 'production';
    const reviewedCoverageEnabled = process.env[flag] === 'true';

    if (!isProduction || reviewedCoverageEnabled) {
      next();
      return;
    }

    logger.warn(
      {
        capability,
        propertyId: req.params.propertyId,
        coverageFlag: flag,
      },
      '[PROPERTY-INTELLIGENCE] Blocked output without reviewed live source coverage',
    );

    res.status(503).json({
      success: false,
      code: 'REVIEWED_SOURCE_COVERAGE_REQUIRED',
      message:
        'This intelligence view is unavailable until reviewed live source coverage is configured for this environment.',
      coverage: {
        status: 'NOT_CONFIGURED',
        comprehensive: false,
        checkedThrough: null,
      },
    });
  };
}
