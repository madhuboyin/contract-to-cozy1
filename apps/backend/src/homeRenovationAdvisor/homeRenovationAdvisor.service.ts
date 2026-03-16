// apps/backend/src/homeRenovationAdvisor/homeRenovationAdvisor.service.ts
//
// Main service layer for Home Renovation Risk Advisor.
// Coordinates jurisdiction resolution, evaluation engine, DB persistence, and response mapping.

import { RenovationAdvisorSessionStatus } from '@prisma/client';
import { APIError } from '../middleware/error.middleware';
import { resolveJurisdiction } from './engine/jurisdiction/jurisdiction.resolver';
import { runEvaluation } from './engine/evaluationEngine.service';
import {
  archiveSession,
  createAdvisorSession,
  getPropertyAddressContext,
  getSessionById,
  listSessionsForProperty,
  saveEvaluationOutputs,
  updateAdvisorSessionInputs,
  upsertComplianceChecklist,
  verifyPropertyOwnership,
} from './repository/advisorSession.repository';
import {
  mapSessionToResponse,
  mapSessionToSummary,
} from './mappers/response.mapper';
import {
  buildNextActions,
  buildWarnings,
} from './engine/summary/summaryBuilder.service';
import {
  CreateSessionBody,
  EvaluateSessionBody,
  UpdateComplianceChecklistBody,
  UpdateSessionBody,
} from './validators/homeRenovationAdvisor.validators';
import {
  EvaluationContext,
  HomeRenovationAdvisorSessionResponse,
  ListSessionsQuery,
  SessionListResponse,
} from './types/homeRenovationAdvisor.types';
import { RENOVATION_TYPE_LABELS } from './engine/summary/summaryBuilder.service';
import {
  AnalyticsFeature,
  AnalyticsModule,
  AnalyticsSource,
} from '../services/analytics/taxonomy';
import { analyticsEmitter } from '../services/analytics/emitter';
import { runPostEvaluationIntegrations } from './integrations/advisorIntegration.service';
import { HomeRenovationType, RenovationAdvisorEntryPoint, RenovationAdvisorFlowType } from '@prisma/client';

export class HomeRenovationAdvisorService {
  // ============================================================================
  // CREATE SESSION
  // ============================================================================

  async createSession(
    userId: string,
    input: CreateSessionBody,
  ): Promise<HomeRenovationAdvisorSessionResponse> {
    // Verify property access
    const isOwner = await verifyPropertyOwnership(input.propertyId, userId);
    if (!isOwner) {
      throw new APIError('Property not found or access denied', 404, 'PROPERTY_NOT_FOUND');
    }

    // Load property address
    const property = await getPropertyAddressContext(input.propertyId);
    if (!property) {
      throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
    }

    // Resolve jurisdiction
    const jurisdiction = resolveJurisdiction(property, input.jurisdictionOverride ?? null);

    // Resolve project cost
    const projectCostInput = input.projectCostInput ?? null;
    const projectCostSource = projectCostInput ? 'USER_INPUT' : 'UNKNOWN';
    const projectCostAssumptionNote = projectCostInput
      ? null
      : 'No project cost provided — tax estimates will use median national assumption.';

    // Create session in DRAFT state
    const session = await createAdvisorSession(
      userId,
      input,
      jurisdiction,
      projectCostInput,
      projectCostSource,
      projectCostAssumptionNote,
    );

    // Emit analytics (fire-and-forget)
    analyticsEmitter.featureOpened({
      userId,
      propertyId: input.propertyId,
      moduleKey: AnalyticsModule.RENOVATION_ADVISOR,
      featureKey: AnalyticsFeature.RENOVATION_ADVISOR_SESSION,
      source: AnalyticsSource.HOME_TOOLS,
      metadataJson: {
        renovationType: input.renovationType,
        entryPoint: input.entryPoint,
        flowType: input.flowType,
      },
    });

    return mapSessionToResponse(session, [], []);
  }

  // ============================================================================
  // UPDATE SESSION INPUTS
  // ============================================================================

  async updateSession(
    userId: string,
    sessionId: string,
    updates: UpdateSessionBody,
  ): Promise<HomeRenovationAdvisorSessionResponse> {
    const existing = await this.getSessionAndVerifyAccess(sessionId, userId);

    if (existing.status === RenovationAdvisorSessionStatus.ARCHIVED) {
      throw new APIError('Cannot update an archived session', 400, 'SESSION_ARCHIVED');
    }

    // Resolve jurisdiction if override provided
    let jurisdiction = null;
    if (updates.jurisdictionOverride) {
      const property = await getPropertyAddressContext(existing.propertyId);
      if (property) {
        jurisdiction = resolveJurisdiction(property, updates.jurisdictionOverride);
      }
    }

    const updated = await updateAdvisorSessionInputs(sessionId, updates, jurisdiction);
    return mapSessionToResponse(updated, [], []);
  }

