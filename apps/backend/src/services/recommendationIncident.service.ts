import { prisma } from '../lib/prisma';
import {
  canTransitionRecommendationIncident,
  defaultRecommendationIncidentSeverity,
  incidentRequiresImmediatePause,
  type RecommendationIncidentResolution,
  type RecommendationIncidentSeverity,
  type RecommendationIncidentStatus,
  type RecommendationIncidentType,
} from '../productFramework/recommendationIncident.contract';
import { recordPersonalizationAuditEvent } from './personalizationAudit.service';

export class RecommendationIncidentError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'INVALID_TRANSITION' | 'MITIGATION_REQUIRED' | 'INVALID_CONTEXT',
    message: string,
  ) {
    super(message);
    this.name = 'RecommendationIncidentError';
  }
}

export interface IntakeRecommendationIncidentInput {
  definitionCode?: string;
  definitionId?: string;
  recommendationId?: string | null;
  sourceFeedbackId?: string | null;
  type: RecommendationIncidentType;
  severity?: RecommendationIncidentSeverity;
  summary: string;
  details?: string | null;
  reportedByUserId?: string | null;
}

async function pauseDefinitionForIncident(input: {
  definitionId: string;
  definitionCode: string;
  actorUserId: string | null;
  incidentId: string;
}) {
  const pausedAt = new Date();
  await prisma.recommendationDefinition.update({
    where: { id: input.definitionId },
    data: {
      pausedAt,
      pausedBy: input.actorUserId ?? 'SYSTEM',
      pauseReason: `Automatically paused for recommendation incident ${input.incidentId}`,
    },
  });
  await recordPersonalizationAuditEvent({
    actorUserId: input.actorUserId,
    action: 'RECOMMENDATION_INCIDENT_DEFINITION_AUTO_PAUSED',
    entityType: 'RECOMMENDATION_INCIDENT',
    entityId: input.incidentId,
    reason: 'Critical or safety-tier recommendation incident requires mitigation before resolution.',
    metadata: { definitionCode: input.definitionCode },
  });
}

export async function intakeRecommendationIncident(input: IntakeRecommendationIncidentInput) {
  if (input.sourceFeedbackId) {
    const existing = await prisma.recommendationIncident.findUnique({
      where: { sourceFeedbackId: input.sourceFeedbackId },
      include: { definition: { select: { code: true } } },
    });
    if (existing) return { incident: existing, created: false, definitionPaused: false };
  }

  const definition = input.definitionCode
    ? await prisma.recommendationDefinition.findUnique({
        where: { code: input.definitionCode },
        select: { id: true, code: true, safetyTier: true, governancePolicyVersion: true, pausedAt: true },
      })
    : input.definitionId
      ? await prisma.recommendationDefinition.findUnique({
          where: { id: input.definitionId },
          select: { id: true, code: true, safetyTier: true, governancePolicyVersion: true, pausedAt: true },
        })
      : null;
  if (!definition) throw new RecommendationIncidentError('NOT_FOUND', 'Recommendation definition not found.');

  if (input.recommendationId) {
    const recommendation = await prisma.personalizedRecommendation.findFirst({
      where: { id: input.recommendationId, definitionId: definition.id },
      select: { id: true },
    });
    if (!recommendation) {
      throw new RecommendationIncidentError('INVALID_CONTEXT', 'Recommendation does not belong to the selected definition.');
    }
  }

  const severity = input.severity ?? defaultRecommendationIncidentSeverity(input.type, definition.safetyTier);
  const incident = await prisma.recommendationIncident.create({
    data: {
      definitionId: definition.id,
      recommendationId: input.recommendationId ?? null,
      sourceFeedbackId: input.sourceFeedbackId ?? null,
      type: input.type,
      severity,
      status: 'OPEN',
      safetyTier: definition.safetyTier,
      policyVersion: definition.governancePolicyVersion,
      summary: input.summary,
      details: input.details ?? null,
      reportedByUserId: input.reportedByUserId ?? null,
    },
    include: { definition: { select: { code: true } } },
  });

  await recordPersonalizationAuditEvent({
    actorUserId: input.reportedByUserId ?? null,
    action: 'RECOMMENDATION_INCIDENT_OPENED',
    entityType: 'RECOMMENDATION_INCIDENT',
    entityId: incident.id,
    reason: input.summary,
    metadata: {
      definitionCode: definition.code,
      type: input.type,
      severity,
      safetyTier: definition.safetyTier,
      policyVersion: definition.governancePolicyVersion,
      source: input.sourceFeedbackId ? 'RECOMMENDATION_FEEDBACK' : 'ADMIN_INTAKE',
    },
  });

  const definitionPaused = incidentRequiresImmediatePause({
    type: input.type,
    severity,
    safetyTier: definition.safetyTier,
  });
  if (definitionPaused) {
    await pauseDefinitionForIncident({
      definitionId: definition.id,
      definitionCode: definition.code,
      actorUserId: input.reportedByUserId ?? null,
      incidentId: incident.id,
    });
  }

  return { incident, created: true, definitionPaused };
}

