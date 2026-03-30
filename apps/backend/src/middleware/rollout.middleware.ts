// apps/backend/src/middleware/rollout.middleware.ts
//
// Express middleware for cohort-gating tool endpoints.
// Wraps isToolEnabled to provide 503 responses for users not yet in a rollout cohort.

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth.types';
import { isToolEnabled, TOOL_FLAGS, RolloutCohort, cohortFromPct } from '../config/featureFlags';

// ============================================================================
// requireRollout — Express middleware factory
// ============================================================================

/**
 * Returns an Express middleware that gates the route behind a rollout flag.
 *
 * If the requesting user is not in the flag's rollout cohort, responds with 503
 * and the TOOL_NOT_IN_ROLLOUT error code. Otherwise calls next().
 *
 * Usage:
 *   router.get('/my-tool', authenticate, requireRollout('MY_TOOL'), handler);
 */
export function requireRollout(flagKey: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const userId = req.user?.userId ?? undefined;

    if (!isToolEnabled(flagKey, userId)) {
      res.status(503).json({
        success: false,
        error: {
          message: 'This feature is not yet available in your rollout cohort.',
          code: 'TOOL_NOT_IN_ROLLOUT',
          rolloutKey: flagKey,
        },
      });
      return;
    }

    next();
  };
}

// ============================================================================
// checkRolloutStatus — utility for health checks / admin endpoints
// ============================================================================

/**
 * Returns the current rollout status for a given flag and optional user.
 * Does not throw — safe to call from health/admin endpoints.
 */
export function checkRolloutStatus(
  flagKey: string,
  userId?: string,
): { enabled: boolean; cohort: RolloutCohort; rolloutPct: number } {
  const flag = TOOL_FLAGS[flagKey];
  if (!flag) {
    return { enabled: false, cohort: 'DISABLED', rolloutPct: 0 };
  }
  return {
    enabled: isToolEnabled(flagKey, userId),
    cohort: cohortFromPct(flag.rolloutPct),
    rolloutPct: flag.rolloutPct,
  };
}