  // ============================================================================
  // EVALUATE SESSION
  // ============================================================================

  async evaluateSession(
    userId: string,
    sessionId: string,
    input: EvaluateSessionBody,
  ): Promise<HomeRenovationAdvisorSessionResponse> {
    const session = await this.getSessionAndVerifyAccess(sessionId, userId);

    if (session.status === RenovationAdvisorSessionStatus.ARCHIVED) {
      throw new APIError('Cannot evaluate an archived session', 400, 'SESSION_ARCHIVED');
    }

    // Check if already completed and not forcing refresh
    if (
      session.status === RenovationAdvisorSessionStatus.COMPLETED &&
      !input.forceRefresh
    ) {
      // Re-build warnings/actions from stored data and return
      return this.buildResponseFromStoredSession(session);
    }

    // Load property for jurisdiction
    const property = await getPropertyAddressContext(session.propertyId);
    if (!property) {
      throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
    }

    // Mark as processing
    await updateSessionStatus(sessionId, RenovationAdvisorSessionStatus.PROCESSING);

    try {
      const ctx: EvaluationContext = {
        sessionId,
        propertyId: session.propertyId,
        createdByUserId: session.createdByUserId,
        renovationType: session.renovationType,
        jurisdiction: {
          state: session.jurisdictionState,
          county: session.jurisdictionCounty,
          city: session.jurisdictionCity,
          postalCode: session.postalCode,
          normalizedJurisdictionKey: session.normalizedJurisdictionKey,
          jurisdictionLevel: session.jurisdictionLevel,
          resolutionConfidence: session.overallConfidence as any,
          source: 'property_profile',
        },
        projectCostInput: session.projectCostInput ? Number(session.projectCostInput) : null,
        projectCostSource: session.projectCostSource,
        projectCostAssumptionNote: session.projectCostAssumptionNote,
        isRetroactiveCheck: session.isRetroactiveCheck,
        flowType: session.flowType,
        evaluationMode: input.evaluationMode ?? 'FULL',
      };

      // Run evaluation
      const output = await runEvaluation(ctx);

      // Persist outputs
      const updatedSession = await saveEvaluationOutputs(sessionId, output);

      // Run post-evaluation integrations (fire-and-forget — never throws)
      void runPostEvaluationIntegrations(updatedSession, output).catch((err) => {
        console.error('[RenovationAdvisor] Post-evaluation integration error:', err);
      });

      // Emit analytics
      analyticsEmitter.toolUsed({
        userId,
        propertyId: session.propertyId,
        moduleKey: AnalyticsModule.RENOVATION_ADVISOR,
        featureKey: AnalyticsFeature.RENOVATION_ADVISOR_SESSION,
        metadataJson: {
          renovationType: session.renovationType,
          overallConfidence: output.overallConfidence,
          overallRiskLevel: output.overallRiskLevel,
          isReEvaluation: session.lastEvaluatedAt !== null,
          dataAvailable: output.permit.dataAvailable && output.taxImpact.dataAvailable,
        },
      });

      return mapSessionToResponse(
        updatedSession,
        output.warnings,
        output.nextActions,
      );
    } catch (err) {
      // Mark as FAILED on error
      await updateSessionStatus(sessionId, RenovationAdvisorSessionStatus.FAILED).catch(() => {});
      throw err;
    }
  }

  // ============================================================================
  // GET SESSION
  // ============================================================================

  async getSession(
    userId: string,
    sessionId: string,
  ): Promise<HomeRenovationAdvisorSessionResponse> {
    const session = await this.getSessionAndVerifyAccess(sessionId, userId);
    return this.buildResponseFromStoredSession(session);
  }

  // ============================================================================
  // LIST SESSIONS FOR PROPERTY
  // ============================================================================

  async listSessionsForProperty(
    userId: string,
    propertyId: string,
    query: ListSessionsQuery,
  ): Promise<SessionListResponse> {
    const isOwner = await verifyPropertyOwnership(propertyId, userId);
    if (!isOwner) {
      throw new APIError('Property not found or access denied', 404, 'PROPERTY_NOT_FOUND');
    }

    const result = await listSessionsForProperty(propertyId, {
      status: query.status,
      renovationType: query.renovationType,
      limit: query.limit ?? 20,
      cursor: query.cursor,
    });

    return {
      sessions: result.sessions.map(mapSessionToSummary),
      total: result.total,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    };
  }

  // ============================================================================
  // ARCHIVE SESSION
  // ============================================================================

  async archiveSession(userId: string, sessionId: string): Promise<void> {
    await this.getSessionAndVerifyAccess(sessionId, userId);
    await archiveSession(sessionId);
  }

