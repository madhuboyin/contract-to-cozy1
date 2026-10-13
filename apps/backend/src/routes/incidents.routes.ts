// apps/backend/src/routes/incidents.routes.ts
import { Router } from 'express';
import {
  acknowledgeIncident,
  addSignal,
  createIncidentAction,
  createSuppressionRule,
  getIncident,
  listIncidents,
  setIncidentStatus,
  upsertIncident,
  evaluateIncidentNow,
  orchestrateIncidentNow,
  listIncidentEvents,
  confirmIncidentActionCreated,
  executeIncidentAction,
  reevaluateIncidentNow,
  updateIncidentPreferences,
  archiveIncident,
  restoreIncident,
  cancelAutoResolution,
} from '../controllers/incidents.controller';

import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * ✅ Property-scoped incidents (primary API surface)
 */
router.get(
  '/properties/:propertyId/incidents',
  authenticate,
  propertyAuthMiddleware,
  listIncidents
);

router.post(
  '/properties/:propertyId/incidents',
  authenticate,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  upsertIncident
);

/**
 * ✅ Incident detail (property-scoped to prevent IDOR)
 * Recommend controller uses (propertyId, incidentId) to ensure ownership.
 */
router.get(
  '/properties/:propertyId/incidents/:incidentId',
  authenticate,
  propertyAuthMiddleware,
  getIncident
);

/**
 * Signals
 */
router.post(
  '/properties/:propertyId/incidents/:incidentId/signals',
  authenticate,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  addSignal
);

/**
 * Actions
 * - createIncidentAction: creates an IncidentAction record (PROPOSED/CREATED)
 * - confirmIncidentActionCreated: used when a task is materialized so we can log ACTION_CREATED
 * - executeIncidentAction: optional - if you have server-side execution to materialize tasks
 */
router.post(
  '/properties/:propertyId/incidents/:incidentId/actions',
  authenticate,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  createIncidentAction
);

router.post(
  '/properties/:propertyId/incidents/:incidentId/actions/:actionId/confirm-created',
  authenticate,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  confirmIncidentActionCreated
);

router.post(
  '/properties/:propertyId/incidents/:incidentId/actions/:actionId/execute',
  authenticate,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  executeIncidentAction
);

/**
 * Acknowledgements + status
 */
router.post(
  '/properties/:propertyId/incidents/:incidentId/ack',
  authenticate,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  acknowledgeIncident
);

router.patch(
  '/properties/:propertyId/incidents/:incidentId/status',
  authenticate,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  setIncidentStatus
);

/**
 * Evaluation / orchestration
 * - evaluateIncidentNow: compute severity, update state, log SEVERITY_COMPUTED, etc.
 * - orchestrateIncidentNow: propose actions, log ACTION_PROPOSED (+ decisionTrace in payload)
 */
router.post(
  '/properties/:propertyId/incidents/:incidentId/evaluate',
  authenticate,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  evaluateIncidentNow
);

router.post(
  '/properties/:propertyId/incidents/:incidentId/orchestrate',
  authenticate,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  orchestrateIncidentNow
);

/**
 * Events (for timeline + decision trace retrieval)
 */
router.get(
  '/properties/:propertyId/incidents/:incidentId/events',
  authenticate,
  propertyAuthMiddleware,
  listIncidentEvents
);

/**
 * Suppression rules
 * ✅ Make property-scoped (aligns with snooze/dismiss UX and avoids cross-property IDOR)
 */
router.post(
  '/properties/:propertyId/incident-suppression-rules',
  authenticate,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  createSuppressionRule
);

router.post(
  '/properties/:propertyId/incidents/:incidentId/reevaluate',
  authenticate,
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  reevaluateIncidentNow
);

// ============================================================================
// INCIDENT LIFECYCLE MANAGEMENT
// ============================================================================

/**
 * Update incident user preferences (pin/archive)
 */
router.patch(
  '/properties/:propertyId/incidents/:incidentId/preferences',
  authenticate,
  propertyAuthMiddleware,
  updateIncidentPreferences
);

/**
 * Archive an incident
 */
router.post(
  '/properties/:propertyId/incidents/:incidentId/archive',
  authenticate,
  propertyAuthMiddleware,
  archiveIncident
);

/**
 * Restore an archived incident
 */
router.post(
  '/properties/:propertyId/incidents/:incidentId/restore',
  authenticate,
  propertyAuthMiddleware,
  restoreIncident
);

/**
 * Cancel auto-resolution for an incident
 */
router.post(
  '/properties/:propertyId/incidents/:incidentId/auto-resolution/cancel',
  authenticate,
  propertyAuthMiddleware,
  cancelAutoResolution
);

export default router;
