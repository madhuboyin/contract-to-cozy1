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
  listIncidentEvents,
  orchestrateIncidentNow,
  confirmIncidentActionCreated,
} from '../controllers/incidents.controller';
import { executeIncidentAction } from '../controllers/incidents.controller';

import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware'; // adjust path if needed
import { authenticate } from '../middleware/auth.middleware'; // adjust to your auth middleware

const router = Router();

/**
 * Property-scoped
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
  upsertIncident
);

/**
 * Incident-scoped
 */
router.get('/incidents/:incidentId', authenticate, getIncident);

router.post('/incidents/:incidentId/signals', authenticate, addSignal);
router.post('/incidents/:incidentId/actions', authenticate, createIncidentAction);
router.post('/incidents/:incidentId/ack', authenticate, acknowledgeIncident);
router.patch('/incidents/:incidentId/status', authenticate, setIncidentStatus);

/**
 * Suppression rules
 * (Could also be property-scoped; leaving flexible for now.)
 */
router.post('/incident-suppression-rules', authenticate, createSuppressionRule);
router.post('/incidents/:incidentId/evaluate', authenticate, evaluateIncidentNow);
router.post('/incidents/:incidentId/orchestrate', authenticate, orchestrateIncidentNow);
router.get('/incidents/:incidentId/events', authenticate, listIncidentEvents);
router.post('/incidents/:incidentId/actions/:actionId/confirm-created', authenticate, confirmIncidentActionCreated);
router.post('/incidents/:incidentId/actions/:actionId/execute', authenticate, executeIncidentAction);

export default router;