  // ============================================================================
  // UPDATE COMPLIANCE CHECKLIST
  // ============================================================================

  async updateComplianceChecklist(
    userId: string,
    sessionId: string,
    data: UpdateComplianceChecklistBody,
  ): Promise<HomeRenovationAdvisorSessionResponse> {
    const session = await this.getSessionAndVerifyAccess(sessionId, userId);
    await upsertComplianceChecklist(sessionId, data);
    return this.buildResponseFromStoredSession(session);
  }

  // ============================================================================
  // METADATA (renovation types, entry points, flow types)
  // ============================================================================

  getMetadata() {
    return {
      renovationTypes: Object.entries(RENOVATION_TYPE_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      entryPoints: Object.values(RenovationAdvisorEntryPoint).map((v) => ({
        value: v,
        label: v.replace(/_/g, ' '),
      })),
      flowTypes: Object.values(RenovationAdvisorFlowType).map((v) => ({
        value: v,
        label: v.replace(/_/g, ' '),
      })),
    };
  }

  // ============================================================================
  // DETECT RETROACTIVE CANDIDATES
  // ============================================================================

  async detectRetroactiveCandidates(
    userId: string,
    propertyId: string,
  ): Promise<import('./engine/retroactive/retroactiveCompliance.service').RetroactiveCandidate[]> {
    const isOwner = await verifyPropertyOwnership(propertyId, userId);
    if (!isOwner) {
      throw new APIError('Property not found or access denied', 404, 'PROPERTY_NOT_FOUND');
    }
    const { detectRetroactiveCandidates } = await import('./engine/retroactive/retroactiveCompliance.service');
    return detectRetroactiveCandidates(propertyId);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async getSessionAndVerifyAccess(sessionId: string, userId: string) {
    const session = await getSessionById(sessionId);
    if (!session) {
      throw new APIError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    const isOwner = await verifyPropertyOwnership(session.propertyId, userId);
    if (!isOwner) {
      throw new APIError('Access denied to this session', 403, 'ACCESS_DENIED');
    }

    return session;
  }

  private async buildResponseFromStoredSession(
    session: Awaited<ReturnType<typeof getSessionById>>,
  ): Promise<HomeRenovationAdvisorSessionResponse> {
    if (!session) {
      throw new APIError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    // Re-derive warnings and next actions from stored evaluation state
    // This is cheaper than re-running evaluation just to show the session
    const ctx: EvaluationContext = {
      sessionId: session.id,
      propertyId: session.propertyId,
      createdByUserId: session.createdByUserId,
      renovationType: session.renovationType,
      jurisdiction: {
        state: session.jurisdictionState,
        county: session.jurisdictionCounty,
        city: session.jurisdictionCity,
        postalCode: session.postalCode,
        normalizedJurisdictionKey: session.normalizedJurisdictionKey,
        jurisdictionLevel: session.jurisdictionLevel,
        resolutionConfidence: session.overallConfidence as any,
        source: 'property_profile',
      },
      projectCostInput: session.projectCostInput ? Number(session.projectCostInput) : null,
      projectCostSource: session.projectCostSource,
      projectCostAssumptionNote: session.projectCostAssumptionNote,
      isRetroactiveCheck: session.isRetroactiveCheck,
      flowType: session.flowType,
      evaluationMode: 'FULL',
    };

    // Build warnings from stored outputs (no DB re-evaluation)
    const checklistAnswers = session.complianceChecklist
      ? {
          permitObtainedStatus: session.complianceChecklist.permitObtainedStatus as string | null,
          licensedContractorUsedStatus: session.complianceChecklist.licensedContractorUsedStatus as string | null,
          reassessmentReceivedStatus: session.complianceChecklist.reassessmentReceivedStatus as string | null,
        }
      : null;

    const warnings = session.permitOutput && session.taxImpactOutput && session.licensingOutput
      ? buildWarnings(
          ctx,
          mapStoredPermitToResult(session.permitOutput),
          mapStoredTaxToResult(session.taxImpactOutput),
          mapStoredLicensingToResult(session.licensingOutput),
          checklistAnswers,
        )
      : [];

    const nextActions = session.permitOutput && session.taxImpactOutput && session.licensingOutput
      ? buildNextActions(
          ctx,
          mapStoredPermitToResult(session.permitOutput),
          mapStoredTaxToResult(session.taxImpactOutput),
          mapStoredLicensingToResult(session.licensingOutput),
          session.overallRiskLevel as any,
          {
            digitalTwinEntityId: session.linkedDigitalTwinScenarioId,
            timelineEventId: session.linkedTimelineItemId,
          },
        )
      : [];

    return mapSessionToResponse(session, warnings, nextActions);
  }
}

// ============================================================================
// HELPER: Update session status directly (not in repository to keep it lean)
// ============================================================================

import { prisma } from '../lib/prisma';

async function updateSessionStatus(
  sessionId: string,
  status: RenovationAdvisorSessionStatus,
): Promise<void> {
  await prisma.homeRenovationAdvisorSession.update({
    where: { id: sessionId },
    data: { status },
  });
}

// ============================================================================
// HELPER: Map stored DB output to result interface for warnings/next actions
// ============================================================================

import { PermitEvaluationResult, TaxImpactEvaluationResult, LicensingEvaluationResult } from './types/homeRenovationAdvisor.types';

function mapStoredPermitToResult(p: NonNullable<NonNullable<Awaited<ReturnType<typeof getSessionById>>>['permitOutput']>): PermitEvaluationResult {
  return {
    requirementStatus: p.requirementStatus,
    confidenceLevel: p.confidenceLevel,
    confidenceReason: p.confidenceReason ?? '',
    permitCostMin: p.permitCostMin ? Number(p.permitCostMin) : null,
    permitCostMax: p.permitCostMax ? Number(p.permitCostMax) : null,
    permitTimelineMinDays: p.permitTimelineMinDays,
    permitTimelineMaxDays: p.permitTimelineMaxDays,
    applicationPortalUrl: p.applicationPortalUrl,
    applicationPortalLabel: p.applicationPortalLabel,
    permitSummary: p.permitSummary ?? '',
    permitTypes: [],
    inspectionStages: [],
    dataAvailable: p.dataAvailable,
    sourceType: p.sourceType,
    sourceLabel: p.sourceLabel ?? '',
    sourceReferenceUrl: p.sourceReferenceUrl,
    sourceRefreshedAt: p.sourceRefreshedAt,
    notes: p.notes,
    assumptions: [],
  };
}

function mapStoredTaxToResult(t: NonNullable<NonNullable<Awaited<ReturnType<typeof getSessionById>>>['taxImpactOutput']>): TaxImpactEvaluationResult {
  return {
    confidenceLevel: t.confidenceLevel,
    confidenceReason: t.confidenceReason ?? '',
    assessedValueIncreaseMin: t.assessedValueIncreaseMin ? Number(t.assessedValueIncreaseMin) : null,
    assessedValueIncreaseMax: t.assessedValueIncreaseMax ? Number(t.assessedValueIncreaseMax) : null,
    annualTaxIncreaseMin: t.annualTaxIncreaseMin ? Number(t.annualTaxIncreaseMin) : null,
    annualTaxIncreaseMax: t.annualTaxIncreaseMax ? Number(t.annualTaxIncreaseMax) : null,
    monthlyTaxIncreaseMin: t.monthlyTaxIncreaseMin ? Number(t.monthlyTaxIncreaseMin) : null,
    monthlyTaxIncreaseMax: t.monthlyTaxIncreaseMax ? Number(t.monthlyTaxIncreaseMax) : null,
    reassessmentTriggerType: t.reassessmentTriggerType,
    reassessmentTimelineSummary: t.reassessmentTimelineSummary ?? '',
    reassessmentRuleSummary: t.reassessmentRuleSummary ?? '',
    plainLanguageSummary: t.plainLanguageSummary ?? '',
    millageRateSnapshot: t.millageRateSnapshot ? Number(t.millageRateSnapshot) : null,
    taxModelRegion: t.taxModelRegion,
    valueUpliftMethod: t.valueUpliftMethod ?? '',
    dataAvailable: t.dataAvailable,
    sourceType: t.sourceType,
    sourceLabel: t.sourceLabel ?? '',
    sourceReferenceUrl: t.sourceReferenceUrl,
    sourceRefreshedAt: t.sourceRefreshedAt,
    notes: t.notes,
    assumptions: [],
  };
}

function mapStoredLicensingToResult(l: NonNullable<NonNullable<Awaited<ReturnType<typeof getSessionById>>>['licensingOutput']>): LicensingEvaluationResult {
  return {
    requirementStatus: l.requirementStatus,
    confidenceLevel: l.confidenceLevel,
    confidenceReason: l.confidenceReason ?? '',
    consequenceSummary: l.consequenceSummary ?? '',
    verificationToolUrl: l.verificationToolUrl,
    verificationToolLabel: l.verificationToolLabel,
    plainLanguageSummary: l.plainLanguageSummary ?? '',
    licenseCategories: [],
    dataAvailable: l.dataAvailable,
    sourceType: l.sourceType,
    sourceLabel: l.sourceLabel ?? '',
    sourceReferenceUrl: l.sourceReferenceUrl,
    sourceRefreshedAt: l.sourceRefreshedAt,
    notes: l.notes,
    assumptions: [],
  };
}
