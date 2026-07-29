import crypto from 'crypto';
import {
  HoaDecisionStatus,
  HoaDecisionSourceType,
  HoaDecisionTruthLayer,
} from '@prisma/client';
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

  async createApprovalRecord(propertyId: string, userId: string, payload: any) {
    const association = await prisma.hoaAssociation.findFirst({
      where: { propertyId, isActive: true },
    });
    if (!association) {
      throw new APIError('Add your HOA/association details before tracking an approval', 400, 'NO_ASSOCIATION');
    }

    await assertDecisionTruth(propertyId, payload);
    const hasDecision = payload.decisionStatus != null;

    return prisma.hoaApprovalRecord.create({
      data: {
        propertyId,
        hoaAssociationId: association.id,
        workType: payload.workType,
        description: payload.description,
        reportedStatus: payload.reportedStatus ?? 'NOT_SUBMITTED',
        reportedAt: new Date(),
        reportedByUserId: userId,
        decisionStatus: payload.decisionStatus,
        decisionTruthLayer: payload.decisionTruthLayer,
        decisionSourceType: payload.decisionSourceType,
        decisionSourceReference: payload.decisionSourceReference,
        decisionEvidenceDocumentId: payload.decisionEvidenceDocumentId,
        associationReferenceNumber: payload.associationReferenceNumber,
        decisionObservedAt: hasDecision
          ? payload.decisionObservedAt
            ? new Date(payload.decisionObservedAt)
            : new Date()
          : undefined,
        decisionEffectiveDate: payload.decisionEffectiveDate
          ? new Date(payload.decisionEffectiveDate)
          : undefined,
        decisionRecordedByUserId: hasDecision ? userId : undefined,
        submittedDate: payload.submittedDate ? new Date(payload.submittedDate) : undefined,
        approvalConditions: payload.approvalConditions,
        denialReason: payload.denialReason,
        expirationDate: payload.expirationDate ? new Date(payload.expirationDate) : undefined,
        documentIds: payload.documentIds ?? [],
        notes: payload.notes,
        renovationAdvisorSessionId: payload.renovationAdvisorSessionId,
        sourceActionId: payload.sourceActionId,
        sourceEntityType: payload.sourceEntityType,
        sourceEntityId: payload.sourceEntityId,
        sourceJourneyId: payload.sourceJourneyId,
      },
    });
  }

  async updateApprovalRecord(recordId: string, propertyId: string, userId: string, patch: any) {
    const existing = await prisma.hoaApprovalRecord.findFirst({
      where: { id: recordId, propertyId, isActive: true },
    });
    if (!existing) throw new APIError('Approval record not found', 404, 'NOT_FOUND');

    const clearingDecision = patch.decisionStatus === null;
    const candidateDecision = {
      decisionStatus: patch.decisionStatus !== undefined ? patch.decisionStatus : existing.decisionStatus,
      decisionTruthLayer: clearingDecision
        ? null
        : patch.decisionTruthLayer !== undefined
        ? patch.decisionTruthLayer
        : existing.decisionTruthLayer,
      decisionSourceType: clearingDecision
        ? null
        : patch.decisionSourceType !== undefined
        ? patch.decisionSourceType
        : existing.decisionSourceType,
      decisionSourceReference: clearingDecision
        ? null
        : patch.decisionSourceReference !== undefined
        ? patch.decisionSourceReference
        : existing.decisionSourceReference,
      decisionEvidenceDocumentId: clearingDecision
        ? null
        : patch.decisionEvidenceDocumentId !== undefined
        ? patch.decisionEvidenceDocumentId
        : existing.decisionEvidenceDocumentId,
      associationReferenceNumber: clearingDecision
        ? null
        : patch.associationReferenceNumber !== undefined
        ? patch.associationReferenceNumber
        : existing.associationReferenceNumber,
      approvalConditions: clearingDecision
        ? null
        : patch.approvalConditions !== undefined
        ? patch.approvalConditions
        : existing.approvalConditions,
      decisionObservedAt: clearingDecision
        ? null
        : patch.decisionObservedAt !== undefined
        ? patch.decisionObservedAt
        : existing.decisionObservedAt,
      decisionEffectiveDate: clearingDecision
        ? null
        : patch.decisionEffectiveDate !== undefined
        ? patch.decisionEffectiveDate
        : existing.decisionEffectiveDate,
    };
    await assertDecisionTruth(propertyId, candidateDecision);

    return prisma.hoaApprovalRecord.update({
      where: { id: recordId },
      data: {
        workType: patch.workType,
        description: patch.description,
        reportedStatus: patch.reportedStatus,
        reportedAt: patch.reportedStatus !== undefined ? new Date() : undefined,
        reportedByUserId: patch.reportedStatus !== undefined ? userId : undefined,
        decisionStatus: patch.decisionStatus,
        decisionTruthLayer: clearingDecision ? null : patch.decisionTruthLayer,
        decisionSourceType: clearingDecision ? null : patch.decisionSourceType,
        decisionSourceReference: clearingDecision ? null : patch.decisionSourceReference,
        decisionEvidenceDocumentId: clearingDecision ? null : patch.decisionEvidenceDocumentId,
        associationReferenceNumber: clearingDecision ? null : patch.associationReferenceNumber,
        decisionObservedAt: clearingDecision
          ? null
          : patch.decisionObservedAt
            ? new Date(patch.decisionObservedAt)
            : patch.decisionStatus !== undefined && !existing.decisionObservedAt
              ? new Date()
              : undefined,
        decisionEffectiveDate: clearingDecision
          ? null
          : patch.decisionEffectiveDate
            ? new Date(patch.decisionEffectiveDate)
            : undefined,
        decisionRecordedByUserId: clearingDecision
          ? null
          : patch.decisionStatus !== undefined
            ? userId
            : undefined,
        submittedDate: patch.submittedDate ? new Date(patch.submittedDate) : undefined,
        approvalConditions: clearingDecision ? null : patch.approvalConditions,
        denialReason: clearingDecision ? null : patch.denialReason,
        expirationDate: clearingDecision
          ? null
          : patch.expirationDate
            ? new Date(patch.expirationDate)
            : undefined,
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
    // signal on a given property since none carry an inventoryItemId).
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

const DECISION_STATUSES = new Set<HoaDecisionStatus>([
  HoaDecisionStatus.APPROVED,
  HoaDecisionStatus.APPROVED_WITH_CONDITIONS,
  HoaDecisionStatus.DENIED,
  HoaDecisionStatus.EXPIRED,
]);

export async function assertDecisionTruth(propertyId: string, input: {
  decisionStatus?: HoaDecisionStatus | null;
  decisionTruthLayer?: HoaDecisionTruthLayer | null;
  decisionSourceType?: HoaDecisionSourceType | null;
  decisionSourceReference?: string | null;
  decisionEvidenceDocumentId?: string | null;
  associationReferenceNumber?: string | null;
  approvalConditions?: string | null;
  decisionObservedAt?: string | Date | null;
  decisionEffectiveDate?: string | Date | null;
}) {
  if (input.decisionStatus == null) {
    const hasOrphanedDecisionMetadata = Boolean(
      input.decisionTruthLayer
      || input.decisionSourceType
      || input.decisionSourceReference
      || input.decisionEvidenceDocumentId
      || input.associationReferenceNumber
      || input.approvalConditions
      || input.decisionObservedAt
      || input.decisionEffectiveDate,
    );
    if (hasOrphanedDecisionMetadata) {
      throw new APIError(
        'HOA decision provenance cannot be recorded without a decision status',
        400,
        'HOA_DECISION_STATUS_REQUIRED',
      );
    }
    return;
  }

  if (!DECISION_STATUSES.has(input.decisionStatus)) {
    throw new APIError(
      'Only an association decision can be recorded as decision truth',
      400,
      'INVALID_HOA_DECISION_STATUS',
    );
  }
  if (!input.decisionTruthLayer || !input.decisionSourceType) {
    throw new APIError(
      'Association decision status requires a truth layer and source type',
      400,
      'HOA_DECISION_PROVENANCE_REQUIRED',
    );
  }

  if (
    input.decisionTruthLayer === HoaDecisionTruthLayer.DOCUMENTED
    && !input.decisionEvidenceDocumentId
  ) {
    throw new APIError(
      'A documented HOA decision requires an evidence document',
      400,
      'HOA_DECISION_EVIDENCE_REQUIRED',
    );
  }
  if (
    input.decisionTruthLayer === HoaDecisionTruthLayer.SOURCE_OBSERVED
    && !input.decisionSourceReference
    && !input.decisionEvidenceDocumentId
  ) {
    throw new APIError(
      'A source-observed HOA decision requires a source reference or evidence document',
      400,
      'HOA_DECISION_SOURCE_REQUIRED',
    );
  }
  if (
    input.decisionTruthLayer === HoaDecisionTruthLayer.ASSOCIATION_CONFIRMED
    && !input.associationReferenceNumber
    && !input.decisionEvidenceDocumentId
  ) {
    throw new APIError(
      'An association-confirmed decision requires a reference number or evidence document',
      400,
      'HOA_DECISION_CONFIRMATION_REQUIRED',
    );
  }
  if (
    input.decisionStatus === HoaDecisionStatus.APPROVED_WITH_CONDITIONS
    && !input.approvalConditions?.trim()
  ) {
    throw new APIError(
      'An approval with conditions requires the association conditions',
      400,
      'HOA_APPROVAL_CONDITIONS_REQUIRED',
    );
  }

  if (input.decisionEvidenceDocumentId) {
    const evidence = await prisma.document.findFirst({
      where: {
        id: input.decisionEvidenceDocumentId,
        propertyId,
      },
      select: { id: true },
    });
    if (!evidence) {
      throw new APIError(
        'HOA decision evidence must belong to the same property',
        400,
        'HOA_DECISION_EVIDENCE_PROPERTY_MISMATCH',
      );
    }
  }
}

export const hoaComplianceService = new HoaComplianceService();
