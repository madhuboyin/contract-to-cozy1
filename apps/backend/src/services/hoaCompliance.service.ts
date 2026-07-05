import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { IncidentService } from './incidents/incident.service';

class HoaComplianceService {
  // ── Association ──────────────────────────────────────────────────────────

  async getAssociation(propertyId: string) {
    return prisma.hoaAssociation.findFirst({
      where: { propertyId, isActive: true },
    });
  }

  async upsertAssociation(propertyId: string, payload: any) {
    const data = {
      name: payload.name,
      managementCompany: payload.managementCompany,
      contactName: payload.contactName,
      contactEmail: payload.contactEmail,
      contactPhone: payload.contactPhone,
      duesAmountCents: payload.duesAmountCents,
      duesFrequency: payload.duesFrequency,
      nextDueDate: payload.nextDueDate ? new Date(payload.nextDueDate) : undefined,
      documentIds: payload.documentIds,
      notes: payload.notes,
    };

    return prisma.hoaAssociation.upsert({
      where: { propertyId },
      create: { propertyId, ...data },
      update: data,
    });
  }

  // ── Approval Records ──────────────────────────────────────────────────────

  async listApprovalRecords(propertyId: string) {
    return prisma.hoaApprovalRecord.findMany({
      where: { propertyId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createApprovalRecord(propertyId: string, payload: any) {
    const association = await prisma.hoaAssociation.findFirst({
      where: { propertyId, isActive: true },
    });
    if (!association) {
      throw new APIError('Add your HOA/association details before tracking an approval', 400, 'NO_ASSOCIATION');
    }

    return prisma.hoaApprovalRecord.create({
      data: {
        propertyId,
        hoaAssociationId: association.id,
        workType: payload.workType,
        description: payload.description,
        status: payload.status ?? 'NOT_SUBMITTED',
        submittedDate: payload.submittedDate ? new Date(payload.submittedDate) : undefined,
        documentIds: payload.documentIds ?? [],
        notes: payload.notes,
        renovationAdvisorSessionId: payload.renovationAdvisorSessionId,
      },
    });
  }

  async updateApprovalRecord(recordId: string, propertyId: string, patch: any) {
    const existing = await prisma.hoaApprovalRecord.findFirst({
      where: { id: recordId, propertyId, isActive: true },
    });
    if (!existing) throw new APIError('Approval record not found', 404, 'NOT_FOUND');

    return prisma.hoaApprovalRecord.update({
      where: { id: recordId },
      data: {
        workType: patch.workType,
        description: patch.description,
        status: patch.status,
        submittedDate: patch.submittedDate ? new Date(patch.submittedDate) : undefined,
        decisionDate: patch.decisionDate ? new Date(patch.decisionDate) : undefined,
        approvalConditions: patch.approvalConditions,
        denialReason: patch.denialReason,
        expirationDate: patch.expirationDate ? new Date(patch.expirationDate) : undefined,
        documentIds: patch.documentIds,
        notes: patch.notes,
      },
    });
  }

  async deleteApprovalRecord(recordId: string, propertyId: string) {
    const existing = await prisma.hoaApprovalRecord.findFirst({
      where: { id: recordId, propertyId, isActive: true },
    });
    if (!existing) throw new APIError('Approval record not found', 404, 'NOT_FOUND');

    await prisma.hoaApprovalRecord.update({
      where: { id: recordId },
      data: { isActive: false },
    });
  }

  // ── Violations — bridges into the Guidance Engine via Incident ────────────

  async listViolations(propertyId: string) {
    const incidents = await prisma.incident.findMany({
      where: { propertyId, typeKey: 'HOA_VIOLATION_DETECTED' },
      orderBy: { openedAt: 'desc' },
    });

    // Violations only carry next-step guidance via the journey the incident
    // bridged into (see bridgeIncidentToGuidance) — look those up so the
    // frontend can deep-link straight into the journey instead of the
    // generic guidance-overview landing page, where a low-priority journey
    // can be crowded out of the "in progress" preview list.
    //
    // Repeat HOA violations on the same property all reuse ONE merged journey
    // (guidanceJourneyService.findReusableJourney matches on
    // mergedSignalGroupKey, which is identical for every hoa_violation_detected
    // signal on a given property since none carry an inventoryItemId/homeAssetId).
    // So this can't be a simple incident->journey.primarySignalId join — that
    // only ever matches whichever incident happened to create the journey
    // first. Instead, join through each signal's own duplicateGroupKey (the
    // same value the journey stores as mergedSignalGroupKey).
    const incidentIds = incidents.map((incident) => incident.id);
    const signals = incidentIds.length
      ? await prisma.guidanceSignal.findMany({
          where: {
            sourceEntityType: 'INCIDENT',
            sourceEntityId: { in: incidentIds },
          },
          select: { sourceEntityId: true, duplicateGroupKey: true },
        })
      : [];

    const groupKeyByIncidentId = new Map(
      signals
        .filter((signal) => signal.sourceEntityId && signal.duplicateGroupKey)
        .map((signal) => [signal.sourceEntityId as string, signal.duplicateGroupKey as string])
    );

    const groupKeys = Array.from(new Set(groupKeyByIncidentId.values()));
    const journeys = groupKeys.length
      ? await prisma.guidanceJourney.findMany({
          where: {
            propertyId,
            mergedSignalGroupKey: { in: groupKeys },
          },
          select: { id: true, mergedSignalGroupKey: true },
        })
      : [];

    const journeyIdByGroupKey = new Map(
      journeys
        .filter((journey) => journey.mergedSignalGroupKey)
        .map((journey) => [journey.mergedSignalGroupKey as string, journey.id])
    );

    const journeyIdByIncidentId = new Map(
      Array.from(groupKeyByIncidentId.entries())
        .map(([incidentId, groupKey]) => [incidentId, journeyIdByGroupKey.get(groupKey) ?? null] as const)
        .filter((entry): entry is [string, string] => Boolean(entry[1]))
    );

    return incidents.map((incident) => {
      const details = (incident.details as Record<string, unknown> | null) ?? {};
      return {
        id: incident.id,
        title: incident.title,
        summary: incident.summary,
        status: incident.status,
        severity: incident.severity,
        description: (details.description as string | null) ?? null,
        cureDeadline: (details.cureDeadline as string | null) ?? null,
        fineAmountCents: (details.fineAmountCents as number | null) ?? null,
        openedAt: incident.openedAt,
        resolvedAt: incident.resolvedAt,
        journeyId: journeyIdByIncidentId.get(incident.id) ?? null,
      };
    });
  }

  async reportViolation(propertyId: string, userId: string, payload: any) {
    const incident = await IncidentService.upsertIncident({
      propertyId,
      userId,
      sourceType: 'MANUAL',
      typeKey: 'HOA_VIOLATION_DETECTED',
      category: payload.workType ?? 'OTHER',
      title: `HOA violation: ${payload.summary}`,
      summary: payload.summary,
      details: {
        description: payload.description ?? null,
        cureDeadline: payload.cureDeadline ?? null,
        fineAmountCents: payload.fineAmountCents ?? null,
      },
      severity: payload.severity ?? 'WARNING',
      // One-off manual reports — unique per report, not meant to dedupe against each other.
      fingerprint: `hoa-violation:${propertyId}:${crypto.randomUUID()}`,
    });

    return incident;
  }
}

export const hoaComplianceService = new HoaComplianceService();
