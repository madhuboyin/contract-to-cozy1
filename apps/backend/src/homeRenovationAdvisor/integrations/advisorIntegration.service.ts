// apps/backend/src/homeRenovationAdvisor/integrations/advisorIntegration.service.ts
//
// Post-evaluation integration orchestrator for the Home Renovation Risk Advisor.
// Called fire-and-forget after a session evaluation completes successfully.
//
// Integrations wired here:
//   1. Home Timeline  — HomeEventsAutoGen.ensureEvent (type=IMPROVEMENT, idempotent)
//   2. Digital Twin   — HomeTwinScenario (scenarioType=RENOVATION, idempotent via existing check)
//   3. Compliance Task — PropertyMaintenanceTask when licensing/permit status requires action
//   4. Linked IDs      — persistLinkedEntityIds writes back to session for UI traceability
//
// TCO and Break-Even are compute-only surfaces with no injection path; integration
// is surfaced as structured output in the session response (linkedEntities) only.
//
// All integrations are individually try/caught so a failure in one never blocks the others.

import { prisma } from '../../lib/prisma';
import { HomeEventsAutoGen } from '../../services/homeEvents/homeEvents.autogen';
import { HomeDigitalTwinScenarioService } from '../../services/homeDigitalTwinScenario.service';
import { PropertyMaintenanceTaskService } from '../../services/PropertyMaintenanceTask.service';
import type { EvaluationOutput } from '../types/homeRenovationAdvisor.types';
import type { SessionWithIncludes } from '../repository/advisorSession.repository';
import { logger } from '../../lib/logger';

const scenarioService = new HomeDigitalTwinScenarioService();

// ============================================================================
// PUBLIC ENTRY POINT
// ============================================================================

/**
 * Run all post-evaluation integrations and persist linked entity IDs.
 * Fire-and-forget safe — all errors are swallowed after logging.
 */
export async function runPostEvaluationIntegrations(
  session: SessionWithIncludes,
  output: EvaluationOutput,
): Promise<void> {
  const linkedIds: {
    linkedTimelineItemId?: string | null;
    linkedDigitalTwinScenarioId?: string | null;
  } = {};

  // 1. Home Timeline
  try {
    const event = await integrateHomeTimeline(session, output);
    if (event?.id) {
      // Note: linkedTimelineItemId is a FK to HomeCapitalTimelineItem, not HomeEvent.
      // We store the homeEvent ID as a reference string only (no FK on session for HomeEvent).
      // The session's linkedTimelineItemId FK points to HomeCapitalTimelineItem if linked.
      // For now we log the event ID to console for traceability.
      logger.info(
        `[RenovationAdvisor] Home timeline event logged: eventId=${event.id} sessionId=${session.id}`,
      );
    }
  } catch (err) {
    logger.error({ err }, '[RenovationAdvisor] Home timeline integration failed');
  }

  // 2. Digital Twin Scenario
  try {
    const scenarioId = await integrateDigitalTwin(session, output);
    if (scenarioId) {
      linkedIds.linkedDigitalTwinScenarioId = scenarioId;
    }
  } catch (err) {
    logger.error({ err }, '[RenovationAdvisor] Digital twin integration failed');
  }

  // 3. Compliance Task (only for high-risk permit/licensing situations)
  try {
    await integrateComplianceTask(session, output);
  } catch (err) {
    logger.error({ err }, '[RenovationAdvisor] Compliance task integration failed');
  }

  // 4. Persist linked IDs back to the session (if any were populated)
  if (Object.values(linkedIds).some((v) => v != null)) {
    try {
      await persistLinkedEntityIds(session.id, linkedIds);
    } catch (err) {
      logger.error({ err }, '[RenovationAdvisor] Failed to persist linked entity IDs');
    }
  }
}

// ============================================================================
// 1. HOME TIMELINE — log a HomeEvent for the evaluation
// ============================================================================

async function integrateHomeTimeline(
  session: SessionWithIncludes,
  output: EvaluationOutput,
): Promise<{ id: string } | null> {
  const renovationLabel = formatRenovationType(session.renovationType as string);
  const riskLabel = formatRiskLevel(output.overallRiskLevel as string);
  const confidenceLabel = formatConfidenceLevel(output.overallConfidence as string);

  // Idempotency key: one event per session evaluation — re-runs overwrite via dedupe.
  // Using session ID so re-evaluations don't create duplicate timeline events.
  const idempotencyKey = `renovation-advisor:${session.id}:evaluated`;

  return HomeEventsAutoGen.ensureEvent({
    propertyId: session.propertyId,
    createdById: session.createdByUserId ?? null,
    type: 'IMPROVEMENT' as any,
    subtype: 'HOME_RENOVATION_RISK_CHECK',
    occurredAt: new Date(),
    title: `Renovation check: ${renovationLabel}`,
    summary: `Risk level: ${riskLabel} | Confidence: ${confidenceLabel}. ${output.overallSummary ?? ''}`.trim(),
    amount: session.projectCostInput ? String(session.projectCostInput) : null,
    currency: 'USD',
    meta: {
      sessionId: session.id,
      renovationType: session.renovationType,
      overallRiskLevel: output.overallRiskLevel,
      overallConfidence: output.overallConfidence,
      permitStatus: output.permit.requirementStatus,
      licensingStatus: output.licensing.requirementStatus,
      isRetroactive: session.isRetroactiveCheck,
    },
    idempotencyKey,
  });
}

// ============================================================================
// 2. DIGITAL TWIN — create / find a RENOVATION scenario
// ============================================================================