export async function listRecommendationIncidents(input: {
  status?: RecommendationIncidentStatus;
  severity?: RecommendationIncidentSeverity;
  definitionCode?: string;
  limit?: number;
} = {}) {
  return prisma.recommendationIncident.findMany({
    where: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.severity ? { severity: input.severity } : {}),
      ...(input.definitionCode ? { definition: { code: input.definitionCode } } : {}),
    },
    include: {
      definition: { select: { code: true, status: true, pausedAt: true, pauseReason: true } },
      recommendation: { select: { id: true, propertyId: true, confidence: true, status: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: Math.min(input.limit ?? 100, 200),
  });
}

export async function transitionRecommendationIncident(input: {
  incidentId: string;
  actorUserId: string;
  status: RecommendationIncidentStatus;
  severity?: RecommendationIncidentSeverity;
  assignedToUserId?: string | null;
  targetResolutionAt?: Date | null;
  note: string;
  resolutionCode?: RecommendationIncidentResolution | null;
  resolutionSummary?: string | null;
  rootCause?: string | null;
  correctiveAction?: string | null;
}) {
  const current = await prisma.recommendationIncident.findUnique({
    where: { id: input.incidentId },
    include: { definition: { select: { code: true, pausedAt: true, status: true } } },
  });
  if (!current) throw new RecommendationIncidentError('NOT_FOUND', 'Recommendation incident not found.');
  if (!canTransitionRecommendationIncident(current.status, input.status)) {
    throw new RecommendationIncidentError(
      'INVALID_TRANSITION',
      `Cannot transition recommendation incident from ${current.status} to ${input.status}.`,
    );
  }
  if (input.status === 'RESOLVED') {
    if (!input.resolutionCode || !input.resolutionSummary || !input.rootCause || !input.correctiveAction) {
      throw new RecommendationIncidentError(
        'INVALID_CONTEXT',
        'Resolution code, summary, root cause, and corrective action are required.',
      );
    }
    if (
      (current.severity === 'CRITICAL' || current.safetyTier === 'SAFETY_EMERGENCY') &&
      !current.definition.pausedAt && current.definition.status === 'ACTIVE'
    ) {
      throw new RecommendationIncidentError(
        'MITIGATION_REQUIRED',
        'Critical and safety-tier incidents require the definition to be paused before resolution.',
      );
    }
  }

  const now = new Date();
  const updated = await prisma.recommendationIncident.update({
    where: { id: input.incidentId },
    data: {
      status: input.status,
      ...(input.severity ? { severity: input.severity } : {}),
      ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
      ...(input.targetResolutionAt !== undefined ? { targetResolutionAt: input.targetResolutionAt } : {}),
      ...(input.status === 'TRIAGED' ? { triagedAt: now } : {}),
      ...(input.status === 'MITIGATED' ? { mitigatedAt: now } : {}),
      ...(input.status === 'RESOLVED' ? {
        resolvedAt: now,
        resolutionCode: input.resolutionCode,
        resolutionSummary: input.resolutionSummary,
        rootCause: input.rootCause,
        correctiveAction: input.correctiveAction,
      } : {}),
      ...(input.status === 'CLOSED' ? { closedAt: now } : {}),
    },
    include: { definition: { select: { code: true, status: true, pausedAt: true, pauseReason: true } } },
  });

  await recordPersonalizationAuditEvent({
    actorUserId: input.actorUserId,
    action: `RECOMMENDATION_INCIDENT_${input.status}`,
    entityType: 'RECOMMENDATION_INCIDENT',
    entityId: input.incidentId,
    reason: input.note,
    metadata: {
      definitionCode: current.definition.code,
      fromStatus: current.status,
      toStatus: input.status,
      severity: input.severity ?? current.severity,
      resolutionCode: input.resolutionCode ?? null,
    },
  });
  return updated;
}
