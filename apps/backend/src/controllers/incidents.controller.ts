// apps/backend/src/controllers/incidents.controller.ts
import { Response } from 'express';
import { IncidentService } from '../services/incidents/incident.service';
import { CustomRequest } from '../types';
import { IncidentStatus, IncidentEventType } from '@prisma/client';
import { evaluateIncident } from '../services/incidents/incident.evaluator';
import { orchestrateIncident } from '../services/incidents/incident.orchestrator';
import { prisma } from '../lib/prisma';
import { IncidentExecutionService } from '../services/incidents/incident.execution.service';

/**
 * Helper: enforce incident belongs to property (prevents IDOR)
 */
async function assertIncidentInPropertyOr404(params: {
  propertyId?: string;
  incidentId: string;
}) {
  const { propertyId, incidentId } = params;
  if (!propertyId) return null;

  return prisma.incident.findFirst({
    where: { id: incidentId, propertyId },
    select: { id: true, propertyId: true },
  });
}

export const executeIncidentAction = async (req: CustomRequest, res: Response) => {
  try {
    const { propertyId, incidentId, actionId } = req.params as any;
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    // ✅ enforce property ownership
    const exists = await assertIncidentInPropertyOr404({ propertyId, incidentId });
    if (!exists) return res.status(404).json({ message: 'Incident not found' });

    const result = await IncidentExecutionService.executeAction({
      incidentId,
      actionId,
      userId,
    });

    return res.json(result);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to execute incident action' });
  }
};

export const evaluateIncidentNow = async (req: CustomRequest, res: Response) => {
  try {
    const { propertyId, incidentId } = req.params as any;

    // ✅ enforce property ownership
    const exists = await assertIncidentInPropertyOr404({ propertyId, incidentId });
    if (!exists) return res.status(404).json({ message: 'Incident not found' });

    const updated = await evaluateIncident(incidentId);
    return res.json(updated);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to evaluate incident' });
  }
};

export const orchestrateIncidentNow = async (req: CustomRequest, res: Response) => {
  try {
    const { propertyId, incidentId } = req.params as any;

    // ✅ enforce property ownership
    const exists = await assertIncidentInPropertyOr404({ propertyId, incidentId });
    if (!exists) return res.status(404).json({ message: 'Incident not found' });

    const updated = await orchestrateIncident(incidentId);
    return res.json(updated);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to orchestrate incident' });
  }
};

export const listIncidentEvents = async (req: CustomRequest, res: Response) => {
  try {
    const { propertyId, incidentId } = req.params as any;
    const limit = req.query.limit
      ? Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10)))
      : 50;

    // ✅ enforce property ownership
    const exists = await assertIncidentInPropertyOr404({ propertyId, incidentId });
    if (!exists) return res.status(404).json({ message: 'Incident not found' });

    const events = await prisma.incidentEvent.findMany({
      where: { incidentId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return res.json({ items: events });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Failed to list incident events' });
  }
};

/**
 * When user clicks CTA and your system creates a real Task (or later, Booking),
 * call this endpoint to link it and flip status -> ACTIONED.
 */
export const confirmIncidentActionCreated = async (req: CustomRequest, res: Response) => {
  try {
    const { propertyId, incidentId, actionId } = req.params as any;
    const { entityType, entityId } = req.body || {};
    if (!entityType || !entityId) {
      return res.status(400).json({ message: 'entityType and entityId are required' });
    }

    // ✅ enforce property ownership
    const exists = await assertIncidentInPropertyOr404({ propertyId, incidentId });
    if (!exists) return res.status(404).json({ message: 'Incident not found' });

    // ✅ ensure action belongs to incident (prevents cross-incident linking)
    const action = await prisma.incidentAction.findFirst({
      where: { id: actionId, incidentId },
      select: { id: true },
    });
    if (!action) return res.status(404).json({ message: 'Incident action not found' });

    const updatedAction = await prisma.incidentAction.update({
      where: { id: actionId },
      data: {
        status: 'CREATED',
        entityType,
        entityId,
      },
    });

    await prisma.incident.update({
      where: { id: incidentId },
      data: { status: 'ACTIONED' },
    });

    return res.json(updatedAction);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to confirm incident action' });
  }
};

export const listIncidents = async (req: CustomRequest, res: Response) => {
  try {
    const propertyId = req.params.propertyId;
    const status = req.query.status as IncidentStatus | undefined;
    const includeSuppressed = String(req.query.includeSuppressed || 'false') === 'true';
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

    const out = await IncidentService.listIncidents({
      propertyId,
      status,
      includeSuppressed,
      limit,
      cursor,
    });

    return res.json(out);
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Failed to list incidents' });
  }
};

/**
 * ✅ Detail-ready incident endpoint (property-scoped)
 * Returns incident + signals/actions/ack, and includes latest ACTION_PROPOSED event payload
 * so UI can render decisionTrace without schema changes.
 */
export const getIncident = async (req: CustomRequest, res: Response) => {
  try {
    const { propertyId, incidentId } = req.params as any;

    // ✅ enforce property ownership + include detail
    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, propertyId },
      include: {
        signals: { orderBy: { createdAt: 'desc' }, take: 25 },
        actions: { orderBy: { createdAt: 'desc' }, take: 25 },
        acknowledgements: { orderBy: { createdAt: 'desc' }, take: 25 },
      },
    });

    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    // Pull latest decision trace from ACTION_PROPOSED event payload (if present)
    const latestProposalEvent = await prisma.incidentEvent.findFirst({
      where: { incidentId, type: IncidentEventType.ACTION_PROPOSED },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      incident,
      latestActionProposedEvent: latestProposalEvent ?? null,
      // convenience: extract decisionTrace if your orchestrator logs it in payload
      decisionTrace: (latestProposalEvent?.payload as any)?.decisionTrace ?? null,
    });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Failed to get incident' });
  }
};

