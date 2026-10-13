// apps/backend/src/routes/homeHabitCoach.routes.ts

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { validateBody, validate } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

import {
  listHabits,
  getSpotlightHabit,
  getHabitHistory,
  getHabitDetail,
  generateHabits,
  adoptHabit,
  completeHabit,
  snoozeHabit,
  skipHabit,
  dismissHabit,
  reopenHabit,
  recordViewed,
  getPreferences,
  updatePreferences,
} from '../controllers/homeHabitCoach.controller';

import {
  listHabitsQuerySchema,
  listHistoryQuerySchema,
  snoozeHabitBodySchema,
  completeHabitBodySchema,
  skipHabitBodySchema,
  dismissHabitBodySchema,
  updatePreferencesBodySchema,
} from '../validators/homeHabitCoach.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// ── Read ─────────────────────────────────────────────────────────────────────

router.get(
  '/properties/:propertyId/home-habits',
  propertyAuthMiddleware,
  validate(listHabitsQuerySchema.transform((q) => ({ query: q }))),
  listHabits,
);

// NOTE: specific named sub-paths must come BEFORE /:habitId to avoid being swallowed by the param route
router.get(
  '/properties/:propertyId/home-habits/spotlight',
  propertyAuthMiddleware,
  getSpotlightHabit,
);

router.get(
  '/properties/:propertyId/home-habits/history',
  propertyAuthMiddleware,
  validate(listHistoryQuerySchema.transform((q) => ({ query: q }))),
  getHabitHistory,
);

router.get(
  '/properties/:propertyId/home-habits/preferences',
  propertyAuthMiddleware,
  getPreferences,
);

router.get(
  '/properties/:propertyId/home-habits/:habitId',
  propertyAuthMiddleware,
  getHabitDetail,
);

// ── Generation ────────────────────────────────────────────────────────────────

router.post(
  '/properties/:propertyId/home-habits/generate',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  generateHabits,
);

// ── Actions ───────────────────────────────────────────────────────────────────

router.post(
  '/properties/:propertyId/home-habits/:habitId/adopt',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  adoptHabit,
);

router.post(
  '/properties/:propertyId/home-habits/:habitId/complete',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(completeHabitBodySchema),
  completeHabit,
);

router.post(
  '/properties/:propertyId/home-habits/:habitId/snooze',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(snoozeHabitBodySchema),
  snoozeHabit,
);

router.post(
  '/properties/:propertyId/home-habits/:habitId/skip',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(skipHabitBodySchema),
  skipHabit,
);

router.post(
  '/properties/:propertyId/home-habits/:habitId/dismiss',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(dismissHabitBodySchema),
  dismissHabit,
);

router.post(
  '/properties/:propertyId/home-habits/:habitId/reopen',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  reopenHabit,
);

router.post(
  '/properties/:propertyId/home-habits/:habitId/viewed',
  propertyAuthMiddleware,
  recordViewed,
);

// ── Preferences ───────────────────────────────────────────────────────────────

router.patch(
  '/properties/:propertyId/home-habits/preferences',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(updatePreferencesBodySchema),
  updatePreferences,
);

export default router;
