// apps/backend/src/controllers/incidents.controller.ts
import { Response } from 'express';
import { IncidentService } from '../services/incidents/incident.service';
import { CustomRequest } from '../types'; // adjust if your CustomRequest path differs
import { IncidentStatus } from '@prisma/client';
import { evaluateIncident } from '../services/incidents/incident.evaluator';
import { orchestrateIncident } from '../services/incidents/incident.orchestrator';
import { prisma } from '../lib/prisma';

import { IncidentExecutionService } from '../services/incidents/incident.execution.service';

export const executeIncidentAction = async (req: CustomRequest, res: Response) => {
  try {
    const { incidentId, actionId } = req.params;
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

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
    const { incidentId } = req.params;
    const updated = await evaluateIncident(incidentId);
    return res.json(updated);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to evaluate incident' });
  }
};

export const orchestrateIncidentNow = async (req: CustomRequest, res: Response) => {
  try {
    const { incidentId } = req.params;
    const updated = await orchestrateIncident(incidentId);
    return res.json(updated);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to orchestrate incident' });
  }
};

export const listIncidentEvents = async (req: CustomRequest, res: Response) => {
  try {
    const { incidentId } = req.params;
    const limit = req.query.limit ? Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10))) : 50;

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
 * When user clicks CTA and your system creates a real Booking/Task,
 * call this endpoint to link it and flip status -> ACTIONED.
 */
export const confirmIncidentActionCreated = async (req: CustomRequest, res: Response) => {
  try {
    const { incidentId, actionId } = req.params;
    const { entityType, entityId } = req.body || {};
    if (!entityType || !entityId) {
      return res.status(400).json({ message: 'entityType and entityId are required' });
    }

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

export const getIncident = async (req: CustomRequest, res: Response) => {
  try {
    const { incidentId } = req.params;
    const incident = await IncidentService.getIncidentById(incidentId);
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    return res.json(incident);
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
    const { incidentId } = req.params;
    const created = await IncidentService.addSignal(incidentId, req.body);
    return res.status(201).json(created);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to add signal' });
  }
};

export const setIncidentStatus = async (req: CustomRequest, res: Response) => {
  try {
    const { incidentId } = req.params;
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ message: 'status is required' });

    const updated = await IncidentService.setStatus(incidentId, status);
    return res.json(updated);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to update status' });
  }
};

export const acknowledgeIncident = async (req: CustomRequest, res: Response) => {
  try {
    const { incidentId } = req.params;
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const ack = await IncidentService.acknowledge(incidentId, userId, req.body);
    return res.status(201).json(ack);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to acknowledge incident' });
  }
};

export const createIncidentAction = async (req: CustomRequest, res: Response) => {
  try {
    const { incidentId } = req.params;
    const created = await IncidentService.createAction(incidentId, req.body);
    return res.status(201).json(created);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to create incident action' });
  }
};

export const createSuppressionRule = async (req: CustomRequest, res: Response) => {
  try {
    const created = await IncidentService.createSuppressionRule(req.body);
    return res.status(201).json(created);
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || 'Failed to create suppression rule' });
  }
};