export const upsertIncident = async (req: CustomRequest, res: Response) => {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    const body = req.body || {};
    const incident = await IncidentService.upsertIncident(
      {
        propertyId,
        userId,
        sourceType: body.sourceType,
        typeKey: body.typeKey,
        category: body.category,
        title: body.title,
        summary: body.summary,
        details: body.details,
        severity: body.severity,
        severityScore: body.severityScore,
        scoreBreakdown: body.scoreBreakdown,
        confidence: body.confidence,
        fingerprint: body.fingerprint,
        recurrenceKey: body.recurrenceKey,
        dedupeWindowMins: body.dedupeWindowMins,
        status: body.status,
      },
      body.signals
    );

    return res.status(201).json(incident);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to upsert incident' });
  }
};

export const addSignal = async (req: CustomRequest, res: Response) => {
  try {
    const { propertyId, incidentId } = req.params as any;

    // ✅ enforce property ownership
    const exists = await assertIncidentInPropertyOr404({ propertyId, incidentId });
    if (!exists) return res.status(404).json({ message: 'Incident not found' });

    const created = await IncidentService.addSignal(incidentId, req.body);
    return res.status(201).json(created);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to add signal' });
  }
};

export const setIncidentStatus = async (req: CustomRequest, res: Response) => {
  try {
    const { propertyId, incidentId } = req.params as any;
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ message: 'status is required' });

    // ✅ enforce property ownership
    const exists = await assertIncidentInPropertyOr404({ propertyId, incidentId });
    if (!exists) return res.status(404).json({ message: 'Incident not found' });

    const updated = await IncidentService.setStatus(incidentId, status);
    return res.json(updated);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to update status' });
  }
};

export const acknowledgeIncident = async (req: CustomRequest, res: Response) => {
  try {
    const { propertyId, incidentId } = req.params as any;
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    // ✅ enforce property ownership
    const exists = await assertIncidentInPropertyOr404({ propertyId, incidentId });
    if (!exists) return res.status(404).json({ message: 'Incident not found' });

    const ack = await IncidentService.acknowledge(incidentId, userId, req.body);
    return res.status(201).json(ack);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to acknowledge incident' });
  }
};

export const createIncidentAction = async (req: CustomRequest, res: Response) => {
  try {
    const { propertyId, incidentId } = req.params as any;

    // ✅ enforce property ownership
    const exists = await assertIncidentInPropertyOr404({ propertyId, incidentId });
    if (!exists) return res.status(404).json({ message: 'Incident not found' });

    const created = await IncidentService.createAction(incidentId, req.body);
    return res.status(201).json(created);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to create incident action' });
  }
};

export const createSuppressionRule = async (req: CustomRequest, res: Response) => {
  try {
    // If you make this property-scoped route, you can optionally inject propertyId here:
    // const { propertyId } = req.params;
    // const created = await IncidentService.createSuppressionRule({ ...req.body, propertyId });

    const created = await IncidentService.createSuppressionRule(req.body);
    return res.status(201).json(created);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to create suppression rule' });
  }
};

/**
 * Re-evaluate an incident end-to-end:
 * 1) Recompute severity / state
 * 2) Run orchestration (propose actions, decision trace)
 *
 * Used by UI "Re-evaluate" button.
 */
export const reevaluateIncidentNow = async (req: CustomRequest, res: Response) => {
  try {
    const { propertyId, incidentId } = req.params as any;

    // ✅ Enforce property ownership (IDOR protection)
    const exists = await prisma.incident.findFirst({
      where: { id: incidentId, propertyId },
      select: { id: true },
    });
    if (!exists) {
      return res.status(404).json({ message: 'Incident not found' });
    }

    // 1️⃣ Evaluate (severity, confidence, state transitions)
    const evaluated = await evaluateIncident(incidentId);

    // 2️⃣ Orchestrate (action proposals + decision trace)
    const orchestrated = await orchestrateIncident(incidentId);

    return res.json({
      incidentId,
      evaluated,
      orchestrated,
    });
  } catch (e: any) {
    return res.status(400).json({
      message: e?.message || 'Failed to re-evaluate incident',
    });
  }
};
