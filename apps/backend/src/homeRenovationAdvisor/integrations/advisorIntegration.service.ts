// apps/backend/src/homeRenovationAdvisor/integrations/advisorIntegration.service.ts
//
// Post-evaluation integration orchestrator for the Home Renovation Risk Advisor.
// Called fire-and-forget after a session evaluation completes successfully.
//
// Integrations wired here:
//   1. Compliance Task — PropertyMaintenanceTask when licensing/permit status requires action
//
// An advisor evaluation is research, not a selected or completed renovation.
// It therefore must not create a Home Timeline improvement or Digital Twin
// scenario. Those durable records require an explicit downstream selection or
// verified completion.
//
// All integrations are individually try/caught so a failure in one never blocks the others.

import { PropertyMaintenanceTaskService } from '../../services/PropertyMaintenanceTask.service';
import type { EvaluationOutput } from '../types/homeRenovationAdvisor.types';
import type { SessionWithIncludes } from '../repository/advisorSession.repository';
import { logger } from '../../lib/logger';
import { getComplianceTaskRequirements } from './complianceTaskPolicy';

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
  // Advisor research may create a follow-up action, but never durable property
  // history or a selected planning scenario.
  try {
    await integrateComplianceTask(session, output);
  } catch (err) {
    logger.error({ err }, '[RenovationAdvisor] Compliance task integration failed');
  }
}

// ============================================================================
// COMPLIANCE TASK — create a maintenance task for compliance follow-up
// ============================================================================

async function integrateComplianceTask(
  session: SessionWithIncludes,
  output: EvaluationOutput,
): Promise<void> {
  if (!session.createdByUserId) return;

  const riskLevel = output.overallRiskLevel;
  const { needsPermitTask, needsLicensingTask } = getComplianceTaskRequirements(
    output.permit.requirementStatus,
    output.licensing.requirementStatus,
  );

  // Only create a compliance task when there's a concrete action required
  const isHighRisk = riskLevel === 'HIGH' || riskLevel === 'CRITICAL';

  if (!needsPermitTask && !needsLicensingTask && !isHighRisk) return;

  const renovationLabel = formatRenovationType(session.renovationType as string);

  // Build a single consolidated compliance task
  const taskLines: string[] = [];
  if (output.permit.requirementStatus === 'REQUIRED') {
    taskLines.push('Verify the issuing authority and obtain the required building permit before starting work.');
  } else if (output.permit.requirementStatus === 'LIKELY_REQUIRED') {
    taskLines.push('Verify with the issuing authority whether a building permit is required before starting work.');
  }
  if (needsLicensingTask) {
    taskLines.push('Verify contractor licensing requirements for your jurisdiction.');
  }
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
// HELPERS
// ============================================================================

function formatRenovationType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