async function integrateDigitalTwin(
  session: SessionWithIncludes,
  output: EvaluationOutput,
): Promise<string | null> {
  if (!session.createdByUserId) return null;

  // Look up the property's digital twin (may not exist)
  const twin = await prisma.homeDigitalTwin.findUnique({
    where: { propertyId: session.propertyId },
    select: { id: true },
  });

  if (!twin) {
    // Twin not initialized yet — skip silently
    return null;
  }

  // Check if a scenario already exists for this session (idempotency)
  const existingScenario = await prisma.homeTwinScenario.findFirst({
    where: {
      digitalTwinId: twin.id,
      propertyId: session.propertyId,
      inputPayload: {
        path: ['advisorSessionId'],
        equals: session.id,
      },
    },
    select: { id: true },
  });

  if (existingScenario) {
    return existingScenario.id;
  }

  const renovationLabel = formatRenovationType(session.renovationType as string);
  const costNum = session.projectCostInput ? Number(session.projectCostInput) : null;

  const scenario = await scenarioService.createScenario(
    twin.id,
    session.propertyId,
    session.createdByUserId,
    {
      name: `${renovationLabel} Renovation`,
      scenarioType: 'RENOVATION' as any,
      description: output.overallSummary ?? `Renovation risk check for ${renovationLabel}.`,
      inputPayload: {
        advisorSessionId: session.id,
        renovationType: session.renovationType,
        projectCost: costNum,
        permitStatus: output.permit.requirementStatus,
        taxImpactMonthlyMin: output.taxImpact.monthlyTaxIncreaseMin,
        taxImpactMonthlyMax: output.taxImpact.monthlyTaxIncreaseMax,
        licensingStatus: output.licensing.requirementStatus,
        overallRiskLevel: output.overallRiskLevel,
        overallConfidence: output.overallConfidence,
        jurisdiction: session.normalizedJurisdictionKey,
        assumptions: {
          projectCost: costNum,
        },
      },
    },
  );

  return scenario.id;
}

// ============================================================================
// 3. COMPLIANCE TASK — create a maintenance task for high-risk compliance gaps
// ============================================================================

async function integrateComplianceTask(
  session: SessionWithIncludes,
  output: EvaluationOutput,
): Promise<void> {
  if (!session.createdByUserId) return;

  const riskLevel = output.overallRiskLevel as string;
  const permitStatus = output.permit.requirementStatus as string;
  const licensingStatus = output.licensing.requirementStatus as string;

  // Only create a compliance task when there's a concrete action required
  const needsPermitTask =
    permitStatus === 'PERMIT_REQUIRED' || permitStatus === 'PERMIT_LIKELY_REQUIRED';
  const needsLicensingTask =
    licensingStatus === 'LICENSE_REQUIRED' || licensingStatus === 'LICENSE_LIKELY_REQUIRED';
  const isHighRisk = riskLevel === 'HIGH' || riskLevel === 'CRITICAL';

  if (!needsPermitTask && !needsLicensingTask && !isHighRisk) return;

  const renovationLabel = formatRenovationType(session.renovationType as string);

  // Build a single consolidated compliance task
  const taskLines: string[] = [];
  if (needsPermitTask) taskLines.push('Obtain required building permit before starting work.');
  if (needsLicensingTask) taskLines.push('Verify contractor licensing requirements for your jurisdiction.');
  if (isHighRisk && !needsPermitTask && !needsLicensingTask) {
    taskLines.push('Review renovation compliance requirements due to high risk assessment.');
  }

  const title = `Renovation compliance: ${renovationLabel}`;
  const description = taskLines.join(' ') + (output.overallSummary ? ` Summary: ${output.overallSummary}` : '');

  // Priority map based on risk level
  const priority = riskLevel === 'CRITICAL' ? 'URGENT' : isHighRisk ? 'HIGH' : 'MEDIUM';
  const taskRiskLevel = riskLevel === 'CRITICAL' ? 'CRITICAL' : isHighRisk ? 'HIGH' : 'ELEVATED';

  // Due date: 30 days for HIGH/CRITICAL, 60 for MEDIUM
  const daysOut = priority === 'URGENT' || priority === 'HIGH' ? 30 : 60;
  const nextDueDate = new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000).toISOString();

  // Idempotent via actionKey that encodes the session
  const actionKey = `renovation-advisor:${session.id}:compliance-task`;

  await PropertyMaintenanceTaskService.createFromActionCenter(
    session.createdByUserId,
    session.propertyId,
    {
      title,
      description,
      assetType: 'RENOVATION',
      priority: priority as any,
      riskLevel: taskRiskLevel as any,
      nextDueDate,
      actionKey,
    },
  );
}

// ============================================================================
// 4. PERSIST LINKED ENTITY IDs BACK TO SESSION
// ============================================================================

async function persistLinkedEntityIds(
  sessionId: string,
  ids: {
    linkedTimelineItemId?: string | null;
    linkedDigitalTwinScenarioId?: string | null;
  },
): Promise<void> {
  const data: Record<string, unknown> = {};

  if (ids.linkedTimelineItemId !== undefined) {
    data.linkedTimelineItemId = ids.linkedTimelineItemId;
  }
  if (ids.linkedDigitalTwinScenarioId !== undefined) {
    data.linkedDigitalTwinScenarioId = ids.linkedDigitalTwinScenarioId;
  }

  if (Object.keys(data).length === 0) return;

  await prisma.homeRenovationAdvisorSession.update({
    where: { id: sessionId },
    data: data as any,
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function formatRenovationType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRiskLevel(level: string): string {
  const labels: Record<string, string> = {
    CRITICAL: 'Critical',
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low',
    UNKNOWN: 'Unknown',
  };
  return labels[level] ?? level;
}

function formatConfidenceLevel(level: string): string {
  const labels: Record<string, string> = {
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low',
    UNAVAILABLE: 'Unavailable',
  };
  return labels[level] ?? level;
}
