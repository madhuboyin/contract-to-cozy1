// apps/backend/src/services/incidents/incident.evaluator.ts
import { prisma } from '../../lib/prisma';
import { IncidentSeverity, IncidentStatus, IncidentEventType } from '@prisma/client';
import { computeConfidence, computeSeverity, IncidentScoringContext } from './incident.scoring';
import { logIncidentEvent } from './incident.events';
import { IncidentNotificationService } from './integrations/incidentNotification.service';


const SEVERITY_MODEL_VERSION = 'severity-v1';
const AUTO_ACTIVATE_MIN_CONFIDENCE = 45; // tune later
const AUTO_ACTIVE_MIN_SEVERITY: IncidentSeverity = IncidentSeverity.WARNING; // INFO stays mostly in timeline

export async function evaluateIncident(incidentId: string) {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: {
      signals: { orderBy: { observedAt: 'desc' }, take: 10 },
      actions: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });

  if (!incident) return null;

  // If suppressed, we still compute score snapshots, but keep status suppressed
  const latestSignal = incident.signals[0];
  const now = new Date();
  const ageMinutes = latestSignal
    ? Math.max(0, Math.round((now.getTime() - new Date(latestSignal.observedAt).getTime()) / 60000))
    : null;

  // Derive a scoring context from incident.details + latest signal payload (rule-based for now)
  const details: any = incident.details ?? {};
  const signalPayload: any = latestSignal?.payload ?? {};

  // Normalize for scoring
  const ctx: IncidentScoringContext = {
    typeKey: incident.typeKey,
    exposureUsd: details.exposureUsd ?? signalPayload.exposureUsd ?? null,
    safetyCritical: details.safetyCritical ?? signalPayload.safetyCritical ?? null,
    timeWindowHours: details.timeWindowHours ?? signalPayload.timeWindowHours ?? null,
    probabilityPct: details.probabilityPct ?? signalPayload.probabilityPct ?? null,
    isCovered: details.isCovered ?? signalPayload.isCovered ?? null,
    coverageClarity: details.coverageClarity ?? signalPayload.coverageClarity ?? 'UNKNOWN',
    mitigationLevel: details.mitigationLevel ?? signalPayload.mitigationLevel ?? 'NONE',
  };

  // Action-driven mitigation (if any actions exist)
  const hasAction = incident.actions.length > 0;
  if (hasAction && ctx.mitigationLevel === 'NONE') {
    ctx.mitigationLevel = 'SCHEDULED'; // conservative default
  }

  const { severity, breakdown } = computeSeverity(ctx);

  const confidence = computeConfidence({
    probabilityPct: ctx.probabilityPct,
    hasMultipleSignals: incident.signals.length >= 2,
    hasExternalAuthoritativeSignal: latestSignal?.signalType === 'WEATHER_FORECAST' || latestSignal?.signalType === 'COVERAGE_CHECK',
    signalAgeMinutes: ageMinutes,
  });

  // store snapshot
  await prisma.incidentScoreSnapshot.create({
    data: {
      incidentId: incident.id,
      severity,
      severityScore: breakdown.total,
      confidence,
      breakdown,
      modelVersion: SEVERITY_MODEL_VERSION,
    },
  });

  await prisma.incident.update({
    where: { id: incident.id },
    data: {
      severity,
      severityScore: breakdown.total,
      confidence,
      scoreBreakdown: breakdown,
      status: incident.status === IncidentStatus.DETECTED ? IncidentStatus.EVALUATED : incident.status,
    },
  });

  await logIncidentEvent({
    incidentId: incident.id,
    propertyId: incident.propertyId,
    userId: incident.userId,
    type: IncidentEventType.SEVERITY_COMPUTED,
    message: `Severity computed: ${severity} (${breakdown.total})`,
    payload: { breakdown, confidence, modelVersion: SEVERITY_MODEL_VERSION },
  });

  // Auto activation rules
  const shouldActivate =
    !incident.isSuppressed &&
    confidence >= AUTO_ACTIVATE_MIN_CONFIDENCE &&
    (severity === IncidentSeverity.CRITICAL || severity === AUTO_ACTIVE_MIN_SEVERITY);

  if (shouldActivate && incident.status !== IncidentStatus.ACTIVE && incident.status !== IncidentStatus.ACTIONED) {
    const updated = await prisma.incident.update({
      where: { id: incident.id },
      data: {
        status: IncidentStatus.ACTIVE,
        activatedAt: incident.activatedAt ?? new Date(),
      },
    });
    await IncidentNotificationService.notifyIncidentActivated({
        incident: {
          id: incident.id,
          propertyId: incident.propertyId,
          userId: incident.userId ?? null,
          typeKey: incident.typeKey,
          title: incident.title,
          summary: incident.summary ?? null,
          severity,
        },
        userId: incident.userId ?? '', // best effort; if null, you can route to property owner later
      });
      
    await logIncidentEvent({
      incidentId: incident.id,
      propertyId: incident.propertyId,
      userId: incident.userId,
      type: IncidentEventType.STATUS_CHANGED,
      message: `Incident activated`,
      payload: { from: incident.status, to: IncidentStatus.ACTIVE },
    });

    return updated;
  }

  return await prisma.incident.findUnique({ where: { id: incident.id } });
}
