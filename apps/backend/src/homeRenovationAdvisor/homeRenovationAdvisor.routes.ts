// apps/backend/src/homeRenovationAdvisor/homeRenovationAdvisor.routes.ts
//
// Routes for the Home Renovation Risk Advisor feature.
// All routes require authentication. Property ownership is verified in the service layer
// (since sessions reference propertyId, not a :propertyId URL param for most routes).

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { HomeRenovationAdvisorController } from './homeRenovationAdvisor.controller';
import {
  createSessionSchema,
  evaluateSessionSchema,
  updateComplianceChecklistSchema,
  updateSessionSchema,
} from './validators/homeRenovationAdvisor.validators';

const router = Router();

// ---------------------------------------------------------------------------
// METADATA (public to authenticated users, no property scope)
// ---------------------------------------------------------------------------

// GET /api/home-renovation-advisor/metadata
router.get(
  '/home-renovation-advisor/metadata',
  authenticate,
  HomeRenovationAdvisorController.getMetadata,
);

// ---------------------------------------------------------------------------
// SESSION MANAGEMENT
// ---------------------------------------------------------------------------

// POST /api/home-renovation-advisor/sessions
router.post(
  '/home-renovation-advisor/sessions',
  authenticate,
  validateBody(createSessionSchema),
  HomeRenovationAdvisorController.createSession,
);

// PATCH /api/home-renovation-advisor/sessions/:id
router.patch(
  '/home-renovation-advisor/sessions/:id',
  authenticate,
  validateBody(updateSessionSchema),
  HomeRenovationAdvisorController.updateSession,
);

// POST /api/home-renovation-advisor/sessions/:id/evaluate
router.post(
  '/home-renovation-advisor/sessions/:id/evaluate',
  authenticate,
  validateBody(evaluateSessionSchema),
  HomeRenovationAdvisorController.evaluateSession,
);

// GET /api/home-renovation-advisor/sessions/:id
router.get(
  '/home-renovation-advisor/sessions/:id',
  authenticate,
  HomeRenovationAdvisorController.getSession,
);

// POST /api/home-renovation-advisor/sessions/:id/archive
router.post(
  '/home-renovation-advisor/sessions/:id/archive',
  authenticate,
  HomeRenovationAdvisorController.archiveSession,
);

// PATCH /api/home-renovation-advisor/sessions/:id/compliance
router.patch(
  '/home-renovation-advisor/sessions/:id/compliance',
  authenticate,
  validateBody(updateComplianceChecklistSchema),
  HomeRenovationAdvisorController.updateComplianceChecklist,
);

// ---------------------------------------------------------------------------
// PROPERTY-SCOPED SESSION LIST
// ---------------------------------------------------------------------------

// GET /api/properties/:propertyId/home-renovation-advisor/sessions
router.get(
  '/properties/:propertyId/home-renovation-advisor/sessions',
  authenticate,
  propertyAuthMiddleware,
  HomeRenovationAdvisorController.listSessions,
);

export default router;
