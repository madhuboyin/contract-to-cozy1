import {
  adaptHomeActionSource,
  evaluateHomeActionPresentationEligibility,
  normalizeHomeActionConfidenceScore,
  type HomeAction,
} from '../productFramework';
import { prisma } from '../lib/prisma';
import { RecommendationGovernanceSchema } from '../productFramework/recommendationGovernance.contract';
import { buildRecommendationResponseContract, resolveRecommendationResponseStatus } from '../productFramework/recommendationResponse.contract';
import { getGuidanceJourneyDisplayTitle } from './guidanceEngine/guidanceTemplateRegistry';
import { getHomeAssetDisplayLabel } from '../productFramework/homeAssetDisplay';
import { findPersonalizationDefinition } from '../modules/personalization/catalog/personalizationDefinitions';
import type { EnvironmentInsight } from './environment/environmentInsights.service';
import { getFreshnessNote } from './hiddenAssets/ruleEngine';
import { isProgramActionableNow } from './hiddenAssets/sourceFreshness';
import {
  resolveOwnershipCostCategoryAction,
} from './ownershipCosts/ownershipCostDecision.service';
import { buildRefinanceFreshness } from '../refinanceRadar/refinanceFreshness';
import { guidanceFinancialContextService } from './guidanceEngine/guidanceFinancialContext.service';
import { analyticsEmitter } from './analytics';
import { ProductAnalyticsEventType } from '@prisma/client';
import { calculateHealthScore } from '../utils/propertyScore.util';
import { createHash } from 'node:crypto';

const DEFAULT_FEEDBACK: HomeAction['feedbackControls'] = [
  'COMPLETE', 'DEFER', 'SNOOZE', 'DISMISS', 'ALREADY_DONE', 'NOT_RELEVANT', 'CORRECT_FACT',
];

// For sources with no authoritative domain completion adapter behind
// COMPLETE/ALREADY_DONE (see SOURCE_KINDS_WITHOUT_COMPLETION_ADAPTER in
// homeActions.service.ts), offer ACKNOWLEDGE instead so the control is
// honest about what it does: hide the recommendation, not certify work.
const RECOMMENDATION_FEEDBACK: HomeAction['feedbackControls'] = [
  'ACKNOWLEDGE', 'DEFER', 'SNOOZE', 'DISMISS', 'NOT_RELEVANT', 'CORRECT_FACT',
];

export type HomeActionSourceDb = Pick<typeof prisma,
  'guidanceJourney' | 'incident' | 'recallMatch' | 'coverageReview' | 'projectRecord' |
  'seasonalChecklist' | 'personalizedRecommendation' | 'orchestrationActionEvent' | 'orchestrationActionSnooze'> &
  Partial<Pick<typeof prisma, 'domainEvent' | 'propertyFinancingProfile' | 'propertyRefinanceRadarState' | 'refinanceDecision' | 'homeDigitalTwin' | 'homeTwinComponent' | 'homeCapitalTimelineAnalysis' | 'propertyTaxAppealCase' | 'propertyHiddenAssetMatch' | 'savingsBenefitAction' | 'ownershipCostChange' | 'ownershipCostSnapshot' | 'ownershipCostDecision' | 'inspectionFinding' | 'propertySaleCase' | 'saleReadinessItem' | 'warranty' | 'insurancePolicy' | 'property' | 'document' | 'booking' | 'replaceRepairAnalysis'>>;

function lowConsequenceGovernance(policyVersion = 'phase2-v1'): HomeAction['governance'] {
  return {
    safetyTier: 'LOW_CONSEQUENCE',
    professionalBoundary: null,
    jurisdictionCheck: { status: 'NOT_REQUIRED', jurisdiction: null, checkedAt: null, source: null },
    conservativeFallback: null,
    emergencyEscalation: null,
    commercialDisclosure: {
      involvesCommercialAction: false,
      relationshipType: 'NONE',
      compensationMayOccur: false,
      rankingInfluenced: false,
      summary: 'No provider or purchase ranking is presented by this action.',
      selectionCriteria: [],
      nonCommercialAlternatives: [],
    },
    reviewedBy: [],
    policyVersion,
  };
}

function materialFinancialGovernance(policyVersion: string): HomeAction['governance'] {
  return {
    ...lowConsequenceGovernance(policyVersion),
    safetyTier: 'MATERIAL_FINANCIAL',
    professionalBoundary:
      'Estimates and comparisons are educational planning inputs, not financial, tax, valuation, or investment advice.',
  };
}

function guidanceGovernance(step: any, policyVersion: string): HomeAction['governance'] {
  const parsed = RecommendationGovernanceSchema.safeParse(step?.governanceJson);
  return parsed.success ? parsed.data : lowConsequenceGovernance(policyVersion);
}

function projectGovernance(
  project: {
    safetyCheckResult: string | null;
    fundingMode: string | null;
    contractAmountCents: number | null;
    paidToDateCents: number | null;
    approvedChangeOrderDeltaCents: number | null;
    permitApplicability: string | null;
    hoaApplicability: string | null;
    credentialCheck: unknown;
    complexity: string | null;
  },
  issue: { category: string; severity: string } | undefined,
): HomeAction['governance'] {
  const hasSafetyIssue = issue?.category === 'SAFETY' || issue?.severity === 'BLOCKING';
  const safetyCheckFailed = project.safetyCheckResult === 'FAILED';
  if (hasSafetyIssue || safetyCheckFailed) {
    return {
      ...lowConsequenceGovernance('project-tracker-v1'),
      safetyTier: 'SAFETY_EMERGENCY',
      professionalBoundary: 'This project has an open safety issue or a failed safety check. Confirm the concern is resolved with a qualified professional before continuing work.',
      conservativeFallback: 'If there is immediate danger, active damage, fire, gas, or electrical risk, leave the area and contact emergency services or the appropriate utility.',
      emergencyEscalation: 'Pause work and confirm the safety concern is resolved with a qualified professional before continuing the project.',
    };
  }
  if (project.fundingMode === 'COVERED' || project.fundingMode === 'MIXED') {
    return {
      ...materialFinancialGovernance('project-tracker-v2'),
      safetyTier: 'REGULATED_COVERAGE',
      professionalBoundary: 'Coverage-dependent work must be confirmed against the policy, carrier requirements, and applicable licensing or authorization rules before commitment.',
      jurisdictionCheck: {
        status: 'UNKNOWN',
        jurisdiction: null,
        checkedAt: null,
        source: 'Project funding mode indicates insurance or coverage involvement.',
      },
    };
  }
  const isMaterialFinancial =
    (project.contractAmountCents ?? 0) > 0 ||
    (project.paidToDateCents ?? 0) > 0 ||
    (project.approvedChangeOrderDeltaCents ?? 0) !== 0 ||
    project.permitApplicability === 'REQUIRED' ||
    project.hoaApplicability === 'REQUIRED' ||
    project.credentialCheck != null ||
    project.complexity === 'MAJOR';
  if (isMaterialFinancial) {
    return materialFinancialGovernance('project-tracker-v1');
  }
  return lowConsequenceGovernance('project-tracker-v1');
}

function guidanceDecisionContract(governance: HomeAction['governance']) {
  const material = governance.safetyTier === 'MATERIAL_FINANCIAL' || governance.safetyTier === 'REGULATED_COVERAGE';
  if (!material) return { assumptions: [], options: [], tradeoffs: [] };
  return {
    assumptions: [{
      key: 'home_record_currency',
      label: 'Home record is current',
      value: 'The recommendation uses the property facts and evidence currently stored in ContractToCozy.',
      source: 'PROPERTY_FACT' as const,
      editable: true,
    }],
    options: [
      {
        id: 'continue_evidence_review',
        label: 'Continue evidence review',
        summary: 'Use the guided journey to verify facts, documents, pricing, and scope before committing.',
        recommended: true,
      },
      {
        id: 'verify_with_professional',
        label: 'Verify independently',
        summary: 'Pause the journey and confirm the condition, contract, or local requirement with a qualified professional.',
        recommended: false,
      },
    ],
    tradeoffs: [
      {
        optionId: 'continue_evidence_review',
        dimension: 'EFFORT' as const,
        summary: 'Keeps the decision context together but still depends on the completeness of the home record.',
      },
      {
        optionId: 'verify_with_professional',
        dimension: 'COST' as const,
        summary: 'May add time or professional cost while reducing uncertainty for a material decision.',
      },
    ],
  };
}

function personalizationExplanation(reasonCodes: unknown, fallback: string): string {
  if (!Array.isArray(reasonCodes)) return fallback;
  for (const reason of reasonCodes) {
    if (!reason || typeof reason !== 'object') continue;
    const params = (reason as { params?: unknown }).params;
    if (!params || typeof params !== 'object') continue;
    const message = (params as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 1200);
  }
  return fallback;
}

function contextVersionFromEvaluation(resultJson: unknown): string | null {
  if (!resultJson || typeof resultJson !== 'object' || Array.isArray(resultJson)) return null;
  const value = (resultJson as { contextVersion?: unknown }).contextVersion;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function personalizationDecisionContract(governance: HomeAction['governance']) {
  if (governance.safetyTier !== 'MATERIAL_FINANCIAL' && governance.safetyTier !== 'REGULATED_COVERAGE') {
    return { assumptions: [], options: [], tradeoffs: [] };
  }
  return {
    assumptions: [{
      key: 'property_context_currency',
      label: 'Property context is current',
      value: 'This recommendation uses the facts and service history currently recorded for this home.',
      source: 'PROPERTY_FACT' as const,
      editable: true,
    }],
    options: [
      {
        id: 'review_recorded_context',
        label: 'Review the recorded context',
        summary: 'Confirm the underlying home facts and service history before deciding what to do.',
        recommended: true,
      },
      {
        id: 'verify_with_professional',
        label: 'Verify independently',
        summary: 'Ask a qualified professional to assess condition, scope, and timing before committing.',
        recommended: false,
      },
    ],
    tradeoffs: [
      {
        optionId: 'review_recorded_context',
        dimension: 'EFFORT' as const,
        summary: 'Keeps the decision grounded in the Home Record but depends on its current completeness.',
      },
      {
        optionId: 'verify_with_professional',
        dimension: 'COST' as const,
        summary: 'May add time or professional cost while reducing uncertainty for a material decision.',
      },
    ],
  };
}

function resolveGuidanceHref(args: {
  propertyId: string;
  journeyId: string;
  itemId: string | null;
  routePath: string | null;
}) {
  const fallback = `/dashboard/properties/${args.propertyId}/tools/guidance-overview?journeyId=${encodeURIComponent(args.journeyId)}`;
  if (!args.routePath) return fallback;
  if (args.routePath.includes(':itemId') && !args.itemId) return fallback;
  const [pathname, query = ''] = args.routePath.split('?');
  const resolvedPath = pathname
    .replace(/:propertyId/g, encodeURIComponent(args.propertyId))
    .replace(/:itemId/g, encodeURIComponent(args.itemId ?? ''));
  const params = new URLSearchParams(query);
  for (const [key, value] of [...params.entries()]) {
    params.set(key, value
      .replace(/:propertyId/g, args.propertyId)
      .replace(/:itemId/g, args.itemId ?? ''));
  }
  params.set('journeyId', args.journeyId);
  return `${resolvedPath}${params.size > 0 ? `?${params.toString()}` : ''}`;
}

function confidenceLabel(score: number | null): HomeAction['confidence']['label'] {
  if (score == null || score < 0.55) return 'LOW';
  if (score < 0.8) return 'MEDIUM';
  return 'HIGH';
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstUsefulText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (normalized) return normalized;
  }
  return null;
}

function sentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function formatHomeActionCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function financialJourneyGrounding(journey: any, subjectLabel: string | null) {
  const context = objectValue(journey.contextSnapshotJson);
  const signalPayload = objectValue(journey.primarySignal?.payloadJson);
  const signalMetadata = objectValue(journey.primarySignal?.metadataJson);
  const sourceEntityType = String(journey.primarySignal?.sourceEntityType ?? '').toUpperCase();
  const sourceFallback = sourceEntityType === 'RESERVE_FUND_LINE_ITEM'
    ? 'home reserve shortfall'
    : sourceEntityType === 'NEGOTIATION_SHIELD_CASE'
      ? 'negotiation or claim decision'
      : null;
  const issueType = firstUsefulText(journey.issueType);
  const subject = subjectLabel ?? firstUsefulText(
    context.subject,
    context.subjectLabel,
    context.assetName,
    context.userNote,
    signalMetadata.incidentTitle,
    signalMetadata.subject,
    signalPayload.subject,
    signalPayload.title,
    issueType && !/financial exposure|financial issue/i.test(issueType) ? issueType : null,
    sourceFallback,
  );
  const financial = guidanceFinancialContextService.evaluate({ journey, signal: journey.primarySignal });
  const trigger = firstUsefulText(
    context.trigger,
    context.reason,
    signalPayload.trigger,
    signalPayload.reason,
    signalMetadata.trigger,
  );
  const hasConsequence = financial.upcomingCost > 0 || financial.costOfDelay > 0 || Boolean(trigger);
  if (!subject || !hasConsequence) return null;

  const amount = financial.upcomingCost > 0 ? formatHomeActionCurrency(financial.upcomingCost) : null;
  const coverage = financial.coverageImpact === 'COVERED'
    ? 'Recorded as covered'
    : financial.coverageImpact === 'PARTIAL'
      ? 'Partially confirmed'
      : financial.coverageImpact === 'NOT_COVERED'
        ? 'Recorded as not covered'
        : 'Not yet confirmed';
  const observedAt = journey.primarySignal?.lastObservedAt ?? journey.updatedAt;
  const observedLabel = observedAt instanceof Date
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(observedAt)
    : null;
  const whyNowParts = [
    trigger ? sentence(trigger) : null,
    amount ? `${amount} is currently estimated to be at stake.` : null,
    `Coverage is ${coverage.toLowerCase()}.`,
  ].filter((value): value is string => Boolean(value));
  const headline = amount
    ? `Potential ${amount} exposure for ${subject}`
    : `Potential financial exposure for ${subject}`;

  return {
    subject,
    amount,
    trigger,
    coverage,
    observedAt,
    observedLabel,
    headline,
    whyNow: whyNowParts.join(' ').slice(0, 500),
  };
}

const WEATHER_HAZARD_COPY: Record<string, {
  label: string;
  implication: string;
  preparation: string;
}> = {
  freeze_risk: {
    label: 'Freezing conditions',
    implication: 'Freezing temperatures can affect exposed plumbing, heating systems, and outdoor fixtures.',
    preparation: 'Protect exposed pipes and confirm the heating system is ready.',
  },
  flood_risk: {
    label: 'Flooding or heavy rain',
    implication: 'Heavy rain can affect drainage, basements, roofing, and low-lying areas around this home.',
    preparation: 'Check drainage paths and avoid entering flooded areas.',
  },
  hurricane_risk: {
    label: 'Hurricane conditions',
    implication: 'High winds and heavy rain can affect roofing, trees, outdoor property, and power service.',
    preparation: 'Secure outdoor items and follow current local emergency guidance.',
  },
  wind_risk: {
    label: 'Strong wind or storm conditions',
    implication: 'Strong winds and storms can affect trees, roofing, outdoor items, and power service.',
    preparation: 'Secure loose outdoor items and avoid exterior inspection during the storm.',
  },
  heat_risk: {
    label: 'Extreme heat',
    implication: 'Sustained heat can increase cooling demand and indoor comfort risk at this home.',
    preparation: 'Confirm the cooling system is ready and keep the outdoor condenser area clear.',
  },
  wildfire_risk: {
    label: 'Wildfire or smoke conditions',
    implication: 'Smoke and nearby wildfire conditions can affect indoor air, outdoor activity, and evacuation readiness.',
    preparation: 'Keep windows closed when advised and follow current local emergency guidance.',
  },
};

function dateFromUnknown(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function weatherWindowLabel(start: Date, end: Date): string {
  const format = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  const startLabel = format.format(start);
  const endLabel = format.format(end);
  return startLabel === endLabel ? endLabel : `${startLabel}–${endLabel}`;
}

function weatherJourneyGrounding(journey: any, propertyLabel: string, evaluatedAt: Date) {
  const signal = journey.primarySignal;
  const expiresAt = dateFromUnknown(signal?.expiresAt);
  if (!signal || !expiresAt || expiresAt.getTime() <= evaluatedAt.getTime()) return null;

  const family = String(signal.signalIntentFamily ?? '').toLowerCase();
  const copy = WEATHER_HAZARD_COPY[family];
  if (!copy) return null;

  const payload = objectValue(signal.payloadJson);
  const metadata = objectValue(signal.metadataJson);
  const context = objectValue(journey.contextSnapshotJson);
  const observedAt = dateFromUnknown(signal.lastObservedAt) ?? dateFromUnknown(journey.updatedAt) ?? evaluatedAt;
  const effectiveFrom = dateFromUnknown(payload.effectiveFrom) ?? observedAt;
  const sourceTitle = firstUsefulText(metadata.incidentTitle, payload.title);
  const headline = sourceTitle && !/^review weather risk details$/i.test(sourceTitle)
    ? sourceTitle
    : `${copy.label} expected through ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(expiresAt)}`;
  const implication = firstUsefulText(payload.homeImplication, payload.summary, context.homeImplication) ?? copy.implication;
  const preparation = firstUsefulText(payload.instruction, payload.preparation, context.preparation) ?? copy.preparation;
  const affectedSystems = Array.isArray(payload.affectedSystems)
    ? payload.affectedSystems.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    : [];
  const senderName = firstUsefulText(payload.senderName);
  const source = senderName ? `National Weather Service — ${senderName}` : 'Current weather signal';
  const severity = String(signal.severity ?? 'UNKNOWN').toLowerCase().replace(/_/g, ' ');
  const observedLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(observedAt);

  return {
    family,
    hazard: copy.label,
    headline,
    implication,
    preparation,
    affectedSystems,
    source,
    severity,
    observedAt,
    observedLabel,
    effectiveFrom,
    expiresAt,
    windowLabel: weatherWindowLabel(effectiveFrom, expiresAt),
    propertyLabel: propertyLabel.trim() || 'This property',
  };
}

function environmentWeatherFamily(category: string): string | null {
  if (category === 'heat') return 'heat_risk';
  if (category === 'storm') return 'wind_risk';
  if (category === 'rain' || category === 'flood') return 'flood_risk';
  if (category === 'freeze' || category === 'snow') return 'freeze_risk';
  if (category === 'wildfire' || category === 'wildfire_smoke') return 'wildfire_risk';
  return null;
}

function environmentBoundary(value: string, endOfDay = false): Date | null {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function environmentInsightExpiry(insight: EnvironmentInsight): Date | null {
  const boundary = environmentBoundary(insight.effectiveTo, true);
  if (!boundary) return null;
  if (insight.category === 'air_quality' && !/^\d{4}-\d{2}-\d{2}$/.test(insight.effectiveTo)) {
    return new Date(boundary.getTime() + 3 * 60 * 60 * 1000);
  }
  if (insight.category === 'drought') {
    return new Date(boundary.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return boundary;
}

export function adaptEnvironmentInsightsToHomeActions(
  propertyId: string,
  insights: readonly EnvironmentInsight[],
  incidentActions: readonly HomeAction[],
  evaluatedAt = new Date(),
  propertyLabel = 'This property',
): HomeAction[] {
  const activeIncidentIds = new Set(
    incidentActions
      .filter((action) => action.source.kind === 'INCIDENT')
      .map((action) => action.source.entityId),
  );
  const activePreparationLineages = new Set(
    incidentActions
      .filter((action) => action.source.kind === 'INCIDENT')
      .map((action) => action.lineageId),
  );
  const evaluatedAtIso = evaluatedAt.toISOString();
  const today = evaluatedAtIso.slice(0, 10);

  return insights
    .filter((insight) => insight.severity === 'action')
    .filter((insight) => {
      const expiresAt = environmentInsightExpiry(insight);
      return !expiresAt || expiresAt.getTime() >= evaluatedAt.getTime();
    })
    .filter((insight) => !insight.relatedIncident || !activeIncidentIds.has(insight.relatedIncident.id))
    .filter((insight) => !activePreparationLineages.has(
      `incident:weather-preparation:${propertyId}:${insight.id}`,
    ))
    .slice(0, 2)
    .map((insight) => {
      const windowStart = environmentBoundary(insight.effectiveFrom);
      const windowEnd = environmentInsightExpiry(insight);
      const primary = insight.actions.find((action) => action.kind === 'primary') ?? insight.actions[0];
      const reportHref = `/dashboard/properties/${propertyId}/environment-report`;
      const primaryHref = primary?.href ?? reportHref;
      const primaryKind = primaryHref.includes('/environment-report/preparation')
        ? 'START' as const
        : 'REVIEW' as const;

      return adaptHomeActionSource('MAINTENANCE', {
        id: `environment:${insight.id}`,
        propertyId,
        lineageId: `environment:${propertyId}:${insight.category}:${insight.effectiveFrom}`,
        sourceEntityId: insight.id,
        sourceVersion: 'environment-v1',
        state: 'OPEN',
        priority: insight.category !== 'drought' && insight.effectiveFrom.slice(0, 10) <= today ? 'NOW' : 'SOON',
        signal: insight.title,
        whyItMatters: `${insight.summary} ${insight.homeImplication}`.trim(),
        recommendedAction: insight.recommendedActions[0] ?? primary?.label ?? 'Review the environment outlook',
        expectedOutcome: `Prepare the home for ${insight.timeframe.toLowerCase()} and reduce avoidable exposure.`,
        presentation: {
          variant: 'ENVIRONMENT_PREPARATION',
          eyebrow: 'Local environment',
          headline: insight.title.slice(0, 180),
          summary: `${insight.summary} ${insight.homeImplication}`.trim().slice(0, 320),
          whyNow: `${insight.timeframe}: ${insight.homeImplication}`.slice(0, 500),
          keyFacts: [
            { label: 'Hazard', value: humanizeFactKey(insight.category) },
            { label: 'Location', value: propertyLabel.slice(0, 240) },
            { label: 'Forecast window', value: insight.timeframe.slice(0, 240) },
            { label: 'Severity', value: 'Action recommended' },
            { label: 'Source freshness', value: `Current as of ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(evaluatedAt)}` },
            { label: 'Preparation', value: (insight.recommendedActions[0] ?? primary?.label ?? 'Review the environment outlook').slice(0, 240) },
          ],
          factGroups: insight.recommendedActions.length ? [{
            label: 'Preparation checklist',
            facts: insight.recommendedActions.slice(0, 8).map((step, index) => ({
              key: `step-${index + 1}`,
              label: `Step ${index + 1}`,
              value: step.slice(0, 240),
              kind: 'DERIVED' as const,
              source: insight.source.slice(0, 160),
              observedAt: evaluatedAtIso,
            })),
          }] : [],
          subject: { kind: 'CHECKLIST', id: insight.id, label: `${insight.title} at ${propertyLabel}`.slice(0, 180) },
          detailLabel: 'Preparation steps',
          group: null,
        },
        timing: {
          dueAt: windowStart?.toISOString() ?? null,
          windowStart: windowStart?.toISOString() ?? null,
          windowEnd: windowEnd?.toISOString() ?? null,
          rationale: `This forecast-based recommendation is active for ${insight.timeframe}.`,
        },
        evidence: [{
          id: insight.id,
          type: 'EXTERNAL_SOURCE',
          label: insight.title,
          source: insight.source,
          observedAt: evaluatedAtIso,
          freshness: 'CURRENT',
          confidence: 0.9,
        }],
        assumptions: [],
        options: [],
        tradeoffs: [],
        confidence: { score: 0.9, label: 'HIGH', missing: [] },
        governance: lowConsequenceGovernance('environment-v1'),
        primaryCta: {
          kind: primaryKind,
          label: primaryKind === 'START' ? 'Open preparation checklist' : primary?.label ?? 'Review environment report',
          href: primaryHref,
        },
        secondaryCtas: primaryHref === reportHref ? [] : [{
          kind: 'REVIEW',
          label: 'View environment report',
          href: reportHref,
        }],
        feedbackControls: RECOMMENDATION_FEEDBACK,
        relatedJourneyId: null,
        createdAt: evaluatedAtIso,
        lastEvaluatedAt: evaluatedAtIso,
      });
    });
}

export async function loadGuidanceActions(
  propertyId: string,
  db: HomeActionSourceDb,
  activeWeatherIncidentIds: Set<string> = new Set(),
  activeEnvironmentWeatherFamilies: Set<string> = new Set(),
  evaluatedAt = new Date(),
  propertyLabel = 'This property',
): Promise<HomeAction[]> {
  // Home Operations Slice 4: once a Project has taken over a journey
  // (project.guidanceJourneyId), the journey stops being its own competing
  // Home action — the Project's action (see loadProjectActions) is the one
  // active major-moment presentation, and the shared work item transitions
  // to IN_PROJECT (projectTracker.service.ts's createProject). Cancelling
  // the Project un-suppresses the journey automatically since CANCELLED is
  // outside this active-status set.
  const activeProjectsWithJourney = await db.projectRecord.findMany({
    where: {
      propertyId,
      guidanceJourneyId: { not: null },
      status: { in: ['PLANNING', 'IN_PROGRESS', 'PAUSED', 'DISPUTED'] },
    },
    select: { guidanceJourneyId: true },
  });
  const journeyIdsWithActiveProject = new Set(
    activeProjectsWithJourney.map((project) => project.guidanceJourneyId).filter((id): id is string => Boolean(id)),
  );

  const journeys = await db.guidanceJourney.findMany({
    where: { propertyId, status: { in: ['NOT_STARTED', 'ACTIVE'] } },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    include: {
      primarySignal: {
        select: {
          id: true,
          severity: true,
          confidenceScore: true,
          signalIntentFamily: true,
          firstObservedAt: true,
          lastObservedAt: true,
          expiresAt: true,
          sourceEntityType: true,
          sourceEntityId: true,
          payloadJson: true,
          metadataJson: true,
        },
      },
      inventoryItem: {
        select: {
          name: true,
          assetType: true,
          category: true,
          coverageEvidenceStatus: true,
        },
      },
      steps: {
        where: { status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] } },
        orderBy: { stepOrder: 'asc' },
        take: 1,
      },
    },
  });

  return journeys
    .filter((journey) => !journeyIdsWithActiveProject.has(journey.id))
    .filter((journey) => {
      const incidentDerivedWeather = journey.issueDomain === 'WEATHER' &&
        String(journey.primarySignal?.sourceEntityType ?? '').toUpperCase() === 'INCIDENT';
      if (!incidentDerivedWeather) return true;
      const sourceIncidentId = journey.primarySignal?.sourceEntityId;
      return sourceIncidentId
        ? !activeWeatherIncidentIds.has(sourceIncidentId)
        : activeWeatherIncidentIds.size === 0;
    })
    .map((journey) => {
    const step = journey.steps[0];
    const confidence = normalizeHomeActionConfidenceScore(journey.primarySignal?.confidenceScore);
    const isCoverageJourney = journey.journeyTypeKey === 'coverage_gap_resolution';
    const coverageUncertain = isCoverageJourney &&
      journey.inventoryItem?.coverageEvidenceStatus === 'NOT_SURE';
    const missingContextKeys = coverageUncertain
      ? [...new Set([...journey.missingContextKeys, 'Current coverage evidence'])]
      : journey.missingContextKeys;
    const governance = guidanceGovernance(step, journey.templateVersion ?? 'phase4-v1');
    const responseStatus = resolveRecommendationResponseStatus({
      confidence,
      missingFacts: missingContextKeys,
    });
    const recommendationResponse = buildRecommendationResponseContract({
      status: responseStatus,
      safetyTier: governance.safetyTier,
      missingFacts: missingContextKeys,
      reasonCode: responseStatus === 'AVAILABLE' ? 'GUIDANCE_AVAILABLE' : `GUIDANCE_${responseStatus}`,
    });
    const decisionContract = guidanceDecisionContract(governance);
    const journeyTitle = getGuidanceJourneyDisplayTitle(journey.journeyTypeKey, journey.issueType);
    const subjectLabel = journey.inventoryItem
      ? getHomeAssetDisplayLabel(journey.inventoryItem)
      : null;
    const isFinancialExposure = journey.journeyTypeKey === 'financial_exposure_resolution';
    const isWeatherJourney = journey.issueDomain === 'WEATHER' || journey.journeyTypeKey === 'weather_risk_resolution';
    const financialGrounding = isFinancialExposure
      ? financialJourneyGrounding(journey, subjectLabel)
      : null;
    const weatherGrounding = isWeatherJourney
      ? weatherJourneyGrounding(journey, propertyLabel, evaluatedAt)
      : null;
    // A material financial recommendation without an identifiable subject
    // and a concrete trigger or amount is not eligible to compete on Home.
    if (isFinancialExposure && !financialGrounding) return null;
    // Weather guidance is only useful while it carries a live, bounded
    // source signal. A current environment action for the same hazard owns
    // Home presentation so the journey cannot duplicate fresher guidance.
    if (isWeatherJourney && (!weatherGrounding || activeEnvironmentWeatherFamilies.has(weatherGrounding.family))) {
      return null;
    }
    const title = subjectLabel
      ? `${journeyTitle} for ${subjectLabel}`
      : journeyTitle;
    const firstMissingContext = missingContextKeys[0]?.trim();
    const correctionLabel = isCoverageJourney
      ? coverageUncertain ? 'Update coverage information' : 'Add coverage information'
      : firstMissingContext
        ? `Add ${firstMissingContext.toLowerCase()}`
        : 'Add home information';
    const actionId = `guidance:${journey.id}`;
    const correctionHref = isCoverageJourney && journey.inventoryItemId
      ? `/dashboard/properties/${propertyId}/inventory/items/${encodeURIComponent(journey.inventoryItemId)}/coverage?sourceActionId=${encodeURIComponent(actionId)}&returnTo=${encodeURIComponent('/dashboard')}`
      : `/dashboard/properties/${propertyId}/onboarding`;
    const withheldRecommendedAction = subjectLabel
      ? isCoverageJourney
        ? coverageUncertain
          ? `Confirm coverage for ${subjectLabel}`
          : `Add coverage information for ${subjectLabel}`
        : `Review home information for ${subjectLabel} before continuing`
      : journeyTitle;
    const href = resolveGuidanceHref({
      propertyId,
      journeyId: journey.id,
      itemId: journey.inventoryItemId,
      routePath: step?.routePath ?? null,
    });
    const financialLaunchParams = financialGrounding ? new URLSearchParams({
      launchSurface: 'unified_home',
      sourceActionId: actionId,
      sourceEntityType: journey.primarySignal?.sourceEntityType ?? 'GUIDANCE_JOURNEY',
      sourceEntityId: journey.primarySignal?.sourceEntityId ?? journey.id,
      recommendationReason: 'FINANCIAL_EXPOSURE',
      recommendationVersion: journey.templateVersion ?? 'phase2-v1',
    }) : null;
    const destinationHref = financialLaunchParams
      ? `${href}${href.includes('?') ? '&' : '?'}${financialLaunchParams.toString()}`
      : href;
    const financialWhy = financialGrounding?.whyNow;
    const financialHeadline = financialGrounding?.headline;
    return adaptHomeActionSource('GUIDANCE', {
      id: actionId,
      propertyId,
      lineageId: journey.primarySignalId ?? `guidance:${journey.id}`,
      sourceEntityId: isCoverageJourney && journey.inventoryItemId
        ? journey.inventoryItemId
        : journey.id,
      sourceVersion: journey.templateVersion ?? 'phase2-v1',
      state: step?.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'OPEN',
      priority: journey.primarySignal?.severity === 'CRITICAL' ? 'NOW'
        : journey.primarySignal?.severity === 'HIGH' || step?.status === 'BLOCKED' ? 'SOON' : 'PLAN',
      signal: weatherGrounding?.headline ?? financialHeadline ?? `${title}: ${step?.label ?? 'continue the active decision'}`,
      whyItMatters: weatherGrounding?.implication ?? financialWhy ?? (coverageUncertain && subjectLabel
        ? `You previously said you were not sure whether ${subjectLabel} is covered. Confirm the current information, or ask to be reminded later.`
        : step?.description ?? 'This active journey preserves the evidence and decisions needed for the next home outcome.'),
      recommendedAction: weatherGrounding
        ? `Review ${weatherGrounding.hazard.toLowerCase()} details`
        : financialGrounding
        ? `Review ${financialGrounding.subject} exposure`
        : recommendationResponse.materialActionAllowed
          ? step?.label ?? 'Continue this home decision'
        : withheldRecommendedAction ?? recommendationResponse.safeNextAction,
      withheldRecommendedAction,
      expectedOutcome: weatherGrounding
        ? weatherGrounding.preparation
        : financialGrounding
        ? `Clarify the amount, coverage, and next decision for ${financialGrounding.subject} before committing money.`
        : subjectLabel
          ? `Keeps ${subjectLabel}'s property, evidence, and decision context intact while you continue.`
        : `Keeps this property's evidence and decision context intact as you ${journeyTitle.charAt(0).toLowerCase()}${journeyTitle.slice(1)}.`,
      ...(weatherGrounding ? {
        presentation: {
          variant: 'WEATHER_ALERT' as const,
          eyebrow: 'Weather risk',
          headline: weatherGrounding.headline.slice(0, 180),
          summary: weatherGrounding.implication.slice(0, 320),
          whyNow: `${weatherGrounding.implication} ${weatherGrounding.preparation}`.slice(0, 500),
          keyFacts: [
            { label: 'Forecast window', value: weatherGrounding.windowLabel },
            { label: 'Preparation', value: weatherGrounding.preparation.slice(0, 240) },
            ...(weatherGrounding.affectedSystems.length > 0
              ? [{ label: 'Affected systems', value: weatherGrounding.affectedSystems.slice(0, 3).join(' · ').slice(0, 240) }]
              : []),
            { label: 'Source freshness', value: `Observed ${weatherGrounding.observedLabel} · current` },
            { label: 'Hazard', value: weatherGrounding.hazard },
            { label: 'Location', value: weatherGrounding.propertyLabel.slice(0, 240) },
            { label: 'Severity', value: weatherGrounding.severity },
          ],
          factGroups: [],
          subject: { kind: 'EVENT' as const, id: journey.primarySignalId ?? journey.id, label: weatherGrounding.hazard },
          detailLabel: 'Why this weather risk?',
          group: null,
        },
      } : financialGrounding ? {
        presentation: {
          variant: 'FINANCIAL_EXPOSURE' as const,
          eyebrow: 'Financial planning',
          headline: financialGrounding.headline.slice(0, 180),
          summary: financialGrounding.whyNow.slice(0, 320),
          whyNow: financialGrounding.whyNow,
          keyFacts: [
            { label: 'Subject', value: financialGrounding.subject.slice(0, 240) },
            { label: 'Exposure', value: financialGrounding.amount ?? 'Not yet estimated' },
            { label: 'Trigger', value: financialGrounding.trigger?.slice(0, 240) ?? 'The recorded exposure amount requires review' },
            { label: 'Coverage', value: financialGrounding.coverage },
            { label: 'Observation date', value: financialGrounding.observedLabel ?? 'Not recorded' },
            { label: 'Confidence', value: confidenceLabel(confidence).toLowerCase() },
            { label: 'Missing facts', value: missingContextKeys.length > 0 ? missingContextKeys.slice(0, 2).join(' · ').slice(0, 240) : 'None identified' },
          ],
          factGroups: [],
          subject: {
            kind: journey.inventoryItemId ? 'INVENTORY_ITEM' as const : 'GUIDANCE_JOURNEY' as const,
            id: journey.inventoryItemId ?? journey.id,
            label: financialGrounding.subject.slice(0, 180),
          },
          detailLabel: 'See evidence',
          group: null,
        },
      } : {}),
      timing: {
        dueAt: null,
        windowStart: weatherGrounding?.effectiveFrom.toISOString() ?? journey.startedAt.toISOString(),
        windowEnd: weatherGrounding?.expiresAt.toISOString() ?? null,
        rationale: weatherGrounding
          ? `This weather signal is current for ${weatherGrounding.windowLabel}.`
          : step?.status === 'BLOCKED' ? 'The current journey step is blocked and needs review.' : 'This is the next incomplete step in an active journey.',
      },
      evidence: [{
        id: journey.primarySignal?.id ?? journey.id,
        type: weatherGrounding ? 'EXTERNAL_SOURCE' : 'SYSTEM_DERIVATION',
        label: weatherGrounding?.hazard ?? title,
        source: weatherGrounding?.source ?? 'Guidance journey',
        observedAt: (journey.primarySignal?.lastObservedAt ?? journey.updatedAt).toISOString(),
        freshness: 'CURRENT',
        confidence,
      }],
      ...decisionContract,
      confidence: { score: confidence, label: confidenceLabel(confidence), missing: missingContextKeys },
      governance,
      primaryCta: {
        kind: 'REVIEW',
        label: weatherGrounding
          ? `Review ${weatherGrounding.hazard.toLowerCase()} details`.slice(0, 120)
          : financialGrounding
          ? `Review ${financialGrounding.subject} exposure`.slice(0, 120)
          : recommendationResponse.materialActionAllowed ? step?.label ?? 'Continue journey' : 'Review home information',
        href: recommendationResponse.materialActionAllowed
          ? destinationHref
          : `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${encodeURIComponent(journey.id)}${financialLaunchParams ? `&${financialLaunchParams.toString()}` : ''}`,
      },
      secondaryCtas: [
        ...((isCoverageJourney || firstMissingContext) ? [{
          kind: 'CORRECT_FACT',
          label: correctionLabel,
          href: correctionHref,
        } as const] : []),
        ...(governance.safetyTier === 'SAFETY_EMERGENCY'
          ? [{
              kind: 'ESCALATE' as const,
              label: 'Review emergency options',
              href: `/dashboard/properties/${propertyId}/incidents`,
            }]
          : []),
      ],
      feedbackControls: RECOMMENDATION_FEEDBACK,
      relatedJourneyId: journey.id,
      createdAt: journey.createdAt.toISOString(),
      lastEvaluatedAt: journey.updatedAt.toISOString(),
    });
  }).filter((action): action is HomeAction => action !== null);
}

async function loadIncidentActions(
  propertyId: string,
  db: HomeActionSourceDb,
  propertyLabel = 'This property',
): Promise<HomeAction[]> {
  const incidents = await db.incident.findMany({
    where: {
      propertyId,
      status: { in: ['DETECTED', 'EVALUATED', 'ACTIVE', 'ACTIONED'] },
      isSuppressed: false,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }],
    },
    orderBy: [{ severityScore: 'desc' }, { updatedAt: 'desc' }],
    take: 20,
    // Weather preparation incidents own a small ordered checklist. Keep the
    // bounded set so contextual Ask can answer with the actual steps instead
    // of collapsing the plan to the first IncidentAction.
    include: { actions: { where: { status: { in: ['PROPOSED', 'CREATED', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'asc' }, take: 12 } },
  });

  return incidents.flatMap((incident) => {
    const isWeatherPreparation = incident.typeKey === 'WEATHER_PREPARATION';
    const isOfficialWeatherAlert = incident.typeKey === 'SEVERE_WEATHER_ALERT';
    const preparationSteps = isWeatherPreparation
      ? incident.actions
        .flatMap((action) => {
          const payload = action.payload && typeof action.payload === 'object' && !Array.isArray(action.payload)
            ? action.payload as Record<string, unknown>
            : {};
          const label = typeof payload.label === 'string' && payload.label.trim()
            ? payload.label.trim()
            : action.ctaLabel?.trim() ?? '';
          const sortOrder = typeof payload.sortOrder === 'number' && Number.isFinite(payload.sortOrder)
            ? payload.sortOrder
            : Number.MAX_SAFE_INTEGER;
          return label ? [{ id: action.id, label: label.slice(0, 240), sortOrder }] : [];
        })
        .sort((a, b) => a.sortOrder - b.sortOrder)
      : [];
    const proposed = incident.actions.find((action) => action.type !== 'CHECKLIST_ITEM') ?? incident.actions[0];
    const critical = incident.severity === 'CRITICAL';
    const isWeather = incident.sourceType === 'WEATHER';
    const details = incident.details && typeof incident.details === 'object' && !Array.isArray(incident.details)
      ? incident.details as Record<string, unknown>
      : {};
    const preparationExpiry = isWeatherPreparation && typeof details.effectiveTo === 'string'
      ? environmentBoundary(details.effectiveTo, true)?.toISOString() ?? null
      : null;
    const preparationStart = isWeatherPreparation && typeof details.effectiveFrom === 'string'
      ? environmentBoundary(details.effectiveFrom)?.toISOString() ?? null
      : null;
    const weatherExpiry = typeof details.expires === 'string' && !Number.isNaN(new Date(details.expires).getTime())
      ? new Date(details.expires).toISOString()
      : preparationExpiry ?? incident.expiredAt?.toISOString() ?? null;
    // The worker normally resolves alerts after a successful NWS refresh, but
    // Home must not depend on that asynchronous sweep to remove an alert whose
    // authoritative expiry has already passed.
    if (isWeather && weatherExpiry && new Date(weatherExpiry) <= new Date()) return [];
    const weatherInstruction = typeof details.instruction === 'string' && details.instruction.trim()
      ? details.instruction.trim().slice(0, 1000)
      : null;
    const recordedWeatherSource = typeof details.source === 'string' && details.source.trim()
      ? details.source.trim().slice(0, 160)
      : null;
    const weatherSource = recordedWeatherSource
      ?? (typeof details.senderName === 'string' && details.senderName.trim()
        ? `National Weather Service — ${details.senderName.trim()}`
        : isOfficialWeatherAlert ? 'National Weather Service' : 'Current weather forecast');
    const confidence = incident.confidence == null ? null : Math.max(0, Math.min(1, incident.confidence / 100));
    const preparationHref = isWeatherPreparation && typeof details.insightId === 'string' && details.insightId.trim()
      ? `/dashboard/properties/${propertyId}/environment-report/preparation?insightId=${encodeURIComponent(details.insightId.trim())}`
      : null;
    const href = preparationHref ?? proposed?.ctaUrl ?? `/dashboard/properties/${propertyId}/incidents/${incident.id}`;
    const governance = lowConsequenceGovernance();
    if (critical) {
      governance.safetyTier = 'SAFETY_EMERGENCY';
      governance.professionalBoundary = 'This is a conservative escalation prompt, not a diagnosis or emergency determination.';
      governance.conservativeFallback = 'Avoid the affected system or area until a qualified professional confirms it is safe.';
      governance.emergencyEscalation = 'If there is immediate danger, active damage, fire, gas, or electrical risk, leave the area and contact emergency services or the appropriate utility.';
    }
    return [adaptHomeActionSource('INCIDENT', {
      id: `incident:${incident.id}`,
      propertyId,
      lineageId: `incident:${incident.fingerprint}`,
      sourceEntityId: incident.id,
      sourceVersion: 'phase2-v1',
      state: proposed?.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'OPEN',
      priority: critical ? 'NOW' : incident.severity === 'WARNING' ? 'SOON' : 'PLAN',
      signal: incident.title,
      whyItMatters: incident.summary ?? 'An active property incident may affect safety, damage exposure, or timely response.',
      recommendedAction: isWeatherPreparation
        ? preparationSteps[0]?.label ?? `Prepare this home for ${incident.title.replace(/\s+preparation$/i, '')}`
        : isOfficialWeatherAlert
        ? `Review ${incident.title} safety guidance`
        : isWeather
        ? `Review ${incident.title} guidance`
        : proposed?.ctaLabel ?? (critical ? 'Review safety response now' : 'Review incident'),
      expectedOutcome: isWeatherPreparation
        ? preparationSteps.length
          ? `Complete these ${preparationSteps.length} preparation steps before the forecast window.`
          : 'Review the forecast and prepare this home before the weather window.'
        : weatherInstruction ?? 'Confirm the incident response and preserve the evidence needed for follow-up.',
      ...(isWeather ? {
        presentation: {
          variant: isWeatherPreparation ? 'ENVIRONMENT_PREPARATION' as const : 'WEATHER_ALERT' as const,
          eyebrow: isOfficialWeatherAlert ? 'Official weather alert' : 'Local forecast',
          headline: incident.title.slice(0, 180),
          summary: (incident.summary ?? (isOfficialWeatherAlert ? 'An official weather alert is active for this property.' : 'A current weather forecast may affect this property.')).slice(0, 320),
          whyNow: (weatherExpiry
            ? `${isOfficialWeatherAlert ? 'This alert' : 'This preparation window'} runs through ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(weatherExpiry))}.`
            : isOfficialWeatherAlert ? 'This alert remains active until the official source clears it.' : 'Use the current forecast window to prepare this home.').slice(0, 500),
          keyFacts: [
            { label: 'Hazard', value: incident.title.slice(0, 240) },
            { label: 'Location', value: propertyLabel.slice(0, 240) },
            { label: 'Forecast window', value: weatherExpiry ? `Through ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(weatherExpiry))}` : isOfficialWeatherAlert ? 'Until the alert is cleared' : 'Current forecast window' },
            { label: 'Severity', value: String(incident.severity).toLowerCase() },
            { label: 'Source freshness', value: `Observed ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(incident.openedAt)}` },
            { label: 'Preparation', value: (preparationSteps[0]?.label ?? weatherInstruction ?? `Review ${incident.title} guidance`).slice(0, 240) },
          ],
          factGroups: preparationSteps.length ? [{
            label: 'Preparation checklist',
            facts: preparationSteps.slice(0, 8).map((step, index) => ({
              key: `step-${index + 1}`,
              label: `Step ${index + 1}`,
              value: step.label,
              kind: 'RECORDED' as const,
              source: weatherSource,
              observedAt: incident.updatedAt.toISOString(),
            })),
          }] : [],
          subject: { kind: isWeatherPreparation ? 'CHECKLIST' as const : 'EVENT' as const, id: incident.id, label: `${incident.title} at ${propertyLabel}`.slice(0, 180) },
          detailLabel: isWeatherPreparation ? 'Preparation steps' : 'Official guidance',
          group: null,
        },
      } : {}),
      timing: {
        dueAt: isWeatherPreparation ? preparationStart : isWeather ? weatherExpiry : null,
        windowStart: preparationStart ?? incident.openedAt.toISOString(),
        windowEnd: isWeather ? weatherExpiry : incident.expiredAt?.toISOString() ?? null,
        rationale: isWeather
          ? weatherExpiry
            ? `${isOfficialWeatherAlert ? 'This official weather alert' : 'This forecast-based preparation plan'} is active through the recorded weather window.`
            : isOfficialWeatherAlert ? 'This official weather alert remains active until the source clears it.' : 'This preparation plan follows the current forecast window.'
          : critical ? 'Critical incidents require prompt review.' : 'The incident remains active and unresolved.',
      },
      evidence: [{
        id: incident.id,
        type: isWeather ? 'EXTERNAL_SOURCE' : 'SYSTEM_DERIVATION',
        label: incident.title,
        source: isWeather ? weatherSource : incident.sourceType,
        observedAt: incident.openedAt.toISOString(),
        freshness: 'CURRENT',
        confidence,
      }],
      assumptions: [], options: [], tradeoffs: [],
      confidence: { score: confidence, label: confidenceLabel(confidence), missing: confidence == null ? ['Incident confidence'] : [] },
      governance,
      primaryCta: {
        kind: critical ? 'ESCALATE' : 'REVIEW',
        label: isWeatherPreparation ? 'Open preparation checklist' : isOfficialWeatherAlert ? 'View official alert' : isWeather ? 'View forecast details' : proposed?.ctaLabel ?? 'Review incident',
        href,
      },
      secondaryCtas: [{ kind: 'CORRECT_FACT', label: 'Correct incident context', href: `/dashboard/properties/${propertyId}/incidents/${incident.id}` }],
      feedbackControls: critical ? ['ACKNOWLEDGE', 'CORRECT_FACT'] : RECOMMENDATION_FEEDBACK,
      relatedJourneyId: null,
      createdAt: incident.createdAt.toISOString(),
      lastEvaluatedAt: (incident.lastEvaluatedAt ?? incident.updatedAt).toISOString(),
    })];
  });
}

function seasonLabel(season: string): string {
  return season.charAt(0) + season.slice(1).toLowerCase();
}

async function loadSeasonalChecklistActions(propertyId: string, db: HomeActionSourceDb): Promise<HomeAction[]> {
  const now = new Date();
  const checklists = await db.seasonalChecklist.findMany({
    where: {
      propertyId,
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      seasonEndDate: { gte: now },
    },
    orderBy: { seasonStartDate: 'asc' },
    take: 4,
    include: { items: { orderBy: [{ priority: 'asc' }, { recommendedDate: 'asc' }] } },
  });

  // Generation may prepare the next season before the current one closes.
  // Select only after removing empty/stale candidates so one checklist with
  // no actionable items cannot hide a later applicable checklist. Prefer the
  // active checklist, then the nearest upcoming checklist.
  const actionableChecklists = checklists.map((checklist) => {
    const pendingItems = checklist.items.filter((item) =>
      item.status === 'RECOMMENDED' ||
      item.status === 'ADDED' ||
      (item.status === 'SNOOZED' && (!item.snoozedUntil || item.snoozedUntil <= now)),
    );
    return { checklist, pendingItems };
  }).filter(({ pendingItems }) => pendingItems.length > 0)
    .sort((a, b) => {
      const aActive = a.checklist.seasonStartDate <= now && a.checklist.seasonEndDate >= now;
      const bActive = b.checklist.seasonStartDate <= now && b.checklist.seasonEndDate >= now;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.checklist.seasonStartDate.getTime() - b.checklist.seasonStartDate.getTime();
    });

  return actionableChecklists.slice(0, 1).map(({ checklist, pendingItems }) => {

    const criticalCount = pendingItems.filter((item) => item.priority === 'CRITICAL').length;
    const active = checklist.seasonStartDate <= now && checklist.seasonEndDate >= now;
    const daysUntilStart = Math.max(0, Math.ceil((checklist.seasonStartDate.getTime() - now.getTime()) / 86_400_000));
    const daysRemaining = Math.max(0, Math.ceil((checklist.seasonEndDate.getTime() - now.getTime()) / 86_400_000));
    const displaySeason = seasonLabel(checklist.season);
    const progress = `${checklist.tasksCompleted} of ${checklist.totalTasks} complete`;
    const priority: HomeAction['priority'] = active && criticalCount > 0
      ? 'NOW'
      : criticalCount > 0 || (active && daysRemaining <= 14)
        ? 'SOON'
        : 'PLAN';
    const timingSummary = active
      ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remain in ${displaySeason.toLowerCase()}.`
      : `${displaySeason} starts in ${daysUntilStart} day${daysUntilStart === 1 ? '' : 's'}.`;
    const priorityTasks = pendingItems.filter((item) => item.priority === 'CRITICAL');
    const seasonalHeadline = criticalCount > 0
      ? `${criticalCount} ${displaySeason.toLowerCase()} task${criticalCount === 1 ? ' needs' : 's need'} attention`
      : `${pendingItems.length} ${displaySeason.toLowerCase()} task${pendingItems.length === 1 ? '' : 's'} to plan`;
    const seasonalSummary = criticalCount > 0
      ? `You have ${pendingItems.length} task${pendingItems.length === 1 ? '' : 's'} left, but only ${criticalCount} ${criticalCount === 1 ? 'needs' : 'need'} attention now.`
      : `A few timely tasks can help keep this home ready for ${displaySeason.toLowerCase()}.`;

    return adaptHomeActionSource('MAINTENANCE', {
      id: `seasonal-checklist:${checklist.id}`,
      propertyId,
      lineageId: `seasonal-checklist:${checklist.id}`,
      sourceEntityId: checklist.id,
      sourceVersion: checklist.updatedAt.toISOString(),
      state: checklist.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'OPEN',
      priority,
      signal: `${displaySeason} seasonal checklist: ${pendingItems.length} task${pendingItems.length === 1 ? '' : 's'} remaining`,
      whyItMatters: `${progress}. ${criticalCount > 0 ? `${criticalCount} critical task${criticalCount === 1 ? '' : 's'} still need attention. ` : ''}${timingSummary}`,
      recommendedAction: `Review the ${displaySeason} seasonal checklist`,
      expectedOutcome: `Complete or deliberately manage the remaining ${displaySeason.toLowerCase()} preparation tasks before the seasonal window closes.`,
      presentation: {
        variant: 'SEASONAL_CHECKLIST',
        eyebrow: `${displaySeason} checklist`,
        headline: seasonalHeadline,
        summary: seasonalSummary,
        whyNow: `${timingSummary}${criticalCount > 0 ? ` ${criticalCount} critical task${criticalCount === 1 ? '' : 's'} remain.` : ''}`,
        keyFacts: [
          { label: 'Season', value: displaySeason },
          { label: 'Progress', value: progress },
          { label: 'Time remaining', value: active ? `${daysRemaining} days` : `Starts in ${daysUntilStart} days` },
          { label: 'Critical tasks', value: criticalCount > 0 ? priorityTasks.slice(0, 2).map((item) => item.title).join(' · ').slice(0, 240) : 'None currently' },
          { label: 'Next task', value: pendingItems[0].title.slice(0, 240) },
        ],
        factGroups: [],
        subject: { kind: 'CHECKLIST', id: checklist.id, label: `${displaySeason} checklist` },
        detailLabel: 'Why these tasks?',
        group: { kind: 'SEASONAL_CHECKLIST', itemCount: pendingItems.length },
      },
      timing: {
        dueAt: checklist.seasonEndDate.toISOString(),
        windowStart: checklist.seasonStartDate.toISOString(),
        windowEnd: checklist.seasonEndDate.toISOString(),
        rationale: timingSummary,
      },
      evidence: pendingItems.slice(0, 50).map((item) => ({
        id: item.id,
        type: 'SYSTEM_DERIVATION' as const,
        label: item.title,
        source: `${displaySeason} seasonal checklist`,
        observedAt: item.updatedAt.toISOString(),
        freshness: 'CURRENT' as const,
        confidence: 1,
      })),
      assumptions: [],
      options: [],
      tradeoffs: [],
      confidence: { score: 1, label: 'HIGH', missing: [] },
      governance: lowConsequenceGovernance('phase2-seasonal-v1'),
      primaryCta: {
        kind: 'REVIEW',
        label: criticalCount > 0
          ? `See ${criticalCount} priority task${criticalCount === 1 ? '' : 's'}`
          : `View ${displaySeason.toLowerCase()} tasks`,
        href: `/dashboard/seasonal?propertyId=${encodeURIComponent(propertyId)}`,
      },
      secondaryCtas: [],
      feedbackControls: ['SNOOZE', 'NOT_RELEVANT'],
      relatedJourneyId: null,
      createdAt: checklist.createdAt.toISOString(),
      lastEvaluatedAt: checklist.updatedAt.toISOString(),
    });
  });
}

async function loadRecallActions(propertyId: string, db: HomeActionSourceDb): Promise<HomeAction[]> {
  const matches = await db.recallMatch.findMany({
    where: { propertyId, status: 'OPEN' },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    include: { recall: true, inventoryItem: { select: { name: true } } },
  });
  return matches.map((match) => {
    const critical = match.recall.severity === 'CRITICAL';
    const confidence = Math.max(0, Math.min(1, match.confidencePct / 100));
    const title = match.inventoryItem?.name ? `${match.recall.title} — ${match.inventoryItem.name}` : match.recall.title;
    const governance = lowConsequenceGovernance();
    if (critical) {
      governance.safetyTier = 'SAFETY_EMERGENCY';
      governance.professionalBoundary = 'Follow the manufacturer or regulator remedy; ContractToCozy does not determine whether continued use is safe.';
      governance.conservativeFallback = 'Stop using the affected item until the recall remedy or qualified guidance confirms the next step.';
      governance.emergencyEscalation = 'If the item is smoking, sparking, leaking, overheating, or causing immediate danger, leave the area and contact emergency services or the appropriate utility.';
    }
    return adaptHomeActionSource('RECALL', {
      id: `recall:${match.id}`,
      propertyId,
      lineageId: `recall:${match.recallId}:${match.inventoryItemId ?? 'property'}`,
      sourceEntityId: match.id,
      sourceVersion: match.recall.updatedAt.toISOString(),
      state: 'OPEN', priority: critical ? 'NOW' : 'SOON',
      signal: title,
      whyItMatters: match.recall.hazard ?? match.recall.summary ?? 'A matched recall may require a manufacturer remedy or use restriction.',
      recommendedAction: match.recall.remedy ?? 'Review the recall and confirm the remedy',
      expectedOutcome: 'Confirm whether the matched item is affected and complete or deliberately dismiss the regulator remedy.',
      timing: { dueAt: null, windowStart: (match.recall.recalledAt ?? match.createdAt).toISOString(), windowEnd: null, rationale: 'Open recall matches remain time-sensitive until confirmed or resolved.' },
      evidence: [{ id: match.recall.id, type: 'EXTERNAL_SOURCE', label: match.recall.title, source: String(match.recall.source), observedAt: match.recall.lastSeenAt.toISOString(), freshness: 'CURRENT', confidence }],
      assumptions: [], options: [], tradeoffs: [],
      confidence: { score: confidence, label: confidenceLabel(confidence), missing: match.inventoryItemId ? [] : ['Matched inventory item'] },
      governance,
      primaryCta: { kind: critical ? 'ESCALATE' : 'REVIEW', label: 'Review recall', href: `/dashboard/properties/${propertyId}/recalls` },
      secondaryCtas: match.recall.remedyUrl ? [{ kind: 'REVIEW', label: 'View official remedy', href: match.recall.remedyUrl }] : [],
      feedbackControls: critical ? ['ACKNOWLEDGE', 'CORRECT_FACT'] : RECOMMENDATION_FEEDBACK,
      relatedJourneyId: null,
      createdAt: match.createdAt.toISOString(), lastEvaluatedAt: match.updatedAt.toISOString(),
    });
  });
}

// Home Operations Slice 5: mirrors resolveFindingWorkPolicy's $1,500
// threshold in inspectionHub.service.ts — a MAJOR finding above this cost
// already reads as MATERIAL_FINANCIAL in the Home feed, before the
// homeowner has explicitly accepted it as work.
const INSPECTION_MATERIAL_COST_THRESHOLD_CENTS = 150_000;
const STALE_REPORT_AGE_MS = 180 * 24 * 60 * 60 * 1000;

function formatCentsRangeForCopy(low: number | null, high: number | null): string | null {
  const fmt = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
  if (low != null && high != null) return `${fmt(low)}–${fmt(high)}`;
  if (high != null) return `up to ${fmt(high)}`;
  if (low != null) return `${fmt(low)}+`;
  return null;
}

async function loadInspectionFindingActions(propertyId: string, db: HomeActionSourceDb): Promise<HomeAction[]> {
  if (!db.inspectionFinding) return [];
  const findings = await db.inspectionFinding.findMany({
    where: { propertyId, status: 'OPEN', severity: { not: 'INFORMATIONAL' }, report: { status: 'CONFIRMED' } },
    orderBy: [{ severity: 'asc' }, { updatedAt: 'desc' }],
    take: 30,
    include: { report: { select: { id: true, confirmedAt: true, reportType: true, inspectorName: true } } },
  });

  return findings.map((finding) => {
    const isSafety = finding.severity === 'SAFETY';
    const isMaterialMajor = finding.severity === 'MAJOR' &&
      (finding.estimatedCostCentsHigh ?? 0) >= INSPECTION_MATERIAL_COST_THRESHOLD_CENTS;
    const costRangeText = formatCentsRangeForCopy(finding.estimatedCostCentsLow, finding.estimatedCostCentsHigh);

    const governance = isSafety
      ? {
          ...lowConsequenceGovernance('inspection-hub-v1'),
          safetyTier: 'SAFETY_EMERGENCY' as const,
          professionalBoundary: 'This reflects the inspector\'s written finding, not a licensed re-inspection. Confirm the safety condition with a qualified professional before relying on it.',
          conservativeFallback: 'Treat the affected system as unsafe until a qualified professional confirms otherwise.',
        }
      : isMaterialMajor
        ? {
            ...materialFinancialGovernance('inspection-hub-v1'),
            professionalBoundary: 'Cost estimates are ranges drawn from inspection report language, not a contractor quote.',
          }
        : lowConsequenceGovernance('inspection-hub-v1');

    const reportAgeMs = finding.report.confirmedAt ? Date.now() - finding.report.confirmedAt.getTime() : null;
    const freshness: HomeAction['evidence'][number]['freshness'] =
      reportAgeMs == null ? 'UNKNOWN' : reportAgeMs > STALE_REPORT_AGE_MS ? 'STALE' : 'CURRENT';

    const whyItMatters = costRangeText
      ? `${finding.inspectorDescription} Estimated cost range: ${costRangeText}.`
      : finding.inspectorDescription;

    return adaptHomeActionSource('INSPECTION_FINDING', {
      id: `inspection-finding:${finding.id}`,
      propertyId,
      lineageId: `inspection-finding:${finding.id}`,
      sourceEntityId: finding.id,
      sourceVersion: finding.updatedAt.toISOString(),
      state: 'OPEN',
      priority: isSafety ? 'NOW' : finding.severity === 'MAJOR' ? 'SOON' : finding.severity === 'MINOR' ? 'PLAN' : 'CONSIDER',
      signal: `${finding.homeSystem}: ${finding.inspectorRecommendation}`,
      whyItMatters,
      recommendedAction: 'Review the finding and accept it as tracked work, or dismiss it.',
      expectedOutcome: 'The finding is addressed and the inspection record reflects the verified outcome.',
      timing: {
        dueAt: null,
        windowStart: finding.createdAt.toISOString(),
        windowEnd: null,
        rationale: isSafety ? 'Safety findings warrant prompt review.' : 'This finding is open in a confirmed inspection report.',
      },
      evidence: [{
        id: finding.report.id,
        type: 'DOCUMENT',
        label: `${finding.report.reportType} inspection${finding.report.inspectorName ? ` by ${finding.report.inspectorName}` : ''}`,
        source: 'Inspection Hub',
        observedAt: (finding.report.confirmedAt ?? finding.createdAt).toISOString(),
        freshness,
        confidence: 1,
      }],
      assumptions: [], options: [], tradeoffs: [],
      confidence: { score: 1, label: 'HIGH', missing: [] },
      governance,
      primaryCta: {
        kind: isSafety ? 'ESCALATE' : 'REVIEW',
        label: 'Review finding',
        href: `/dashboard/properties/${propertyId}/inspection-hub/${finding.reportId}?findingId=${encodeURIComponent(finding.id)}`,
      },
      secondaryCtas: [],
      feedbackControls: isSafety ? ['ACKNOWLEDGE', 'CORRECT_FACT'] : RECOMMENDATION_FEEDBACK,
      relatedJourneyId: null,
      createdAt: finding.createdAt.toISOString(),
      lastEvaluatedAt: finding.updatedAt.toISOString(),
    });
  });
}

async function loadCoverageActions(propertyId: string, db: HomeActionSourceDb): Promise<HomeAction[]> {
  const freshnessCutoff = new Date();
  freshnessCutoff.setUTCDate(freshnessCutoff.getUTCDate() - 30);
  const reviews = await db.coverageReview.findMany({
    where: {
      propertyId,
      status: 'READY',
      scopeStatus: { in: ['SUPPORTED', 'PARTIAL'] },
      overallState: 'QUESTIONS',
      generatedAt: { gte: freshnessCutoff },
      policyTerm: { verificationStatus: 'VERIFIED' },
      questions: {
        some: {
          isPrimary: true,
          status: 'OPEN',
          questionType: 'EVIDENCE_BASED',
          priority: 'HIGH',
        },
      },
    },
    orderBy: { generatedAt: 'desc' },
    take: 10,
    include: {
      property: { select: { state: true } },
      policyTerm: {
        select: {
          termEnd: true,
          insurancePolicy: { select: { carrierName: true, coverageType: true } },
        },
      },
      questions: {
        where: {
          isPrimary: true,
          status: 'OPEN',
          questionType: 'EVIDENCE_BASED',
          priority: 'HIGH',
        },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
  return reviews.flatMap((review) => {
    const question = review.questions[0];
    if (!question) return [];
    const evidenceRows = Array.isArray(question.evidenceJson)
      ? question.evidenceJson
      : [];
    if (evidenceRows.length === 0) return [];
    const missingEvidenceRows = Array.isArray(question.missingEvidenceJson)
      ? question.missingEvidenceJson
      : [];
    const evidenceRecords = evidenceRows.map(objectValue);
    const missingRecords = missingEvidenceRows.map(objectValue);
    const subject = firstUsefulText(
      ...evidenceRecords.flatMap((entry) => [entry.subject, entry.subjectLabel, entry.label, entry.factLabel]),
      humanizeFactKey(question.category),
    ) ?? 'policy protection';
    const evidenceStatus = evidenceRows.length > 0
      ? `${evidenceRows.length} confirmed policy fact${evidenceRows.length === 1 ? '' : 's'}`
      : 'No supporting policy fact recorded';
    const exactGap = firstUsefulText(
      ...missingRecords.flatMap((entry) => [entry.label, entry.factLabel, entry.factKey, entry.description, entry.reason]),
      question.plainLanguageQuestion,
    )!;
    const carrierName = review.policyTerm?.insurancePolicy.carrierName?.trim() || null;
    const coverageType = review.policyTerm?.insurancePolicy.coverageType?.trim() || null;
    const renewalLabel = review.policyTerm?.termEnd
      ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(review.policyTerm.termEnd)
      : review.expiresAt
        ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(review.expiresAt)
        : null;
    const headline = question.plainLanguageQuestion.replace(/\s+/g, ' ').trim();
    const actionId = `coverage-review:${review.id}`;
    return adaptHomeActionSource('COVERAGE', {
      id: actionId,
      propertyId,
      lineageId: `coverage-review:${question.questionKey}`,
      sourceEntityId: review.id,
      sourceVersion: `${review.reviewVersion}:${review.inputFingerprint}`,
      state: 'OPEN',
      priority: 'SOON',
      signal: question.plainLanguageQuestion,
      whyItMatters: question.whyItMatters,
      recommendedAction: 'Review the confirmed policy fact and decide whether to ask your carrier',
      expectedOutcome: 'Resolve the material question using the controlling policy or licensed help.',
      presentation: {
        variant: 'COVERAGE_REVIEW',
        eyebrow: 'Coverage review',
        headline: headline.slice(0, 180),
        summary: question.whyItMatters.slice(0, 320),
        whyNow: question.whyItMatters.slice(0, 500),
        keyFacts: [
          { label: 'Subject', value: subject.slice(0, 240) },
          { label: 'Evidence', value: evidenceStatus },
          { label: 'Provider', value: carrierName?.slice(0, 240) ?? 'Not recorded' },
          { label: 'Policy', value: coverageType?.slice(0, 240) ?? 'Not recorded' },
          { label: 'Renewal / expiry', value: renewalLabel ?? 'Not recorded' },
          { label: 'Gap', value: exactGap.slice(0, 240) },
        ],
        factGroups: [],
        subject: { kind: 'PROPERTY', id: propertyId, label: subject.slice(0, 180) },
        detailLabel: 'See policy evidence',
        group: null,
      },
      timing: {
        dueAt: review.expiresAt?.toISOString() ?? null,
        windowStart: review.generatedAt.toISOString(),
        windowEnd: review.expiresAt?.toISOString() ?? null,
        rationale: 'Only current, verified high-priority coverage questions are promoted.',
      },
      evidence: [{
        id: question.id,
        type: 'SYSTEM_DERIVATION',
        label: 'Evidence-qualified coverage question',
        source: 'Confirmed policy facts',
        observedAt: review.generatedAt.toISOString(),
        freshness: 'CURRENT',
        confidence: evidenceRows.length > 0 ? 0.9 : 0.6,
      }],
      assumptions: [{
        key: 'confirmed-policy-fact',
        label: 'Confirmed policy fact is current',
        value: 'The question uses a homeowner-confirmed fact from the latest verified policy term.',
        source: 'PROPERTY_FACT',
        editable: true,
      }],
      options: [
        { id: 'review-evidence', label: 'Review the evidence', summary: 'Confirm the source fact and prepare a carrier question.', recommended: true },
        { id: 'licensed-help', label: 'Seek licensed help', summary: 'Ask a licensed professional to interpret the controlling policy language.', recommended: false },
      ],
      tradeoffs: [
        { optionId: 'review-evidence', dimension: 'EFFORT', summary: 'Requires reviewing the source record without assuming an answer.' },
        { optionId: 'licensed-help', dimension: 'COST', summary: 'May add time or cost while reducing interpretation uncertainty.' },
      ],
      confidence: { score: 0.9, label: 'HIGH', missing: [] },
      governance: {
        ...lowConsequenceGovernance(), safetyTier: 'MATERIAL_FINANCIAL',
        professionalBoundary: question.professionalBoundary,
        jurisdictionCheck: {
          status: 'UNKNOWN',
          jurisdiction: review.property.state,
          checkedAt: review.generatedAt.toISOString(),
          source: 'No jurisdiction-specific rule is used or represented as verified',
        },
      },
      primaryCta: { kind: 'REVIEW', label: 'Review question', href: `/dashboard/properties/${propertyId}/tools/coverage-intelligence?stage=questions` },
      secondaryCtas: [{ kind: 'CORRECT_FACT', label: 'Correct policy facts', href: `/dashboard/properties/${propertyId}/tools/coverage-intelligence` }],
      feedbackControls: RECOMMENDATION_FEEDBACK, relatedJourneyId: null,
      createdAt: review.createdAt.toISOString(),
      lastEvaluatedAt: review.updatedAt.toISOString(),
    });
  });
}

// Home Intelligence Functional Completeness FRD Phase 1, Slice 1 — the
// only Resolution Center action category (resolutionCenter.service.ts
// lines 972-1008) with no existing Home Action equivalent: no other
// loader or the orchestration.service.ts candidate pipeline reads
// Warranty/InsurancePolicy for renewal purposes. Mirrors that same
// 90-day-upcoming / expired threshold so the semantics carry over.
const COVERAGE_RENEWAL_UPCOMING_WINDOW_DAYS = 90;

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

async function loadCoverageRenewalActions(propertyId: string, db: HomeActionSourceDb, evaluatedAt?: Date): Promise<HomeAction[]> {
  if (!db.warranty || !db.insurancePolicy) return [];

  const now = evaluatedAt ?? new Date();
  const [warranties, insurancePolicies] = await Promise.all([
    db.warranty.findMany({
      where: { propertyId },
      select: { id: true, providerName: true, expiryDate: true, updatedAt: true, inventoryItemId: true },
    }),
    db.insurancePolicy.findMany({
      where: { propertyId },
      select: { id: true, carrierName: true, expiryDate: true, updatedAt: true },
    }),
  ]);

  const actions: HomeAction[] = [];

  const buildAction = (record: {
    id: string;
    expiryDate: Date | null;
    updatedAt: Date;
    label: string;
    entityType: 'Warranty' | 'Insurance';
    href: string;
  }) => {
    if (!record.expiryDate) return;
    const daysUntilDue = daysBetween(record.expiryDate, now);
    const expired = daysUntilDue < 0;
    if (!expired && daysUntilDue > COVERAGE_RENEWAL_UPCOMING_WINDOW_DAYS) return;

    const title = `${record.entityType} Renewal: ${record.label}`;
    actions.push(adaptHomeActionSource('COVERAGE', {
      id: `coverage-renewal:${record.entityType.toLowerCase()}:${record.id}`,
      propertyId,
      lineageId: `coverage-renewal:${record.entityType.toLowerCase()}:${record.id}`,
      sourceEntityId: record.id,
      sourceVersion: record.updatedAt.toISOString(),
      state: 'OPEN',
      priority: expired ? 'SOON' : 'PLAN',
      signal: expired ? `EXPIRED: ${title}` : `UPCOMING: ${title}`,
      whyItMatters: expired
        ? `${record.entityType === 'Warranty' ? 'Warranty' : 'Policy'} coverage expired ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'} ago.`
        : `${record.entityType === 'Warranty' ? 'Warranty' : 'Policy'} coverage expires in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}.`,
      recommendedAction: expired ? 'Renew or replace this coverage as soon as possible.' : 'Review renewal terms before the coverage expires.',
      expectedOutcome: 'Coverage continues without a gap.',
      timing: {
        dueAt: record.expiryDate.toISOString(),
        windowStart: null,
        windowEnd: null,
        rationale: expired ? 'Coverage has already lapsed.' : `Renewal window opens ${COVERAGE_RENEWAL_UPCOMING_WINDOW_DAYS} days before expiry.`,
      },
      evidence: [{
        id: record.id,
        type: 'PROPERTY_FACT',
        label: title,
        source: `${record.entityType} record`,
        observedAt: record.updatedAt.toISOString(),
        freshness: 'CURRENT',
        confidence: 1,
      }],
      assumptions: [{
        key: 'renewal-decision',
        label: 'Homeowner intends to keep this coverage active',
        value: 'Coverage should continue without a gap unless the homeowner decides otherwise.',
        source: 'SYSTEM_DEFAULT',
        editable: true,
      }],
      options: [
        { id: 'renew', label: 'Renew this coverage', summary: `Contact ${record.label} to renew before the coverage lapses.`, recommended: true },
        { id: 'shop-alternatives', label: 'Compare alternatives', summary: 'Review other providers or policies before renewing.', recommended: false },
      ],
      tradeoffs: [
        { optionId: 'renew', dimension: 'EFFORT', summary: 'Fastest way to avoid a coverage gap, but may not be the best available rate.' },
        { optionId: 'shop-alternatives', dimension: 'TIMING', summary: 'May take longer and risks a temporary coverage gap if not completed before expiry.' },
      ],
      confidence: { score: 1, label: 'HIGH', missing: [] },
      governance: materialFinancialGovernance('resolution-center-parity-v1'),
      primaryCta: { kind: 'REVIEW', label: 'Review coverage', href: record.href },
      secondaryCtas: [],
      feedbackControls: RECOMMENDATION_FEEDBACK,
      relatedJourneyId: null,
      createdAt: record.updatedAt.toISOString(),
      lastEvaluatedAt: now.toISOString(),
    }));
  };

  warranties.forEach((warranty) => buildAction({
    id: warranty.id,
    expiryDate: warranty.expiryDate,
    updatedAt: warranty.updatedAt,
    label: warranty.providerName,
    entityType: 'Warranty',
    href: `/dashboard/properties/${propertyId}/inventory?tab=coverage${warranty.inventoryItemId ? `&highlight=${encodeURIComponent(warranty.inventoryItemId)}` : ''}`,
  }));
  insurancePolicies.forEach((policy) => buildAction({
    id: policy.id,
    expiryDate: policy.expiryDate,
    updatedAt: policy.updatedAt,
    label: policy.carrierName,
    entityType: 'Insurance',
    href: `/dashboard/insurance?propertyId=${encodeURIComponent(propertyId)}`,
  }));

  return actions;
}

// Home Intelligence Functional Completeness FRD Phase 1, Slice 2 — ports
// resolutionCenter.service.ts's HEALTH_INSIGHT logic (lines ~882-955) onto
// the canonical feed. Mirrors that file's two-branch handling: the
// aggregate "Appliances" factor is recomputed independently from inventory
// records (a stale score snapshot must not hide a concrete missing-field
// action), while every other named factor is surfaced generically from
// calculateHealthScore()'s own insights, matched to an inventory item by
// fuzzy name where possible.
const HEALTH_INSIGHT_STATUSES = ['Needs attention', 'Needs Review', 'Needs Inspection', 'Missing Data', 'Needs Warranty'];
const ACTIVE_BOOKING_STATUSES_FOR_HEALTH_SCORE = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] as const;

function normalizeHealthFactorText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isAggregateApplianceFactor(factor: string): boolean {
  return normalizeHealthFactorText(factor) === 'appliances';
}

function extractHealthInsightAssetName(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const withoutSuffix = trimmed
    .replace(/\s+aging$/i, '').replace(/\s+age$/i, '')
    .replace(/\s+needs coverage$/i, '').replace(/\s+has partial coverage$/i, '')
    .trim();
  if (!withoutSuffix) return null;
  const normalized = normalizeHealthFactorText(withoutSuffix);
  if (['property', 'property age', 'hvac', 'hvac age', 'water heater', 'water heater age'].includes(normalized)) return null;
  return withoutSuffix;
}

function matchInventoryItemForHealthFactor(
  title: string,
  inventoryItems: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  const assetName = extractHealthInsightAssetName(title);
  if (!assetName) return null;
  const normalizedAssetName = normalizeHealthFactorText(assetName);
  if (!normalizedAssetName) return null;

  let bestMatch: { id: string; name: string } | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const item of inventoryItems) {
    const normalizedItemName = normalizeHealthFactorText(item.name);
    if (!normalizedItemName) continue;
    const isMatch = normalizedItemName === normalizedAssetName ||
      normalizedItemName.includes(normalizedAssetName) || normalizedAssetName.includes(normalizedItemName);
    if (!isMatch) continue;
    const score = Math.abs(normalizedItemName.length - normalizedAssetName.length);
    if (score < bestScore) { bestMatch = item; bestScore = score; }
  }
  return bestMatch;
}

async function loadHealthInsightActions(propertyId: string, db: HomeActionSourceDb, evaluatedAt?: Date): Promise<HomeAction[]> {
  if (!db.property || !db.document || !db.booking) return [];

  const now = evaluatedAt ?? new Date();
  const [property, documentCount, activeBookings] = await Promise.all([
    db.property.findUnique({ where: { id: propertyId }, include: { inventoryItems: true, warranties: true } }),
    db.document.count({ where: { propertyId } }),
    db.booking.findMany({ where: { propertyId, status: { in: [...ACTIVE_BOOKING_STATUSES_FOR_HEALTH_SCORE] } } }),
  ]);
  if (!property) return [];

  const healthScore = calculateHealthScore(property as any, documentCount, activeBookings as any);
  const inventoryItems = (property as any).inventoryItems as Array<{ id: string; name: string; assetType: string | null; category: string; installedOn: Date | null }> ?? [];
  const applianceRecords = inventoryItems.filter((item) => item.category === 'APPLIANCE');
  const appliancesMissingInstallYear = applianceRecords.filter((item) => !item.installedOn);
  const warranties = (property as any).warranties as Array<{ id: string; expiryDate: Date | string | null }> ?? [];

  // Deterministic sourceVersion (HI-ATT-007 stable-version requirement) —
  // previously null, which stamped every evaluation as a fresh change
  // regardless of whether the contributing facts actually moved.
  // property.updatedAt already captures every scalar field
  // calculateHealthScore reads directly off property (yearBuilt, dwellingType,
  // roofType, install years, etc. — any change to those bumps it
  // automatically). Everything else calculateHealthScore/this function reads
  // from a separate record — documentCount; per-warranty expiryDate
  // (propertyScore.util.ts's hasActiveHomeWarranty, which flips as expiry
  // dates cross "now" even with no warranty row changing); per-booking
  // insightFactor, not just booking id (propertyScore.util.ts's
  // isInsightBeingAddressed — an existing booking's insightFactor can change
  // without the booking id set changing); and per-item name/assetType, not
  // just category/installedOn (feeds the "${assetName} aging" insight factor
  // name directly, which becomes the generated action's title/id) — each
  // folded into the hash explicitly so a real change to any of them changes
  // the version too.
  const healthInsightVersion = createHash('sha256').update(JSON.stringify({
    propertyUpdatedAt: (property as any).updatedAt?.toISOString?.() ?? null,
    documentCount,
    activeBookings: activeBookings.map((b: any) => `${b.id}:${b.insightFactor ?? ''}`).sort(),
    warranties: warranties.map((w) => `${w.id}:${w.expiryDate ? new Date(w.expiryDate).toISOString() : ''}`).sort(),
    items: inventoryItems.map((item) => `${item.id}:${item.category}:${item.installedOn?.toISOString() ?? ''}:${item.name}:${item.assetType ?? ''}`).sort(),
  })).digest('hex');

  const actions: HomeAction[] = [];
  const buildInsightAction = (params: {
    factorSlug: string;
    title: string;
    description: string;
    href: string;
    itemId?: string;
    assetName?: string;
  }) => {
    actions.push(adaptHomeActionSource('SYSTEM', {
      id: `health-insight:${propertyId}:${params.factorSlug}`,
      propertyId,
      lineageId: `health-insight:${propertyId}:${params.factorSlug}`,
      sourceEntityId: propertyId,
      sourceVersion: healthInsightVersion,
      state: 'OPEN',
      priority: 'PLAN',
      signal: params.title,
      whyItMatters: params.description,
      recommendedAction: 'Review and update this home fact.',
      expectedOutcome: 'The home health score reflects the property\'s current condition.',
      timing: { dueAt: null, windowStart: null, windowEnd: null, rationale: 'Advisory — not tied to a specific deadline.' },
      evidence: [{
        id: `${propertyId}:${params.factorSlug}`,
        type: 'SYSTEM_DERIVATION',
        label: params.title,
        source: 'Property health score',
        observedAt: now.toISOString(),
        freshness: 'CURRENT',
        confidence: 0.7,
      }],
      assumptions: [], options: [], tradeoffs: [],
      confidence: { score: 0.7, label: 'MEDIUM', missing: params.itemId ? [] : ['Matched inventory item'] },
      governance: lowConsequenceGovernance('resolution-center-parity-v1'),
      primaryCta: { kind: 'REVIEW', label: 'Review', href: params.href },
      secondaryCtas: [],
      feedbackControls: RECOMMENDATION_FEEDBACK,
      relatedJourneyId: null,
      createdAt: now.toISOString(),
      lastEvaluatedAt: now.toISOString(),
    }));
  };

  const insightsByFactor = new Map<string, { factor: string; status: string }>();
  healthScore.insights
    .filter((insight) => {
      if (isAggregateApplianceFactor(insight.factor)) {
        return applianceRecords.length === 0 || appliancesMissingInstallYear.length > 0;
      }
      return HEALTH_INSIGHT_STATUSES.includes(insight.status);
    })
    .forEach((insight) => {
      if (!insightsByFactor.has(insight.factor)) insightsByFactor.set(insight.factor, insight);
    });

  insightsByFactor.forEach(({ factor, status }) => {
    const factorSlug = factor.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (isAggregateApplianceFactor(factor)) {
      const missingNames = appliancesMissingInstallYear.map((item) => item.name);
      const hasRecordedAppliances = applianceRecords.length > 0;
      const title = hasRecordedAppliances
        ? missingNames.length === 1
          ? `Add installation year for ${missingNames[0]}`
          : `Complete installation years for ${missingNames.length} appliances`
        : 'Add major appliances';
      const description = hasRecordedAppliances
        ? `Installation year is missing for ${missingNames.join(', ')}. Add an approximate year to improve lifecycle and recall guidance.`
        : 'No major appliances are recorded. Add only the appliances that are present in this home.';
      buildInsightAction({ factorSlug, title, description, href: `/dashboard/properties/${propertyId}/edit?focus=appliances` });
      return;
    }

    const matchedItem = matchInventoryItemForHealthFactor(factor, inventoryItems);
    const href = matchedItem
      ? (() => {
          const params = new URLSearchParams();
          params.set('scopeCategory', 'ITEM');
          params.set('itemId', matchedItem.id);
          params.set('inventoryItemId', matchedItem.id);
          params.set('assetName', matchedItem.name);
          params.set('customIssueLabel', factor);
          return `/dashboard/properties/${propertyId}/tools/guidance-overview?${params.toString()}`;
        })()
      : `/dashboard/properties/${propertyId}/focus/health/${factorSlug}`;

    buildInsightAction({
      factorSlug,
      title: factor,
      description: `Status: ${status}. Requires resolution.`,
      href,
      itemId: matchedItem?.id,
      assetName: matchedItem?.name ?? extractHealthInsightAssetName(factor) ?? undefined,
    });
  });

  return actions;
}

// Home Intelligence Functional Completeness FRD Phase 1, Slice 2 — the
// other confirmed-zero-coverage row: no Home Action producer anywhere
// reads ReplaceRepairAnalysis today. Mirrors
// resolutionCenter.service.ts's mapReplaceRepairAnalysesToInsights (lines
// ~359-411) and its dedupe-by-item logic, but synthesizes generic
// options/tradeoffs/assumptions (rather than carrying verdict/impactLevel
// as bespoke fields) so the result satisfies HomeAction's MATERIAL_FINANCIAL
// structural minimums without extending the canonical contract.
const CURRENT_REPLACE_REPAIR_MARKER = 'CURRENT';

function dedupeReplaceRepairAnalysesForPromotion<T extends {
  inventoryItemId: string;
  currentMarker?: string | null;
  computedAt: Date;
}>(rows: T[]): T[] {
  const byItemId = new Map<string, T>();
  for (const row of rows) {
    const existing = byItemId.get(row.inventoryItemId);
    if (!existing) { byItemId.set(row.inventoryItemId, row); continue; }
    const rowIsCurrent = row.currentMarker === CURRENT_REPLACE_REPAIR_MARKER;
    const existingIsCurrent = existing.currentMarker === CURRENT_REPLACE_REPAIR_MARKER;
    if (rowIsCurrent && !existingIsCurrent) { byItemId.set(row.inventoryItemId, row); continue; }
    if (!rowIsCurrent && existingIsCurrent) continue;
    if (row.computedAt.getTime() > existing.computedAt.getTime()) byItemId.set(row.inventoryItemId, row);
  }
  return [...byItemId.values()];
}

async function loadRepairReplaceDecisionActions(propertyId: string, db: HomeActionSourceDb, evaluatedAt?: Date): Promise<HomeAction[]> {
  if (!db.replaceRepairAnalysis) return [];

  const now = evaluatedAt ?? new Date();
  const [analyses, journeys] = await Promise.all([
    db.replaceRepairAnalysis.findMany({
      where: { propertyId, status: 'READY' },
      include: { inventoryItem: { select: { id: true, name: true } } },
      orderBy: { computedAt: 'desc' },
      take: 10,
    }),
    db.guidanceJourney.findMany({
      where: {
        propertyId, issueDomain: 'ASSET_LIFECYCLE', status: 'ACTIVE',
        inventoryItemId: { not: null },
        steps: { some: { toolKey: 'replace-repair' } },
      },
      select: { id: true, inventoryItemId: true, currentStepKey: true, issueType: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    }),
  ]);

  const journeysByItemId = new Map<string, { id: string; currentStepKey: string | null; issueType: string | null }>();
  journeys.forEach((journey) => {
    if (!journey.inventoryItemId || journeysByItemId.has(journey.inventoryItemId)) return;
    journeysByItemId.set(journey.inventoryItemId, journey);
  });

  const deduped = dedupeReplaceRepairAnalysesForPromotion(analyses);

  return deduped.map((analysis) => {
    const itemName = analysis.inventoryItem?.name || 'Inventory Item';
    const journey = journeysByItemId.get(analysis.inventoryItemId);
    let href: string;
    if (journey?.id) {
      const params = new URLSearchParams();
      params.set('journeyId', journey.id);
      if (journey.currentStepKey) params.set('stepKey', journey.currentStepKey);
      params.set('scopeCategory', 'ITEM');
      params.set('itemId', analysis.inventoryItemId);
      params.set('inventoryItemId', analysis.inventoryItemId);
      params.set('assetName', itemName);
      if (journey.issueType) params.set('issueType', journey.issueType);
      if (analysis.summary) params.set('customIssueLabel', analysis.summary);
      href = `/dashboard/properties/${propertyId}/tools/guidance-overview?${params.toString()}`;
    } else {
      href = `/dashboard/properties/${propertyId}/inventory/items/${analysis.inventoryItemId}/replace-repair`;
    }

    const favorsReplace = analysis.verdict === 'REPLACE_NOW' || analysis.verdict === 'REPLACE_SOON';
    const confidenceScore = analysis.confidence === 'HIGH' ? 0.9 : analysis.confidence === 'MEDIUM' ? 0.65 : 0.4;

    return adaptHomeActionSource('GUIDANCE', {
      id: `repair-replace:${analysis.id}`,
      propertyId,
      lineageId: `repair-replace:${analysis.inventoryItemId}`,
      sourceEntityId: analysis.id,
      sourceVersion: analysis.computedAt.toISOString(),
      state: 'OPEN',
      priority: analysis.verdict === 'REPLACE_NOW' ? 'SOON' : 'PLAN',
      signal: `Repair vs Replace: ${itemName}`,
      whyItMatters: analysis.summary || `Our AI has a recommendation for ${itemName}.`,
      recommendedAction: favorsReplace ? 'Consider replacing this item.' : 'Consider repairing this item.',
      expectedOutcome: 'A documented repair-or-replace decision for this item.',
      timing: { dueAt: null, windowStart: null, windowEnd: null, rationale: 'Advisory — not tied to a specific deadline.' },
      evidence: [{
        id: analysis.id,
        type: 'SYSTEM_DERIVATION',
        label: `Repair vs Replace: ${itemName}`,
        source: 'Lifespan Engine',
        observedAt: analysis.computedAt.toISOString(),
        freshness: 'CURRENT',
        confidence: confidenceScore,
      }],
      assumptions: [{
        key: 'verdict-computed-at',
        label: 'Verdict reflects the most recent computation',
        value: `Computed ${analysis.computedAt.toISOString()}`,
        source: 'SYSTEM_DEFAULT',
        editable: true,
      }],
      options: [
        { id: 'repair', label: 'Repair', summary: `Continue repairing ${itemName} as issues arise.`, recommended: !favorsReplace },
        { id: 'replace', label: 'Replace', summary: `Replace ${itemName} rather than continuing to repair it.`, recommended: favorsReplace },
      ],
      tradeoffs: [
        { optionId: 'repair', dimension: 'COST', summary: 'Lower upfront cost, but risk of recurring failures.' },
        { optionId: 'replace', dimension: 'COST', summary: 'Higher upfront cost, but resets the item\'s expected lifespan.' },
      ],
      confidence: { score: confidenceScore, label: analysis.confidence, missing: [] },
      governance: materialFinancialGovernance('resolution-center-parity-v1'),
      propertyContextFeature: {
        featureKey: 'REPAIR_REPLACE',
        operationKey: 'RUN_ANALYSIS',
        operationInput: { inventoryItemId: analysis.inventoryItemId },
      },
      primaryCta: { kind: 'COMPARE', label: 'Review Decision', href },
      secondaryCtas: [],
      feedbackControls: RECOMMENDATION_FEEDBACK,
      relatedJourneyId: journey?.id ?? null,
      createdAt: analysis.computedAt.toISOString(),
      lastEvaluatedAt: now.toISOString(),
    });
  });
}

async function loadPersonalizationActions(propertyId: string, db: HomeActionSourceDb): Promise<HomeAction[]> {
  const now = new Date();
  const recommendations = await db.personalizedRecommendation.findMany({
    where: {
      propertyId,
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      definition: {
        status: 'ACTIVE',
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
        ],
      },
    },
    orderBy: [{ score: 'desc' }, { lastEvaluatedAt: 'desc' }],
    take: 25,
    select: {
      id: true,
      status: true,
      score: true,
      priorityBand: true,
      confidence: true,
      ruleVersion: true,
      contentVersion: true,
      firstEligibleAt: true,
      lastEvaluatedAt: true,
      expiresAt: true,
      definition: {
        select: {
          code: true,
          category: true,
          status: true,
          safetyTier: true,
          governancePolicyVersion: true,
        },
      },
      evaluationRun: { select: { resultJson: true } },
      explanations: {
        orderBy: { version: 'desc' },
        take: 1,
        select: { headline: true, reasonCodes: true, evidenceJson: true },
      },
    },
  });

  return recommendations.flatMap((recommendation) => {
    if (recommendation.status !== 'ACTIVE' || recommendation.definition.status !== 'ACTIVE') return [];
    if (recommendation.expiresAt && recommendation.expiresAt <= now) return [];
    const reviewed = findPersonalizationDefinition(recommendation.definition.code);
    if (!reviewed || !reviewed.modules.includes('DASHBOARD')) return [];
    if (recommendation.definition.safetyTier !== reviewed.governance.safetyTier ||
      recommendation.definition.governancePolicyVersion !== reviewed.governance.policyVersion) return [];

    const explanation = recommendation.explanations[0];
    const confidence = normalizeHomeActionConfidenceScore(recommendation.confidence);
    const headline = explanation?.headline?.trim() || reviewed.headline;
    const summary = personalizationExplanation(explanation?.reasonCodes, reviewed.body);
    const contextVersion = contextVersionFromEvaluation(recommendation.evaluationRun?.resultJson) ??
      contextVersionFromEvaluation(explanation?.evidenceJson);
    // A Home recommendation without the Property Context version that produced
    // it cannot be proven current. Dedicated personalization surfaces may still
    // explain it, but the default Home feed fails closed.
    if (!contextVersion) return [];

    const governance = reviewed.governance;
    const decisionContract = personalizationDecisionContract(governance);
    const safety = governance.safetyTier === 'SAFETY_EMERGENCY';
    const priority: HomeAction['priority'] = safety
      ? 'NOW'
      : recommendation.priorityBand === 'HIGH'
        ? 'SOON'
        : recommendation.priorityBand === 'LOW'
          ? 'CONSIDER'
          : 'PLAN';
    const href = `/dashboard/personalization?propertyId=${encodeURIComponent(propertyId)}`;
    const sourceVersion = `${contextVersion.slice(0, 56)}:r${recommendation.ruleVersion}:c${recommendation.contentVersion}`;

    return [adaptHomeActionSource('PERSONALIZATION', {
      id: `personalization:${recommendation.id}`,
      propertyId,
      lineageId: `personalization:${recommendation.id}`,
      sourceEntityId: recommendation.id,
      sourceVersion,
      state: 'OPEN',
      priority,
      signal: headline,
      whyItMatters: summary,
      recommendedAction: safety ? `Review ${headline} now` : `Review ${headline}`,
      expectedOutcome: reviewed.body,
      timing: {
        dueAt: recommendation.expiresAt?.toISOString() ?? null,
        windowStart: recommendation.firstEligibleAt.toISOString(),
        windowEnd: recommendation.expiresAt?.toISOString() ?? null,
        rationale: recommendation.expiresAt
          ? 'This reviewed recommendation remains applicable until its recorded expiry or the Home Record changes.'
          : 'This reviewed recommendation remains applicable until the Home Record changes or the underlying rule no longer matches.',
      },
      evidence: [{
        id: recommendation.id,
        type: 'SYSTEM_DERIVATION',
        label: `Reviewed property-context evaluation for ${headline}`.slice(0, 240),
        source: `ContractToCozy reviewed personalization rule ${recommendation.definition.code}`,
        observedAt: recommendation.lastEvaluatedAt.toISOString(),
        freshness: 'CURRENT',
        confidence,
      }],
      ...decisionContract,
      confidence: {
        score: confidence,
        label: confidenceLabel(confidence),
        missing: confidence == null ? ['Personalization confidence'] : [],
      },
      governance,
      primaryCta: {
        kind: safety ? 'ESCALATE' : 'REVIEW',
        label: safety ? 'Review safety guidance' : 'Review recommendation',
        href,
      },
      secondaryCtas: [{
        kind: 'CORRECT_FACT',
        label: 'Correct home information',
        href: `/dashboard/properties/${propertyId}`,
      }],
      feedbackControls: safety
        ? ['COMPLETE', 'ALREADY_DONE', 'CORRECT_FACT']
        : DEFAULT_FEEDBACK,
      relatedJourneyId: null,
      createdAt: recommendation.firstEligibleAt.toISOString(),
      lastEvaluatedAt: recommendation.lastEvaluatedAt.toISOString(),
    })];
  });
}

async function loadProjectActions(propertyId: string, db: HomeActionSourceDb): Promise<HomeAction[]> {
  const projects = await db.projectRecord.findMany({
    where: { propertyId, status: { in: ['PLANNING', 'IN_PROGRESS', 'PAUSED', 'DISPUTED'] } },
    orderBy: { updatedAt: 'desc' }, take: 10,
    include: {
      milestones: { where: { status: { not: 'COMPLETE' } }, orderBy: { position: 'asc' }, take: 1 },
      issues: { where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'ESCALATED'] } }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  return projects.map((project) => {
    const milestone = project.milestones[0];
    const issue = project.issues[0];
    const governance = projectGovernance(project, issue);
    const isSafetyEmergency = governance.safetyTier === 'SAFETY_EMERGENCY';
    const primaryHref = project.renovationCaseId
      ? `/dashboard/properties/${propertyId}/renovations/${project.renovationCaseId}`
      : `/dashboard/properties/${propertyId}/projects/${project.id}`;
    return adaptHomeActionSource('PROJECT', {
      id: `project:${project.id}`, propertyId,
      lineageId: project.guidanceJourneyId ?? `project:${project.id}`, sourceEntityId: project.id,
      sourceVersion: project.updatedAt.toISOString(), job: 'MAJOR_MOMENT', state: project.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'OPEN',
      priority: isSafetyEmergency || project.status === 'DISPUTED' || issue?.status === 'ESCALATED' ? 'NOW' : project.status === 'PAUSED' || issue ? 'SOON' : 'PLAN',
      signal: issue ? `${project.name}: ${issue.description}` : `${project.name}: ${milestone?.name ?? 'review project status'}`,
      whyItMatters: issue?.description ?? project.description ?? 'The active project has an incomplete milestone or decision.',
      recommendedAction: issue ? 'Review the open project issue' : milestone?.name ?? 'Review project status',
      expectedOutcome: 'Advance the project with scope, schedule, cost, and evidence context preserved.',
      timing: { dueAt: project.expectedEndDate?.toISOString() ?? null, windowStart: project.startDate.toISOString(), windowEnd: project.expectedEndDate?.toISOString() ?? null, rationale: issue ? 'An open issue may block the next project milestone.' : 'This is the next incomplete milestone in an active project.' },
      evidence: [{ id: project.id, type: 'SYSTEM_DERIVATION', label: project.name, source: 'Project tracker', observedAt: project.updatedAt.toISOString(), freshness: 'CURRENT', confidence: 1 }],
      ...guidanceDecisionContract(governance),
      confidence: { score: 1, label: 'HIGH', missing: [] },
      governance,
      primaryCta: {
        kind: isSafetyEmergency ? 'ESCALATE' : 'REVIEW',
        label: isSafetyEmergency
          ? 'Review safety issue'
          : project.renovationCaseId
            ? 'Open renovation plan'
            : issue
              ? 'Review project issue'
              : 'Open project',
        href: primaryHref,
      },
      secondaryCtas: [], feedbackControls: RECOMMENDATION_FEEDBACK,
      relatedJourneyId: project.guidanceJourneyId ?? null,
      createdAt: project.createdAt.toISOString(), lastEvaluatedAt: project.updatedAt.toISOString(),
    });
  });
}

// Sale Readiness Value-Maximization Checklist plan §4.8/§10 Phase 4: only
// the self-reported and generic-fallback Tier 2 checklist items (§4.3) get
// promoted here — every other SaleReadinessItem source (inspection
// findings, permits, projects, records, material specs, timeline events,
// aging systems, lapsed maintenance, warranties, structural evidence,
// upgrade-evidence confirms, confirmed-upgrade highlights) already has its
// own real-world domain record and lifecycle elsewhere in the app (several
// already flow through Home Actions themselves via projectHomeActions).
// Promoting those too would double-track the same obligation under two
// different sources. propertySaleCase.service.ts's projectHomeActions
// filters obligationType 'SALE_PREP_TASK' back out of its own output so a
// promoted item here never re-surfaces in Sale Case as a second, duplicate
// HOME_ACTION-sourced item wrapping the very row that spawned it.
const SALE_PREP_PROMOTABLE_SOURCE_TYPES = ['SALE_PREP_SELF_REPORT', 'SALE_PREP_GENERIC'] as const;

async function loadSalePrepActions(propertyId: string, db: HomeActionSourceDb): Promise<HomeAction[]> {
  if (!db.propertySaleCase || !db.saleReadinessItem) return [];
  const saleCase = await db.propertySaleCase.findUnique({
    where: { propertyId },
    select: { id: true, status: true, targetListDate: true, targetCloseDate: true },
  });
  if (!saleCase) return [];
  if (saleCase.status === 'CLOSED' || saleCase.status === 'CANCELLED') return [];

  const items = await db.saleReadinessItem.findMany({
    where: {
      saleCaseId: saleCase.id,
      status: 'OPEN',
      sourceEntityType: { in: Array.from(SALE_PREP_PROMOTABLE_SOURCE_TYPES) as any },
    },
    select: {
      id: true,
      sourceEntityType: true,
      title: true,
      detail: true,
      category: true,
      status: true,
      dueAt: true,
      estimatedCostMinCents: true,
      estimatedCostMaxCents: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  const governance = lowConsequenceGovernance('sale-prep-v1');
  return items.map((item) => {
    const isSelfReported = item.sourceEntityType === 'SALE_PREP_SELF_REPORT';
    const confidence = isSelfReported ? 1 : 0.4;
    const stage = saleCase.status === 'PREPARING'
      ? {
          eyebrow: 'Selling this home',
          headlinePrefix: 'Before listing',
          reason: 'This property has an active sale plan',
          outcome: 'buyer confidence, disclosure readiness, or the target price',
          timing: 'Best completed before this home is listed for sale',
        }
      : saleCase.status === 'LISTED'
        ? {
            eyebrow: 'Home is listed',
            headlinePrefix: 'Address during listing',
            reason: 'This property is currently listed',
            outcome: 'buyer confidence, negotiations, or disclosure readiness',
            timing: 'Address while the listing is active and before an offer advances',
          }
        : {
            eyebrow: 'Home is under contract',
            headlinePrefix: 'Resolve before handoff or close',
            reason: 'This property is under contract',
            outcome: 'the buyer handoff, closing readiness, or final negotiations',
            timing: 'Resolve or document this before handoff or closing',
          };
    const targetDate = saleCase.status === 'PREPARING'
      ? saleCase.targetListDate
      : saleCase.targetCloseDate;
    const dateLabel = targetDate
      ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(targetDate)
      : null;
    const category = String(item.category).toLowerCase().replace(/_/g, ' ');
    const [rawSubject, ...assessmentParts] = item.title.split(':');
    const subject = rawSubject.trim() || item.title;
    const assessment = assessmentParts.join(':').trim();
    const actionVerb = /needs?|work|poor|not ready/i.test(assessment) ? 'improve' : 'review';
    const homeownerHeadline = `${stage.headlinePrefix}: ${actionVerb} ${subject.toLowerCase()}`;
    const personalSummary = isSelfReported
      ? `${stage.reason}. You marked ${subject.toLowerCase()} as “${assessment || 'needs review'}.” Addressing it can support ${stage.outcome}.`
      : `${stage.reason}. This ${category} item may affect ${stage.outcome}.`;
    const whyNow = item.detail
      ? `${personalSummary} General guidance: ${sentence(item.detail)}`
      : personalSummary;
    const catalogSourceMatch = item.detail?.match(/\((NAR|Zonda)[^)]+\)/i)?.[0]?.slice(1, -1) ?? null;
    const actionId = `sale-prep:${item.id}`;
    const focusParams = new URLSearchParams({
      focusItemId: item.id,
      sourceActionId: actionId,
      sourceEntityType: 'SALE_READINESS_ITEM',
      sourceEntityId: item.id,
      recommendationReason: `SALE_PREP_${saleCase.status}`,
      recommendationVersion: 'sale-prep-v2',
    });
    const costRange = item.estimatedCostMinCents != null && item.estimatedCostMaxCents != null
      ? item.estimatedCostMinCents === item.estimatedCostMaxCents
        ? formatHomeActionCurrency(item.estimatedCostMinCents / 100)
        : `${formatHomeActionCurrency(item.estimatedCostMinCents / 100)}–${formatHomeActionCurrency(item.estimatedCostMaxCents / 100)}`
      : null;
    return adaptHomeActionSource('SALE_PREP', {
      id: actionId,
      propertyId,
      lineageId: `sale-prep:${item.id}`,
      sourceEntityId: item.id,
      sourceVersion: item.updatedAt.toISOString(),
      job: 'MAJOR_MOMENT',
      state: 'OPEN',
      priority: 'CONSIDER',
      signal: item.title,
      whyItMatters: whyNow,
      recommendedAction: homeownerHeadline,
      expectedOutcome: `A documented decision that protects ${stage.outcome}.`,
      presentation: {
        variant: 'SALE_PREPARATION',
        eyebrow: stage.eyebrow,
        headline: homeownerHeadline.slice(0, 180),
        summary: personalSummary.slice(0, 320),
        whyNow: whyNow.slice(0, 500),
        keyFacts: [
          { label: 'Sale stage', value: String(saleCase.status).toLowerCase().replace(/_/g, ' ') },
          ...(dateLabel ? [{ label: saleCase.status === 'PREPARING' ? 'Target list date' : 'Target close date', value: dateLabel }] : []),
          { label: assessment ? 'Current assessment' : 'Item', value: (assessment || subject).slice(0, 240) },
          { label: 'Source', value: isSelfReported ? 'Your Sale Readiness answers' : 'General sale-prep guidance' },
          { label: 'Category', value: category },
          { label: 'Impact', value: stage.outcome.slice(0, 240) },
          ...(item.dueAt ? [{ label: 'Due', value: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(item.dueAt) }] : []),
          ...(costRange ? [{ label: 'Rough cost estimate', value: costRange }] : []),
        ],
        factGroups: [],
        subject: { kind: 'SALE_READINESS_ITEM', id: item.id, label: item.title.slice(0, 180) },
        detailLabel: 'Why this item?',
        group: null,
      },
      timing: {
        dueAt: item.dueAt?.toISOString() ?? targetDate?.toISOString() ?? null,
        windowStart: null,
        windowEnd: targetDate?.toISOString() ?? null,
        rationale: stage.timing,
      },
      evidence: [{
          id: item.id,
          type: 'SYSTEM_DERIVATION',
          label: assessment ? `${subject}: ${assessment}` : subject,
          source: isSelfReported ? 'Your Sale Readiness answers' : 'Sale Readiness Checklist',
          observedAt: item.updatedAt.toISOString(),
          freshness: 'CURRENT',
          confidence,
        },
        ...(catalogSourceMatch ? [{
          id: `${item.id}:industry-guidance`,
          type: 'SYSTEM_DERIVATION' as const,
          label: 'General sale-preparation benchmark',
          source: catalogSourceMatch,
          observedAt: item.updatedAt.toISOString(),
          freshness: 'CURRENT' as const,
          confidence: 0.8,
        }] : []),
      ],
      ...guidanceDecisionContract(governance),
      confidence: {
        score: confidence,
        label: confidenceLabel(confidence),
        missing: isSelfReported ? [] : ['Verified condition assessment'],
      },
      governance,
      primaryCta: {
        kind: 'REVIEW',
        label: 'Review sale-prep item',
        href: `/dashboard/properties/${propertyId}/tools/sale-case?${focusParams.toString()}`,
      },
      secondaryCtas: [],
      feedbackControls: RECOMMENDATION_FEEDBACK,
      relatedJourneyId: null,
      createdAt: item.createdAt.toISOString(),
      lastEvaluatedAt: item.updatedAt.toISOString(),
    });
  });
}

function refinanceMissingFieldLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const labels: Record<string, string> = {
    currentMortgageBalance: 'current mortgage balance',
    interestRate: 'current interest rate',
    remainingTerm: 'remaining mortgage term',
  };
  return value
    .filter((field): field is string => typeof field === 'string')
    .map((field) => labels[field])
    .filter((label): label is string => Boolean(label));
}

async function loadRefinanceDataRequiredActions(
  propertyId: string,
  db: HomeActionSourceDb,
): Promise<HomeAction[]> {
  if (!db.domainEvent || !db.propertyFinancingProfile) return [];
  const [event, profile] = await Promise.all([
    db.domainEvent.findFirst({
      where: {
        propertyId,
        type: 'REFINANCE_DATA_REQUIRED',
        status: { not: 'DEAD_LETTER' },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        payload: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.propertyFinancingProfile.findUnique({
      where: { propertyId },
      select: {
        mortgageStatus: true,
        currentMortgageBalanceCents: true,
        interestRateBps: true,
        remainingTermMonths: true,
      },
    }),
  ]);
  if (
    !event ||
    profile?.mortgageStatus === 'NO_MORTGAGE' ||
    (
      profile?.currentMortgageBalanceCents != null &&
      profile.interestRateBps != null &&
      profile.remainingTermMonths != null
    )
  ) {
    return [];
  }

  const payload =
    event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
      ? event.payload as Record<string, unknown>
      : {};
  const missing = refinanceMissingFieldLabels(payload.missingFields);
  const decline = typeof payload.rateDeclinePct === 'number'
    ? payload.rateDeclinePct
    : null;
  const missingSummary = missing.length > 0
    ? missing.join(', ')
    : 'the remaining mortgage details';

  return [adaptHomeActionSource('SYSTEM', {
    id: `refinance-data-required:${propertyId}`,
    propertyId,
    lineageId: `refinance-data-required:${propertyId}`,
    sourceEntityId: event.id,
    sourceVersion: event.updatedAt.toISOString(),
    job: 'DECIDE',
    state: 'OPEN',
    priority: 'CONSIDER',
    signal: decline == null
      ? 'Mortgage rates moved lower while refinance inputs are incomplete.'
      : `Mortgage rates moved ${decline.toFixed(2)} percentage points lower while refinance inputs are incomplete.`,
    whyItMatters:
      `Add ${missingSummary} to check whether current market conditions could reduce your mortgage cost. Known Financing details will be reused.`,
    recommendedAction: 'Complete the mortgage details needed for refinance monitoring',
    expectedOutcome:
      'ContractToCozy can evaluate this property after future rate updates without asking for the same facts again.',
    timing: {
      dueAt: null,
      windowStart: event.createdAt.toISOString(),
      windowEnd: null,
      rationale: 'This is a low-urgency setup action triggered by a meaningful market-rate decline.',
    },
    evidence: [{
      id: event.id,
      type: 'SYSTEM_DERIVATION',
      label: 'Meaningful mortgage-rate decline',
      source: 'Mortgage Refinance Radar',
      observedAt: event.createdAt.toISOString(),
      freshness: 'CURRENT',
      confidence: 1,
    }],
    assumptions: [],
    options: [],
    tradeoffs: [],
    confidence: {
      score: 1,
      label: 'HIGH',
      missing,
    },
    governance: lowConsequenceGovernance('refinance-data-required-v1'),
    primaryCta: {
      kind: 'CORRECT_FACT',
      label: 'Add mortgage details',
      href: `/dashboard/properties/${propertyId}/tools/mortgage-refinance-radar`,
    },
    secondaryCtas: [{
      kind: 'CORRECT_FACT',
      label: 'Review Financing profile',
      href: `/dashboard/properties/${propertyId}/tools/financing/profile`,
    }],
    feedbackControls: [
      'SNOOZE',
      'DISMISS',
      'NOT_RELEVANT',
      'NO_MORTGAGE',
      'CORRECT_FACT',
    ],
    relatedJourneyId: null,
    createdAt: event.createdAt.toISOString(),
    lastEvaluatedAt: event.updatedAt.toISOString(),
  })];
}

function refinanceConfidence(level: 'WEAK' | 'GOOD' | 'STRONG'): {
  score: number;
  label: HomeAction['confidence']['label'];
} {
  if (level === 'STRONG') return { score: 0.9, label: 'HIGH' };
  if (level === 'GOOD') return { score: 0.75, label: 'MEDIUM' };
  return { score: 0.55, label: 'MEDIUM' };
}

function refinanceActionWindowId(propertyId: string, openedAt: Date): string {
  return `refinance-opportunity:${propertyId}:${openedAt.getTime()}`;
}

/**
 * Promote only the current OPEN refinance window. The opening timestamp makes
 * the action stable across material updates while allowing a genuinely new
 * window to return after a prior CLOSED transition.
 */
export async function loadRefinanceOpportunityActions(
  propertyId: string,
  db: HomeActionSourceDb,
  evaluatedAt = new Date(),
): Promise<HomeAction[]> {
  if (!db.propertyRefinanceRadarState || !db.propertyFinancingProfile) return [];
  const [state, profile, decision] = await Promise.all([
    db.propertyRefinanceRadarState.findUnique({
      where: { propertyId },
      select: {
        id: true,
        radarState: true,
        lastOpenedAt: true,
        lastEvaluatedAt: true,
        updatedAt: true,
        lastRateSnapshot: {
          select: { date: true, source: true },
        },
        currentOpportunity: {
          select: {
            id: true,
            monthlySavings: true,
            breakEvenMonths: true,
            lifetimeSavings: true,
            marketRate: true,
            currentRate: true,
            confidenceLevel: true,
            evaluationDate: true,
            updatedAt: true,
          },
        },
      },
    }),
    db.propertyFinancingProfile.findUnique({
      where: { propertyId },
      select: {
        mortgageStatus: true,
        currentMortgageBalanceCents: true,
        interestRateBps: true,
        remainingTermMonths: true,
        mortgageBalanceAsOfDate: true,
      },
    }),
    db.refinanceDecision?.findFirst({
      where: { propertyId, currentKey: propertyId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        status: true,
        radarOpportunityId: true,
        nextReviewAt: true,
        version: true,
        updatedAt: true,
      },
    }) ?? null,
  ]);
  const completeMortgage =
    profile &&
    profile.mortgageStatus !== 'NO_MORTGAGE' &&
    profile.currentMortgageBalanceCents != null &&
    profile.interestRateBps != null &&
    profile.remainingTermMonths != null;
  const freshness = buildRefinanceFreshness({
    mortgageDataAsOf: profile?.mortgageBalanceAsOfDate?.toISOString() ?? null,
    marketDataAsOf: state?.lastRateSnapshot?.date?.toISOString() ?? null,
    marketDataSource: state?.lastRateSnapshot?.source ?? null,
  }, evaluatedAt);
  if (
    !state ||
    !completeMortgage ||
    freshness.alertReadiness !== 'READY' ||
    state.radarState !== 'OPEN' ||
    !state.lastOpenedAt ||
    !state.currentOpportunity
  ) {
    return [];
  }

  const opportunity = state.currentOpportunity;
  const appliesToCurrentWindow = decision?.radarOpportunityId === opportunity.id;
  const deferredReviewDue = Boolean(
    appliesToCurrentWindow &&
    decision?.status === 'DEFERRED' &&
    decision.nextReviewAt &&
    decision.nextReviewAt <= evaluatedAt,
  );
  if (
    appliesToCurrentWindow &&
    decision?.status !== 'EXPLORING' &&
    !deferredReviewDue
  ) {
    return [];
  }
  const monthlySavings = Number(opportunity.monthlySavings);
  const lifetimeSavings = Number(opportunity.lifetimeSavings);
  const confidence = refinanceConfidence(opportunity.confidenceLevel);
  const actionId = deferredReviewDue && decision?.nextReviewAt
    ? `refinance-decision-review:${decision.id}:${decision.nextReviewAt.getTime()}`
    : refinanceActionWindowId(propertyId, state.lastOpenedAt);
  const breakEven = opportunity.breakEvenMonths > 0
    ? `${opportunity.breakEvenMonths} months`
    : 'not yet established';

  return [adaptHomeActionSource('SYSTEM', {
    id: actionId,
    propertyId,
    lineageId: `refinance-opportunity:${propertyId}`,
    sourceEntityId: deferredReviewDue && decision ? decision.id : state.id,
    sourceVersion: (deferredReviewDue && decision ? decision.updatedAt : state.updatedAt).toISOString(),
    job: 'DECIDE',
    state: 'OPEN',
    priority: 'CONSIDER',
    signal: deferredReviewDue
      ? 'Your planned refinance review date has arrived while this opportunity remains open.'
      : `A refinance comparison may be worthwhile at the current national benchmark rate of ${opportunity.marketRate.toFixed(3)}%.`,
    whyItMatters:
      `The current estimate is about $${Math.round(monthlySavings).toLocaleString()} per month in savings, with break-even ${breakEven}. Actual lender pricing, eligibility, fees, and timing may differ.`,
    recommendedAction: deferredReviewDue
      ? 'Revisit your deferred refinance decision'
      : 'Review this refinance opportunity',
    expectedOutcome:
      'Understand the estimated benefit, assumptions, and alternatives before deciding whether to compare official lender offers.',
    timing: {
      dueAt: deferredReviewDue && decision?.nextReviewAt
        ? decision.nextReviewAt.toISOString()
        : null,
      windowStart: state.lastOpenedAt.toISOString(),
      windowEnd: null,
      rationale: deferredReviewDue
        ? 'You chose this date to revisit the decision; the original opportunity is still OPEN.'
        : 'This action remains current only while the property-specific refinance window is OPEN.',
    },
    evidence: [{
      id: opportunity.id,
      type: 'SYSTEM_DERIVATION',
      label: 'Current property-specific refinance evaluation',
      source: 'Mortgage Refinance Radar using a national mortgage-rate benchmark',
      observedAt: opportunity.evaluationDate.toISOString(),
      freshness: 'CURRENT',
      confidence: confidence.score,
    }],
    assumptions: [{
      key: 'benchmark_not_offer',
      label: 'Benchmark rate is not a lender offer',
      value:
        `The estimate compares the recorded ${opportunity.currentRate.toFixed(3)}% mortgage rate with a ${opportunity.marketRate.toFixed(3)}% national benchmark and modeled costs.`,
      source: 'SYSTEM_DEFAULT',
      editable: true,
    }],
    options: [
      {
        id: 'review_refinance',
        label: 'Explore refinance options',
        summary: 'Review scenarios and compare official Loan Estimates before choosing a lender or loan.',
        recommended: true,
      },
      {
        id: 'keep_current_loan',
        label: 'Keep the current mortgage',
        summary: 'Continue the current loan and let monitoring check for a later opportunity.',
        recommended: false,
      },
      {
        id: 'decide_later',
        label: 'Decide later',
        summary: 'Defer this comparison while preserving passive monitoring.',
        recommended: false,
      },
    ],
    tradeoffs: [
      {
        optionId: 'review_refinance',
        dimension: 'COST',
        summary:
          `Modeled lifetime savings are about $${Math.round(lifetimeSavings).toLocaleString()}, but closing costs and lender-specific terms can change the result.`,
      },
      {
        optionId: 'keep_current_loan',
        dimension: 'EFFORT',
        summary: 'Avoids application and closing effort but does not capture the modeled payment change.',
      },
    ],
    confidence: {
      ...confidence,
      missing: [],
    },
    governance: materialFinancialGovernance('mortgage-refinance-radar-v2'),
    primaryCta: {
      kind: 'REVIEW',
      label: deferredReviewDue ? 'Revisit decision' : 'Review opportunity',
      href: `/dashboard/properties/${propertyId}/tools/mortgage-refinance-radar`,
    },
    secondaryCtas: [{
      kind: 'CORRECT_FACT',
      label: 'Review mortgage details',
      href: `/dashboard/properties/${propertyId}/tools/financing/profile`,
    }],
    feedbackControls: [
      'DEFER',
      'SNOOZE',
      'DISMISS',
      'NOT_RELEVANT',
      'CORRECT_FACT',
    ],
    relatedJourneyId: null,
    createdAt: state.lastOpenedAt.toISOString(),
    lastEvaluatedAt: (state.lastEvaluatedAt ?? opportunity.updatedAt).toISOString(),
  })];
}

function ownershipChangeEvidence(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

export async function loadOwnershipCostChangeActions(
  propertyId: string,
  db: HomeActionSourceDb,
): Promise<HomeAction[]> {
  if (!db.ownershipCostChange || !db.ownershipCostSnapshot) return [];
  const [latestSnapshot, decisionRows] = await Promise.all([
    db.ownershipCostSnapshot.findFirst({
      where: { propertyId },
      orderBy: [{ basePeriodEnd: 'desc' }, { computedAt: 'desc' }],
      select: { id: true },
    }),
    db.ownershipCostDecision?.findMany({
      where: {
        propertyId,
        decisionType: 'CATEGORY_ACTION',
        status: { not: 'SUPERSEDED' },
      },
      select: { sourceActionId: true, payloadJson: true },
    }) ?? Promise.resolve([]),
  ]);
  if (!latestSnapshot) return [];
  const changes = await db.ownershipCostChange.findMany({
    where: { propertyId, toSnapshotId: latestSnapshot.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 12,
    select: {
      id: true,
      category: true,
      amountDeltaCents: true,
      recurringDeltaCents: true,
      changeReason: true,
      explanationStatus: true,
      evidenceJson: true,
      createdAt: true,
      toSnapshotId: true,
    },
  });

  return changes.flatMap((change) => {
    const actionId = `ownership-cost-change:${change.id}`;
    const currentDecision = decisionRows.find(
      (decision) => decision.sourceActionId === actionId,
    );
    const decisionPayload = ownershipChangeEvidence(currentDecision?.payloadJson);
    const lifecycleState = decisionPayload.lifecycleState;
    const revisitAt = typeof decisionPayload.revisitAt === 'string'
      ? new Date(decisionPayload.revisitAt)
      : null;
    if (
      ['DISMISSED', 'NO_ACTION', 'RESOLVED'].includes(String(lifecycleState)) ||
      (
        lifecycleState === 'SNOOZED' &&
        revisitAt &&
        !Number.isNaN(revisitAt.getTime()) &&
        revisitAt > new Date()
      )
    ) {
      return [];
    }
    const detail = ownershipChangeEvidence(change.evidenceJson);
    if (detail.materiality?.material !== true) return [];
    const evidence = Array.isArray(detail.evidence) ? detail.evidence : [];
    const confidence = detail.confidence === 'HIGH'
      ? 0.9
      : detail.confidence === 'MEDIUM'
        ? 0.7
        : 0.45;
    const delta = change.amountDeltaCents / 100;
    const direction = delta >= 0 ? 'increased' : 'decreased';
    const amount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(Math.abs(delta));
    const categoryLabel = String(change.category)
      .toLowerCase()
      .replace(/_/g, ' ');
    const correction = detail.action && typeof detail.action === 'object'
      ? detail.action as { href?: unknown; label?: unknown }
      : {};
    const correctionHref = typeof correction.href === 'string'
      ? correction.href
      : `/dashboard/properties/${propertyId}/ownership-costs?view=changes`;
    const correctionLabel = typeof correction.label === 'string'
      ? correction.label
      : 'Review source evidence';
    const explanation = typeof detail.explanation === 'string'
      ? detail.explanation
      : `${categoryLabel} ${direction} by ${amount}.`;
    const observedAt = evidence[0]?.periodEnd;
    const sourceLabel = evidence[0]?.sourceDomain
      ? String(evidence[0].sourceDomain).toLowerCase().replace(/_/g, ' ')
      : 'Ownership Cost Intelligence';
    const destination = resolveOwnershipCostCategoryAction(
      propertyId,
      change.category,
    );

    return [adaptHomeActionSource('SYSTEM', {
      id: actionId,
      propertyId,
      lineageId: `ownership-cost-change:${propertyId}:${change.category}`,
      sourceEntityId: change.id,
      sourceVersion: change.toSnapshotId,
      job: 'STAY_AHEAD',
      state: 'OPEN',
      priority: Math.abs(change.amountDeltaCents) >= 100_000 ? 'SOON' : 'PLAN',
      signal: `${categoryLabel} ${direction} by ${amount} per year.`,
      whyItMatters: explanation,
      recommendedAction: `${destination.label} after reviewing the observed change`,
      expectedOutcome:
        'Confirm whether the current household plan should change or whether the source record needs correction.',
      timing: {
        dueAt: null,
        windowStart: detail.currentPeriod?.start ?? null,
        windowEnd: detail.currentPeriod?.end ?? null,
        rationale:
          'This action remains current while the latest comparable snapshot contains a material observed change.',
      },
      evidence: [{
        id: evidence[0]?.observationId ?? change.id,
        type: evidence[0]?.sourceDocumentId ? 'DOCUMENT' : 'SYSTEM_DERIVATION',
        label: `${categoryLabel} comparable-period evidence`,
        source: sourceLabel,
        observedAt: typeof observedAt === 'string' ? observedAt : change.createdAt.toISOString(),
        freshness: 'CURRENT',
        confidence,
      }],
      assumptions: [{
        key: 'observed_change_attribution',
        label: 'Reason attribution is evidence-limited',
        value: change.explanationStatus === 'UNEXPLAINED'
          ? 'The amount changed, but the available records do not establish why.'
          : `The recorded reason is ${String(change.changeReason).toLowerCase().replace(/_/g, ' ')}.`,
        source: change.explanationStatus === 'UNEXPLAINED'
          ? 'UNKNOWN'
          : 'PROPERTY_FACT',
        editable: false,
      }],
      options: [
        {
          id: 'review-change',
          label: 'Review the change',
          summary: 'Inspect the two observed periods and correct a source record if needed.',
          recommended: true,
        },
        {
          id: 'keep-current-plan',
          label: 'Keep the current plan',
          summary: 'Dismiss or defer this action if the observed change does not require a household response.',
          recommended: false,
        },
      ],
      tradeoffs: [{
        optionId: 'review-change',
        dimension: 'EFFORT',
        summary: 'Reviewing evidence takes time but reduces the risk of acting on an incorrect or incomplete source record.',
      }],
      confidence: {
        score: confidence,
        label: detail.confidence === 'HIGH'
          ? 'HIGH'
          : detail.confidence === 'MEDIUM'
            ? 'MEDIUM'
            : 'LOW',
        missing: change.explanationStatus === 'UNEXPLAINED'
          ? ['Supported change reason']
          : [],
      },
      governance: materialFinancialGovernance('ownership-cost-change-v1'),
      primaryCta: {
        kind: 'REVIEW',
        label: destination.label,
        href: destination.href,
      },
      secondaryCtas: [
        {
          kind: 'REVIEW',
          label: 'Review ownership-cost evidence',
          href: `/dashboard/properties/${propertyId}/ownership-costs?view=changes`,
        },
        {
          kind: 'CORRECT_FACT',
          label: correctionLabel,
          href: correctionHref,
        },
      ],
      feedbackControls: DEFAULT_FEEDBACK,
      relatedJourneyId: null,
      createdAt: change.createdAt.toISOString(),
      lastEvaluatedAt: change.createdAt.toISOString(),
    })];
  });
}

// ---------------------------------------------------------------------------
// Home Digital Twin (Slice 3: contextual Home Actions for missing facts and
// material planning windows). Both loaders only surface what the twin and
// capital timeline already computed — neither recomputes anything here.
// ---------------------------------------------------------------------------

function humanizeFactKey(value: unknown): string {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function homeownerFactLabel(fieldName: string): string {
  if (/useful.?life|lifespan/i.test(fieldName)) return 'expected lifespan';
  if (/condition.?score/i.test(fieldName)) return 'condition';
  if (/annual.?operating.?cost/i.test(fieldName)) return 'estimated annual operating cost';
  if (/confidence.?score/i.test(fieldName)) return 'confidence';
  return humanizeFactKey(fieldName);
}

function homeownerComponentLabel(label: string): string {
  if (/^hvac(?:\s+system)?$/i.test(label.trim())) return 'HVAC system';
  return label.trim();
}

function affectedDecisionForFact(fieldName: string): string {
  if (/install|age|life|condition|failure/i.test(fieldName)) return 'replacement timing';
  if (/cost|price|value|energy|operating|maintenance/i.test(fieldName)) return 'how much to set aside';
  if (/warranty|insurance|coverage/i.test(fieldName)) return 'coverage decisions';
  return 'future home planning';
}

function joinNatural(values: string[]): string {
  if (values.length < 2) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function scoreLabel(value: number, kind: 'condition' | 'confidence'): string {
  if (kind === 'condition') {
    if (value >= 0.75) return 'Good';
    if (value >= 0.4) return 'Fair';
    return 'Needs attention';
  }
  if (value >= 0.8) return 'High confidence';
  if (value >= 0.5) return 'Medium confidence';
  return 'Low confidence';
}

function projectedFactValue(fact: {
  fieldName: string;
  valueText: string | null;
  valueNumeric: number | null;
  unit: string | null;
  factState: string;
}): string {
  if (fact.valueText?.trim()) return fact.valueText.trim();
  if (fact.valueNumeric != null) {
    const unit = String(fact.unit ?? '').toUpperCase();
    if (unit === 'USD_PER_YEAR') {
      return `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(fact.valueNumeric)}/year`;
    }
    if (/condition.?score/i.test(fact.fieldName)) {
      return `${scoreLabel(fact.valueNumeric, 'condition')} · ${Math.round(fact.valueNumeric * 100)}%`;
    }
    if (/confidence.?score/i.test(fact.fieldName)) {
      return `${scoreLabel(fact.valueNumeric, 'confidence')} · ${Math.round(fact.valueNumeric * 100)}%`;
    }
    if (unit === 'YEARS') return `${fact.valueNumeric} years`;
    if (unit === 'RATIO') return `${Math.round(fact.valueNumeric * 100)}%`;
    return `${fact.valueNumeric}${fact.unit ? ` ${humanizeFactKey(fact.unit)}` : ''}`;
  }
  return fact.factState === 'CONFLICTED' ? 'Conflicting records' : 'Needs confirmation';
}

function homeownerFactSource(sourceRecordType: string | null, sourceType: string): string {
  const source = sourceRecordType ?? sourceType;
  if (/system|default|derived|inferred/i.test(source)) return 'Home Record estimate';
  return String(source).toLowerCase().replace(/[_-]+/g, ' ');
}

async function loadHomeDigitalTwinFactReviewActions(
  propertyId: string,
  db: HomeActionSourceDb,
): Promise<HomeAction[]> {
  if (!db.homeDigitalTwin || !db.homeTwinComponent) return [];

  const twin = await db.homeDigitalTwin.findUnique({
    where: { propertyId },
    select: { id: true, updatedAt: true },
  });
  if (!twin) return [];

  const components = await db.homeTwinComponent.findMany({
    where: { digitalTwinId: twin.id, lifecycleState: 'ACTIVE' },
    select: {
      id: true,
      label: true,
      componentType: true,
      projectedFacts: {
        where: { factState: { in: ['INFERRED', 'CONFLICTED', 'DEFAULT', 'UNKNOWN'] } },
        select: {
          id: true,
          fieldName: true,
          valueText: true,
          valueNumeric: true,
          unit: true,
          factState: true,
          sourceType: true,
          sourceRecordType: true,
          observedAt: true,
          confidenceScore: true,
          correctionDestination: true,
        },
      },
    },
  });

  const needsAttention = components.flatMap((component) => component.projectedFacts.map((fact) => ({
    ...fact,
    componentId: component.id,
    componentLabel: component.label ?? String(component.componentType).toLowerCase().replace(/_/g, ' '),
  })));
  if (needsAttention.length === 0) return [];

  // Home only promotes facts that have a real field-level correction route.
  // Facts without one remain visible inside the Digital Twin rather than
  // sending the homeowner to a generic property page that cannot fix them.
  const correctableFacts = needsAttention.filter((fact) => Boolean(fact.correctionDestination?.trim()));
  if (correctableFacts.length === 0) return [];

  const conflictCount = correctableFacts.filter((f) => f.factState === 'CONFLICTED').length;
  const displayedFacts = correctableFacts.slice(0, 4);
  const componentLabels = [...new Set(displayedFacts.map((fact) => homeownerComponentLabel(fact.componentLabel)))];
  const factLabels = [...new Set(displayedFacts.map((fact) => homeownerFactLabel(fact.fieldName)))];
  const headlineFacts = componentLabels.length === 1
    ? `your ${componentLabels[0]}'s ${joinNatural(factLabels.slice(0, 2))}`
    : joinNatural(displayedFacts.slice(0, 2).map((fact) => `${homeownerComponentLabel(fact.componentLabel)} ${homeownerFactLabel(fact.fieldName)}`));
  const affectedDecisions = [...new Set(displayedFacts.map((fact) => affectedDecisionForFact(fact.fieldName)))];
  const reason = conflictCount > 0
    ? `Some Home Record details conflict. Confirming them will improve ${joinNatural(affectedDecisions)}.`
    : `These Home Record estimates affect ${joinNatural(affectedDecisions)}. Confirm them when convenient for more accurate guidance.`;
  const correctionHref = displayedFacts[0].correctionDestination!;

  return [adaptHomeActionSource('SYSTEM', {
    id: `home-digital-twin-fact-review:${propertyId}`,
    propertyId,
    lineageId: `home-digital-twin-fact-review:${propertyId}`,
    sourceEntityId: twin.id,
    sourceVersion: twin.updatedAt.toISOString(),
    job: 'STAY_AHEAD',
    state: 'OPEN',
    priority: conflictCount > 0 ? 'SOON' : 'CONSIDER',
    signal: conflictCount > 0
      ? `${conflictCount} home fact${conflictCount === 1 ? '' : 's'} have conflicting records on file.`
      : `${correctableFacts.length} home fact${correctableFacts.length === 1 ? '' : 's'} should be added or verified at its source.`,
    whyItMatters: reason,
    recommendedAction: `Confirm ${headlineFacts}`,
    expectedOutcome: `Recorded facts can replace inferred values and improve the ${affectedDecisions.join(' and ')}.`,
    presentation: {
      variant: 'HOME_FACT_REVIEW',
      eyebrow: 'Home facts',
      headline: `Confirm ${headlineFacts}`.slice(0, 180),
      summary: reason.slice(0, 320),
      whyNow: reason.slice(0, 500),
      keyFacts: displayedFacts.map((fact) => ({
        label: `${homeownerComponentLabel(fact.componentLabel)} · ${homeownerFactLabel(fact.fieldName)}`.slice(0, 80),
        value: `${projectedFactValue(fact)}${['INFERRED', 'DEFAULT'].includes(fact.factState) ? ' · estimated' : ''}`.slice(0, 240),
      })),
      factGroups: [],
      subject: { kind: 'PROPERTY', id: propertyId, label: headlineFacts.slice(0, 180) },
      detailLabel: 'How this affects plans',
      group: correctableFacts.length > 1
        ? { kind: 'RELATED_ACTIONS', itemCount: Math.min(correctableFacts.length, 50) }
        : null,
    },
    timing: {
      dueAt: null,
      windowStart: null,
      windowEnd: null,
      rationale: 'Low urgency — review whenever convenient.',
    },
    evidence: displayedFacts.map((fact, index) => ({
      id: fact.id ?? `${twin.id}:projected-fact:${index}`,
      type: 'SYSTEM_DERIVATION',
      label: `${homeownerComponentLabel(fact.componentLabel)} ${homeownerFactLabel(fact.fieldName)}`,
      source: homeownerFactSource(fact.sourceRecordType, fact.sourceType),
      observedAt: fact.observedAt?.toISOString() ?? twin.updatedAt.toISOString(),
      freshness: 'CURRENT',
      confidence: normalizeHomeActionConfidenceScore(fact.confidenceScore),
    })),
    assumptions: [],
    options: [],
    tradeoffs: [],
    confidence: { score: 1, label: 'HIGH', missing: [] },
    governance: lowConsequenceGovernance('home-digital-twin-fact-review-v1'),
    primaryCta: {
      kind: 'CORRECT_FACT',
      label: 'Review home facts',
      href: correctionHref,
    },
    secondaryCtas: displayedFacts.slice(1).map((fact) => ({
      kind: 'CORRECT_FACT' as const,
      label: `Review ${homeownerComponentLabel(fact.componentLabel)} ${homeownerFactLabel(fact.fieldName)}`.slice(0, 120),
      href: fact.correctionDestination!,
    })),
    feedbackControls: ['DISMISS', 'SNOOZE', 'NOT_RELEVANT', 'CORRECT_FACT'],
    relatedJourneyId: null,
    createdAt: twin.updatedAt.toISOString(),
    lastEvaluatedAt: twin.updatedAt.toISOString(),
  })];
}

const CAPITAL_TIMELINE_CATEGORY_LABEL: Record<string, string> = {
  ROOF: 'Roof', HVAC: 'HVAC', WATER_HEATER: 'Water heater', APPLIANCE: 'Appliance',
  PLUMBING: 'Plumbing', ELECTRICAL: 'Electrical', EXTERIOR: 'Exterior', FOUNDATION: 'Foundation', OTHER: 'System',
};

const CAPITAL_TIMELINE_CONFIDENCE_SCORE: Record<string, number> = { HIGH: 0.85, MEDIUM: 0.6, LOW: 0.35 };
const CAPITAL_TIMELINE_TYPICAL_LIFESPAN_YEARS: Record<string, number> = {
  ROOF: 25, HVAC: 15, WATER_HEATER: 12, APPLIANCE: 12,
  PLUMBING: 30, ELECTRICAL: 30, EXTERIOR: 20, FOUNDATION: 50, OTHER: 15,
};

function capitalWindowLabel(start: Date, end: Date): string {
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  return startYear === endYear ? String(startYear) : `${startYear}–${endYear}`;
}

function homeownerConditionLabel(value: string | undefined): string | null {
  if (!value || value === 'UNKNOWN') return null;
  return `${value.charAt(0)}${value.slice(1).toLowerCase()}`;
}

function capitalFactDate(value: Date): string {
  return value.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function capitalFactAge(value: Date, asOf: Date): number {
  return Math.max(0, Math.floor((asOf.getTime() - value.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
}

function capitalContextVersion(inputsSnapshot: unknown): string | null {
  if (!inputsSnapshot || typeof inputsSnapshot !== 'object' || Array.isArray(inputsSnapshot)) return null;
  const value = (inputsSnapshot as { _propertyContextVersion?: unknown })._propertyContextVersion;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function loadHomeCapitalTimelineMaterialWindowActions(
  propertyId: string,
  db: HomeActionSourceDb,
): Promise<HomeAction[]> {
  if (!db.homeCapitalTimelineAnalysis) return [];

  const analysis = await db.homeCapitalTimelineAnalysis.findFirst({
    where: { propertyId, status: 'READY' },
    orderBy: { computedAt: 'desc' },
    select: {
      id: true,
      computedAt: true,
      inputsSnapshot: true,
      items: {
        where: { priority: 'HIGH' },
        orderBy: { windowStart: 'asc' },
        take: 3,
        select: {
          id: true, category: true, windowStart: true, windowEnd: true,
          estimatedCostMinCents: true, estimatedCostMaxCents: true, confidence: true, why: true,
          inventoryItemId: true,
          inventoryItem: {
            select: {
              name: true,
              condition: true,
              installedOn: true,
              purchasedOn: true,
              lastServicedOn: true,
              isVerified: true,
              updatedAt: true,
              warranty: { select: { id: true, providerName: true, expiryDate: true, updatedAt: true } },
              linkedWarranties: {
                select: { id: true, providerName: true, expiryDate: true, updatedAt: true },
                orderBy: { expiryDate: 'desc' },
                take: 1,
              },
              insurancePolicy: {
                select: { id: true, carrierName: true, expiryDate: true, isVerified: true, lastVerifiedAt: true, updatedAt: true },
              },
              homeEvents: {
                where: {
                  isCurrent: true,
                  deletedAt: null,
                  type: { in: ['REPAIR', 'MAINTENANCE', 'VERIFIED_RESOLUTION'] },
                },
                select: { id: true, type: true, occurredAt: true, verificationStatus: true },
                orderBy: { occurredAt: 'desc' },
                take: 20,
              },
            },
          },
        },
      },
    },
  });
  if (!analysis || analysis.items.length === 0) return [];

  const contextVersion = capitalContextVersion(analysis.inputsSnapshot);

  // A capital recommendation belongs to one physical asset. Similar timing may
  // inform the destination's portfolio view, but must not erase item identity
  // or turn several distinct homeowner decisions into one homepage card.
  return analysis.items.map((item) => {
    const record = item.inventoryItem;
    const label = (record?.name ?? CAPITAL_TIMELINE_CATEGORY_LABEL[item.category] ?? 'Home system').slice(0, 160).trim() || 'Home system';
    const subjectId = item.inventoryItemId ?? item.id;
    const costRange = item.estimatedCostMinCents != null && item.estimatedCostMaxCents != null
      ? `$${Math.round(item.estimatedCostMinCents / 100).toLocaleString()}–$${Math.round(item.estimatedCostMaxCents / 100).toLocaleString()}`
      : null;
    const windowLabel = capitalWindowLabel(item.windowStart, item.windowEnd);
    const confidenceScore = CAPITAL_TIMELINE_CONFIDENCE_SCORE[item.confidence] ?? 0.5;
    const confidenceLabel = confidenceScore >= 0.8 ? 'HIGH' : confidenceScore >= 0.5 ? 'MEDIUM' : 'LOW';
    const condition = homeownerConditionLabel(record?.condition);
    const knownSince = record?.installedOn ?? record?.purchasedOn ?? null;
    const ageYears = knownSince ? capitalFactAge(knownSince, analysis.computedAt) : null;
    const typicalLifespan = CAPITAL_TIMELINE_TYPICAL_LIFESPAN_YEARS[item.category];
    const latestServiceEvent = record?.homeEvents?.find((event) => event.type === 'MAINTENANCE');
    const lastServiceDate = record?.lastServicedOn ?? latestServiceEvent?.occurredAt ?? null;
    const repairEvents = record?.homeEvents?.filter((event) => event.type === 'REPAIR') ?? [];
    const warranty = record?.warranty ?? record?.linkedWarranties?.[0] ?? null;
    const warrantyActive = warranty?.expiryDate ? warranty.expiryDate >= analysis.computedAt : null;
    const policy = record?.insurancePolicy ?? null;
    const warrantyValue = (warranty?.expiryDate
      ? `${warrantyActive ? 'Active' : 'Expired'}${warranty.providerName ? ` · ${warranty.providerName}` : ''} · ${capitalFactDate(warranty.expiryDate)}`
      : warranty ? `${warranty.providerName ?? 'Warranty'} · expiry not recorded` : 'Not recorded').slice(0, 240).trim();
    const insuranceValue = (policy
      ? `${policy.carrierName} policy linked${policy.expiryDate ? ` · ${policy.expiryDate >= analysis.computedAt ? 'through' : 'expired'} ${capitalFactDate(policy.expiryDate)}` : ''} · coverage not confirmed`
      : 'No policy linked').slice(0, 240).trim();
    const windowOpen = item.windowStart <= analysis.computedAt;
    const monthsUntilWindow = Math.round(
      (item.windowStart.getTime() - analysis.computedAt.getTime()) / (30.44 * 24 * 60 * 60 * 1000),
    );
    const priority: HomeAction['priority'] = windowOpen || monthsUntilWindow <= 12 ? 'SOON' : 'PLAN';
    const ageText = ageYears != null ? `${ageYears} years old` : null;
    const ageValue = ageText && knownSince
      ? `${ageText} · ${record?.installedOn ? 'installed' : 'purchased'} ${capitalFactDate(knownSince)}`
      : 'Not recorded';
    const knownFacts = ageText && condition
      ? `${ageText} and recorded in ${condition.toLowerCase()} condition`
      : ageText ?? (condition ? `recorded in ${condition.toLowerCase()} condition` : null);
    const whyNow = windowOpen
      ? `${label} is ${knownFacts ?? 'in its estimated lifecycle window'}; its planning window is open now.`
      : `${label} is ${knownFacts ?? 'approaching its estimated lifecycle window'}; its projected replacement window is ${windowLabel}.`;
    const missingFacts = [
      ...(!knownSince ? [`${label} install or purchase date`] : []),
      ...(!condition ? [`${label} condition`] : []),
    ];
    const governance = materialFinancialGovernance('home-capital-timeline-window-v2');
    const actionId = `home-capital-timeline-window:${item.id}`;
    const launchParams = new URLSearchParams({
      launchSurface: 'unified_home',
      sourceActionId: actionId,
      recommendationReason: 'CAPITAL_WINDOW',
      recommendationVersion: 'home-capital-timeline-window-v2',
      sourceEntityType: 'INVENTORY_ITEM',
      sourceEntityId: subjectId,
    });
    if (item.inventoryItemId) launchParams.set('itemId', item.inventoryItemId);
    if (contextVersion) launchParams.set('contextVersion', contextVersion);

    return adaptHomeActionSource('SYSTEM', {
      id: actionId,
      propertyId,
      lineageId: actionId,
      sourceEntityId: subjectId,
      sourceVersion: analysis.computedAt.toISOString(),
      job: 'MAJOR_MOMENT',
      state: 'OPEN',
      priority,
      signal: `${label} has an estimated replacement window of ${windowLabel}.`,
      whyItMatters: item.why.slice(0, 1200).trim(),
      recommendedAction: `Review the replacement plan for ${label}`,
      expectedOutcome: costRange
        ? `A ${costRange} planning range to budget against before ${label}'s replacement window.`
        : `A focused replacement plan for ${label} before its projected window.`,
      presentation: {
        variant: 'ASSET_LIFECYCLE',
        eyebrow: 'Plan ahead',
        headline: `Plan ahead for ${label}`.slice(0, 180).trim(),
        summary: `Nothing here says ${label} has failed. Use the known history and protection details to decide when and how much to set aside.`,
        whyNow: whyNow.slice(0, 500).trim(),
        keyFacts: [],
        factGroups: [
          {
            label: 'History',
            facts: [
              {
                key: 'age', label: 'Age', value: ageValue,
                kind: ageText ? 'DERIVED' : 'MISSING', source: ageText ? 'Home Record date' : 'Home Record',
                observedAt: knownSince?.toISOString() ?? null,
              },
              {
                key: 'condition', label: 'Condition', value: condition ?? 'Not recorded',
                kind: condition ? 'RECORDED' : 'MISSING', source: 'Home Record',
                observedAt: record?.updatedAt.toISOString() ?? null,
              },
              {
                key: 'last-service', label: 'Last service', value: lastServiceDate ? capitalFactDate(lastServiceDate) : 'Not recorded',
                kind: lastServiceDate ? 'RECORDED' : 'MISSING', source: record?.lastServicedOn ? 'Home Record' : latestServiceEvent ? 'Home event' : 'Home Record',
                observedAt: lastServiceDate?.toISOString() ?? null,
              },
              {
                key: 'repairs', label: 'Recorded repairs', value: repairEvents.length > 0 ? `${repairEvents.length} recorded` : 'None recorded',
                kind: repairEvents.length > 0 ? 'RECORDED' : 'MISSING', source: 'Home event history',
                observedAt: repairEvents[0]?.occurredAt.toISOString() ?? null,
              },
            ],
          },
          {
            label: 'Protection',
            facts: [
              {
                key: 'warranty', label: 'Warranty',
                value: warrantyValue,
                kind: warranty ? 'RECORDED' : 'MISSING', source: 'Home Record warranty',
                observedAt: warranty?.updatedAt.toISOString() ?? null,
              },
              {
                key: 'insurance', label: 'Insurance',
                value: insuranceValue,
                kind: policy ? 'RECORDED' : 'MISSING', source: 'Home Record insurance',
                observedAt: policy?.lastVerifiedAt?.toISOString() ?? policy?.updatedAt.toISOString() ?? null,
              },
            ],
          },
          {
            label: 'Plan',
            facts: [
              {
                key: 'window', label: 'Replacement window', value: windowLabel,
                kind: 'DERIVED', source: 'Home Capital Timeline', observedAt: analysis.computedAt.toISOString(),
              },
              {
                key: 'budget', label: 'Estimated budget', value: costRange ?? 'Not estimated',
                kind: costRange ? 'DERIVED' : 'MISSING', source: 'Home Capital Timeline', observedAt: analysis.computedAt.toISOString(),
              },
              ...(typicalLifespan ? [{
                key: 'lifespan', label: 'Typical lifespan', value: `${typicalLifespan} years`,
                kind: 'BENCHMARK' as const, source: 'Home Capital Timeline benchmark', observedAt: analysis.computedAt.toISOString(),
              }] : []),
              {
                key: 'confidence', label: 'Estimate confidence', value: `${item.confidence.charAt(0)}${item.confidence.slice(1).toLowerCase()}`,
                kind: 'DERIVED', source: 'Home Capital Timeline', observedAt: analysis.computedAt.toISOString(),
              },
            ],
          },
        ],
        subject: { kind: 'INVENTORY_ITEM', id: subjectId, label },
        detailLabel: 'Why this estimate?',
        group: null,
      },
      timing: {
        dueAt: null,
        windowStart: item.windowStart.toISOString(),
        windowEnd: item.windowEnd.toISOString(),
        rationale: "Reflects this item's predicted replacement window, not a fixed deadline.",
      },
      evidence: [
        {
          id: item.id, type: 'SYSTEM_DERIVATION', label: `${label} capital projection`,
          source: 'Home Capital Timeline', observedAt: analysis.computedAt.toISOString(), freshness: 'CURRENT', confidence: confidenceScore,
        },
        ...(item.inventoryItemId ? [{
          id: item.inventoryItemId, type: 'PROPERTY_FACT' as const, label: `${label} Home Record`,
          source: 'Home Record', observedAt: record?.updatedAt.toISOString() ?? null,
          freshness: 'CURRENT' as const, confidence: record?.isVerified ? 1 : 0.7,
        }] : []),
      ],
      ...guidanceDecisionContract(governance),
      confidence: { score: confidenceScore, label: confidenceLabel, missing: missingFacts },
      governance,
      primaryCta: {
        kind: 'REVIEW',
        label: `Plan ${label} replacement`.slice(0, 120).trim(),
        href: `/dashboard/properties/${propertyId}/tools/capital-timeline?${launchParams.toString()}`,
      },
      secondaryCtas: [{
        kind: 'CORRECT_FACT', label: 'Update item details',
        href: item.inventoryItemId
          ? `/dashboard/properties/${propertyId}/inventory?tab=items&openItemId=${encodeURIComponent(item.inventoryItemId)}`
          : `/dashboard/properties/${propertyId}/inventory?tab=items`,
      }],
      feedbackControls: ['DISMISS', 'SNOOZE', 'NOT_RELEVANT', 'CORRECT_FACT'],
      relatedJourneyId: null,
      createdAt: analysis.computedAt.toISOString(),
      lastEvaluatedAt: analysis.computedAt.toISOString(),
    });
  });
}

async function loadPropertyTaxAppealCaseActions(
  propertyId: string,
  db: HomeActionSourceDb,
): Promise<HomeAction[]> {
  if (!db.propertyTaxAppealCase) return [];
  const appealCase = await db.propertyTaxAppealCase.findFirst({
    where: {
      propertyId,
      status: {
        in: [
          'PREPARING',
          'PACKET_READY',
          'FILED',
          'AWAITING_RESPONSE',
          'RESPONSE_RECEIVED',
          'HEARING_SCHEDULED',
          'DETERMINED',
        ],
      },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      status: true,
      formCode: true,
      updatedAt: true,
      hearingAt: true,
      packet: {
        select: {
          unresolvedPlaceholdersJson: true,
        },
      },
      reminders: {
        where: { status: 'PENDING' },
        orderBy: { dueAt: 'asc' },
        take: 1,
        select: { title: true, dueAt: true },
      },
    },
  });
  if (!appealCase) return [];

  const unresolved = Array.isArray(
    appealCase.packet?.unresolvedPlaceholdersJson,
  )
    ? appealCase.packet.unresolvedPlaceholdersJson.length
    : 0;
  const reminder = appealCase.reminders[0] ?? null;
  const stateCopyByStatus = {
    PREPARING: {
      signal: unresolved > 0
        ? `${unresolved} appeal packet field${unresolved === 1 ? '' : 's'} still need completion.`
        : 'The appeal packet still needs homeowner review.',
      action: 'Complete the appeal packet',
      outcome: 'A reviewed packet with no unresolved placeholders.',
    },
    PACKET_READY: {
      signal: `The ${appealCase.formCode ?? 'appeal'} packet is ready but has not been recorded as filed.`,
      action: 'File through the official authority and record the receipt',
      outcome: 'External filing is confirmed without implying that ContractToCozy submitted it.',
    },
    FILED: {
      signal: 'The property-tax appeal was recorded as filed externally.',
      action: reminder?.title ?? 'Track the authority response',
      outcome: 'The next response or deadline is preserved in the case.',
    },
    AWAITING_RESPONSE: {
      signal: reminder
        ? `${reminder.title} is the next appeal case reminder.`
        : 'The filed property-tax appeal is awaiting an authority response.',
      action: reminder?.title ?? 'Track the authority response',
      outcome: 'The next response or deadline is preserved in the case.',
    },
    RESPONSE_RECEIVED: {
      signal: 'A response was recorded for the property-tax appeal.',
      action: 'Review the response and record the next step',
      outcome: 'The case reflects the response, hearing, or determination.',
    },
    HEARING_SCHEDULED: {
      signal: appealCase.hearingAt
        ? `The property-tax appeal hearing is scheduled for ${appealCase.hearingAt.toLocaleDateString()}.`
        : 'A hearing is scheduled for the property-tax appeal.',
      action: 'Prepare for the recorded appeal hearing',
      outcome: 'Hearing preparation and evidence remain tied to the case.',
    },
    DETERMINED: {
      signal: 'A determination is recorded, but the appeal case is still open.',
      action: 'Record the final refund or credit and close the case',
      outcome: 'The realized assessment and financial outcome are preserved.',
    },
  };
  const stateCopy = stateCopyByStatus[
    appealCase.status as keyof typeof stateCopyByStatus
  ];
  if (!stateCopy) return [];

  const dueAt = appealCase.status === 'HEARING_SCHEDULED'
    ? appealCase.hearingAt
    : reminder?.dueAt ?? null;
  const urgent = appealCase.status === 'PACKET_READY'
    || appealCase.status === 'HEARING_SCHEDULED'
    || appealCase.status === 'DETERMINED'
    || Boolean(dueAt && dueAt.getTime() - Date.now() <= 30 * 86_400_000);
  const governance = materialFinancialGovernance(
    'property-tax-appeal-case-v1',
  );
  return [adaptHomeActionSource('SYSTEM', {
    id: `property-tax-appeal-case:${appealCase.id}:${appealCase.status}`,
    propertyId,
    lineageId: `property-tax-appeal-case:${appealCase.id}`,
    sourceEntityId: appealCase.id,
    sourceVersion: appealCase.updatedAt.toISOString(),
    job: 'MAJOR_MOMENT',
    state: 'OPEN',
    priority: urgent ? 'NOW' : 'SOON',
    signal: stateCopy.signal,
    whyItMatters:
      'Property-tax appeal rights and outcomes depend on completing the current official step and retaining evidence.',
    recommendedAction: stateCopy.action,
    expectedOutcome: stateCopy.outcome,
    timing: {
      dueAt: dueAt?.toISOString() ?? null,
      windowStart: null,
      windowEnd: dueAt?.toISOString() ?? null,
      rationale: dueAt
        ? 'Uses the next homeowner-recorded case date.'
        : 'Uses the current durable appeal case status; no deadline is inferred.',
    },
    evidence: [{
      id: appealCase.id,
      type: 'SYSTEM_DERIVATION',
      label: appealCase.title,
      source: 'Property Tax Center appeal case',
      observedAt: appealCase.updatedAt.toISOString(),
      freshness: 'CURRENT',
      confidence: 1,
    }],
    assumptions: [],
    options: [],
    tradeoffs: [],
    confidence: { score: 1, label: 'HIGH', missing: [] },
    governance,
    primaryCta: {
      kind: 'REVIEW',
      label: stateCopy.action,
      href: `/dashboard/properties/${propertyId}/tools/property-tax?stage=appeal&caseId=${appealCase.id}`,
    },
    secondaryCtas: [],
    feedbackControls: ['SNOOZE', 'DISMISS', 'NOT_RELEVANT'],
    relatedJourneyId: null,
    createdAt: appealCase.updatedAt.toISOString(),
    lastEvaluatedAt: appealCase.updatedAt.toISOString(),
  })];
}

const SAVINGS_BENEFITS_DEADLINE_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * Promotes only a reviewed, HIGH-confidence, not-yet-resolved benefit match
 * with either a material estimated value or a closing application window —
 * the audit's explicit Home-placement criteria (section 8.5): do not
 * promote background scanning, an empty registry, or a generic "run a scan"
 * state. A match with any Slice 7 outcome already recorded is excluded —
 * it's been acted on, so it's no longer a pending decision for Home.
 */
async function loadSavingsBenefitsActions(propertyId: string, db: HomeActionSourceDb): Promise<HomeAction[]> {
  if (!db.propertyHiddenAssetMatch) return [];
  const now = new Date();
  const deadlineWindow = new Date(now.getTime() + SAVINGS_BENEFITS_DEADLINE_WINDOW_MS);

  const startedActions = db.savingsBenefitAction
    ? await db.savingsBenefitAction.findMany({
        where: { propertyId, state: 'STARTED' },
        orderBy: [{ followUpAt: 'asc' }, { updatedAt: 'desc' }],
        take: 10,
        include: {
          hiddenAssetMatch: {
            include: {
              program: {
                select: {
                  name: true,
                  regionValue: true,
                  sourceLabel: true,
                  sourceUrl: true,
                  lastVerifiedAt: true,
                  isActive: true,
                  reviewStatus: true,
                  expiresAt: true,
                  fundingStatus: true,
                  applicationWindowOpensAt: true,
                  applicationWindowClosesAt: true,
                  source: {
                    select: {
                      status: true,
                      officialUrl: true,
                      lastReviewedAt: true,
                      reviewSlaDays: true,
                      version: true,
                      reviewedVersion: true,
                    },
                  },
                },
              },
            },
          },
          homeSavingsOpportunity: {
            select: {
              headline: true,
              detail: true,
              categoryKey: true,
              generatedAt: true,
            },
          },
        },
      })
    : [];

  const resumableActions = startedActions.filter((action) =>
    !action.hiddenAssetMatch
    || isProgramActionableNow(
      action.hiddenAssetMatch.program,
      action.hiddenAssetMatch.program.source,
      now,
    ),
  ).map((action) => {
    const match = action.hiddenAssetMatch;
    const opportunity = action.homeSavingsOpportunity;
    const title = match?.program.name ?? opportunity?.headline ?? 'Savings & Benefits action';
    const dueAt = action.followUpAt ?? match?.program.applicationWindowClosesAt ?? null;
    const dueNow = Boolean(dueAt && dueAt.getTime() <= deadlineWindow.getTime());
    const observedAt = action.updatedAt.toISOString();
    const actionKind = action.actionType.toLowerCase().replace(/_/g, ' ');
    const checklist = Array.isArray(action.checklistJson) ? action.checklistJson : [];

    return adaptHomeActionSource('SAVINGS_BENEFITS', {
      id: `savings-benefit-action:${action.id}`,
      propertyId,
      lineageId: `savings-benefit-action:${action.id}`,
      sourceEntityId: action.id,
      sourceVersion: `${action.state}:${observedAt}`,
      state: 'IN_PROGRESS',
      priority: dueNow ? 'NOW' : 'SOON',
      signal: dueNow
        ? `Your "${title}" follow-up is due now.`
        : `You have an unfinished "${title}" action.`,
      whyItMatters:
        'This action was already started. Resume it to preserve your checklist, evidence, and recorded decision history.',
      recommendedAction: `Resume the ${actionKind} workflow`,
      expectedOutcome: 'A completed or explicitly closed Savings & Benefits action with a durable outcome.',
      timing: {
        dueAt: dueAt?.toISOString() ?? null,
        windowStart: action.startedAt.toISOString(),
        windowEnd: match?.program.applicationWindowClosesAt?.toISOString() ?? null,
        rationale: 'Started Savings & Benefits actions remain on Home until completed or cancelled.',
      },
      evidence: [{
        id: action.id,
        type: 'USER_INPUT',
        label: checklist.length > 0 ? `${checklist.length} checklist item(s) saved` : 'Action started',
        source: match?.program.sourceLabel ?? match?.program.sourceUrl ?? 'Savings & Benefits workspace',
        observedAt,
        freshness: 'CURRENT',
        confidence: 1,
      }],
      assumptions: [{
        key: 'resume-user-action',
        label: 'This action is still relevant',
        value: 'The action remains open because it has not been completed or cancelled.',
        source: 'USER',
        editable: true,
      }],
      options: [
        { id: 'resume', label: 'Resume action', summary: 'Continue from the saved checklist and follow-up state.', recommended: true },
        { id: 'close', label: 'Close action', summary: 'Cancel it or record a terminal outcome if it is no longer relevant.', recommended: false },
      ],
      tradeoffs: [{
        optionId: 'resume',
        dimension: 'EFFORT',
        summary: 'May require documents, eligibility confirmation, or follow-up with an external organization.',
      }],
      confidence: { score: 1, label: 'HIGH', missing: [] },
      governance: {
        ...materialFinancialGovernance('savings-benefits-action-v1'),
        jurisdictionCheck: match
          ? {
              status: match.program.lastVerifiedAt ? 'VERIFIED' : 'UNKNOWN',
              jurisdiction: match.program.regionValue,
              checkedAt: match.program.lastVerifiedAt?.toISOString() ?? null,
              source: match.program.sourceLabel ?? match.program.sourceUrl ?? 'Reviewed program registry',
            }
          : {
              status: 'NOT_REQUIRED',
              jurisdiction: null,
              checkedAt: null,
              source: null,
            },
      },
      primaryCta: {
        kind: 'REVIEW',
        label: 'Resume action',
        href: `/dashboard/properties/${propertyId}/tools/savings-benefits?section=in-progress&actionId=${action.id}`,
      },
      secondaryCtas: [],
      feedbackControls: ['SNOOZE', 'DEFER', 'DISMISS', 'NOT_RELEVANT'],
      relatedJourneyId: null,
      createdAt: action.startedAt.toISOString(),
      lastEvaluatedAt: observedAt,
    });
  });

  const matches = await db.propertyHiddenAssetMatch.findMany({
    where: {
      propertyId,
      status: { in: ['DETECTED', 'VIEWED', 'PURSUING'] },
      confidenceLevel: 'HIGH',
      outcomes: { none: {} },
      savingsBenefitActions: { none: { state: 'STARTED' } },
      program: {
        isActive: true,
        reviewStatus: 'PUBLISHED',
        sourceUrl: { not: null },
        lastVerifiedAt: { not: null },
        source: { status: 'ACTIVE', lastReviewedAt: { not: null } },
      },
      OR: [
        { estimatedValueMax: { not: null } },
        { estimatedValueMin: { not: null } },
        { program: { applicationWindowClosesAt: { gte: now, lte: deadlineWindow } } },
      ],
    },
    orderBy: { lastEvaluatedAt: 'desc' },
    take: 10,
    include: {
      program: {
        select: {
          name: true, regionValue: true, sourceLabel: true, sourceUrl: true,
          lastVerifiedAt: true, isActive: true, reviewStatus: true,
          expiresAt: true, fundingStatus: true,
          applicationWindowOpensAt: true, applicationWindowClosesAt: true,
          currency: true,
          source: {
            select: {
              status: true,
              officialUrl: true,
              lastReviewedAt: true,
              reviewSlaDays: true,
              version: true,
              reviewedVersion: true,
            },
          },
        },
      },
    },
  });

  const matchActions = matches.filter((match) =>
    isProgramActionableNow(match.program, match.program.source, now),
  ).map((match) => {
    const program = match.program;
    const closesAt = program.applicationWindowClosesAt;
    const closingSoon = Boolean(closesAt && closesAt.getTime() <= deadlineWindow.getTime());
    const value = match.estimatedValueMax ?? match.estimatedValueMin;
    const valueLabel = value != null ? `${program.currency} ${value.toNumber().toLocaleString('en-US')}` : null;
    const stale = getFreshnessNote(program.lastVerifiedAt) !== null;
    const matchReasons = Array.isArray(match.matchReasons) ? (match.matchReasons as unknown[]) : [];
    const reasonLabel = typeof matchReasons[0] === 'string' ? matchReasons[0] : 'Property and location criteria match.';
    const whyItMatters = valueLabel
      ? `${reasonLabel} Program publishes an estimated value of up to ${valueLabel} — verify the remaining criteria before relying on this figure.`
      : reasonLabel;

    return adaptHomeActionSource('SAVINGS_BENEFITS', {
      id: `savings-benefit-match:${match.id}`,
      propertyId,
      lineageId: `savings-benefit-match:${match.id}`,
      sourceEntityId: match.id,
      sourceVersion: `${match.confidenceLevel}:${match.lastEvaluatedAt.toISOString()}`,
      state: 'OPEN',
      priority: closingSoon ? 'NOW' : 'SOON',
      signal: closingSoon
        ? `The application window for "${program.name}" is closing soon.`
        : `"${program.name}" may apply to this home.`,
      whyItMatters,
      recommendedAction: closingSoon
        ? 'Review the eligibility checklist and apply before the window closes'
        : 'Review the eligibility checklist and verify the remaining criteria',
      expectedOutcome: 'A recorded decision to pursue, apply, or dismiss this benefit.',
      timing: {
        dueAt: closesAt?.toISOString() ?? null,
        windowStart: match.firstDetectedAt.toISOString(),
        windowEnd: closesAt?.toISOString() ?? null,
        rationale: 'Only reviewed, HIGH-confidence benefit matches with a material value or closing window are promoted.',
      },
      evidence: [{
        id: match.id,
        type: 'SYSTEM_DERIVATION',
        label: reasonLabel,
        source: program.sourceLabel ?? program.sourceUrl ?? 'Reviewed program registry',
        observedAt: match.lastEvaluatedAt.toISOString(),
        freshness: stale ? 'STALE' : 'CURRENT',
        confidence: 0.9,
      }],
      assumptions: [{
        key: 'property-level-match-only',
        label: 'Eligibility is a property-level match, not a final determination',
        value: 'This reflects property and location criteria only — income, age, and other homeowner-specific criteria have not been verified.',
        source: 'SYSTEM_DEFAULT',
        editable: false,
      }],
      options: [
        { id: 'review-checklist', label: 'Review eligibility checklist', summary: 'Verify the remaining criteria against the official source before applying.', recommended: true },
        { id: 'dismiss', label: 'Not relevant', summary: 'Dismiss if this does not apply to this home or household.', recommended: false },
      ],
      tradeoffs: [
        { optionId: 'review-checklist', dimension: 'EFFORT', summary: 'Requires verifying remaining criteria and preparing an application before any deadline.' },
      ],
      confidence: {
        score: 0.9,
        label: 'HIGH',
        // A HIGH-confidence Slice 3 match already has zero unresolved
        // mandatory criteria by construction (evaluateProgram would have
        // capped it at LOW otherwise) — nothing left to list as missing.
        missing: [],
      },
      governance: {
        ...materialFinancialGovernance('savings-benefits-v1'),
        jurisdictionCheck: {
          status: stale ? 'UNKNOWN' : 'VERIFIED',
          jurisdiction: program.regionValue,
          checkedAt: program.lastVerifiedAt?.toISOString() ?? null,
          source: program.sourceLabel ?? program.sourceUrl ?? 'Reviewed program registry',
        },
      },
      primaryCta: {
        kind: 'REVIEW',
        label: 'Review benefit',
        href: `/dashboard/properties/${propertyId}/tools/savings-benefits`,
      },
      secondaryCtas: [],
      feedbackControls: RECOMMENDATION_FEEDBACK,
      relatedJourneyId: null,
      createdAt: match.firstDetectedAt.toISOString(),
      lastEvaluatedAt: match.lastEvaluatedAt.toISOString(),
    });
  });

  return [...resumableActions, ...matchActions];
}

const UNGROUNDED_HOME_COPY = [
  /^review a financial exposure$/i,
  /^review and address before listing$/i,
  /^review the flagged home facts$/i,
  /^continue (this|the) (home )?(decision|journey)$/i,
  /^add home information$/i,
  /^view details$/i,
  /^open tool$/i,
];

function isGenericHomeCopy(value: string): boolean {
  const normalized = value.trim();
  return normalized.length === 0 || UNGROUNDED_HOME_COPY.some((pattern) => pattern.test(normalized));
}

/**
 * Home eligibility gate: promoted recommendations must carry a real subject
 * and a homeowner-facing reason. Presentation subjects are authoritative;
 * legacy adapters may use a specific signal/evidence label while they migrate.
 */
export function isGroundedHomeAction(action: HomeAction): boolean {
  return homeActionGroundingReasons(action).length === 0;
}

export function homeActionGroundingReasons(action: HomeAction): string[] {
  const reasons: string[] = [];
  const headline = action.presentation?.headline ?? action.recommendedAction;
  const explicitSubject = action.presentation?.subject?.label?.trim();
  const evidenceSubject = action.evidence.find((entry) => !isGenericHomeCopy(entry.label))?.label.trim();
  const signalSubject = !isGenericHomeCopy(action.signal) ? action.signal.trim() : null;
  const subject = explicitSubject || evidenceSubject || signalSubject;
  const reason = action.presentation?.whyNow?.trim() || action.whyItMatters.trim();

  if (!subject) reasons.push('MISSING_SUBJECT');
  if (!reason) reasons.push('MISSING_REASON');
  if (isGenericHomeCopy(headline) && !explicitSubject) reasons.push('GENERIC_HEADLINE');
  if (action.primaryCta.label.trim().length === 0 || isGenericHomeCopy(action.primaryCta.label)) {
    reasons.push('GENERIC_OR_MISSING_CTA');
  }
  reasons.push(...evaluateHomeActionPresentationEligibility(action).reasons);
  return [...new Set(reasons)];
}

export function filterGroundedHomeActions(
  actions: HomeAction[],
  options: {
    propertyId: string;
    userId?: string | null;
    source: string;
    additionalReasons?: (action: HomeAction) => string[];
  },
): { actions: HomeAction[]; suppressedCount: number } {
  const evaluations = actions.map((action) => ({
    action,
    reasons: [...new Set([
      ...homeActionGroundingReasons(action),
      ...(options.additionalReasons?.(action) ?? []),
    ])],
  }));
  if (options.userId) {
    analyticsEmitter.trackBatch(evaluations
      .filter((evaluation) => evaluation.reasons.length > 0)
      .map(({ action, reasons }) => ({
        eventType: ProductAnalyticsEventType.HOME_ACTION_IDENTIFIED,
        eventName: 'home_action_quality_suppressed',
        userId: options.userId!,
        propertyId: options.propertyId,
        moduleKey: 'dashboard',
        featureKey: 'unified_home_action_quality',
        screenKey: 'unified_home',
        source: options.source,
        valueNumeric: 1,
        valueText: reasons[0],
        metadataJson: {
          actionId: action.id,
          sourceKind: action.source.kind,
          presentationVariant: action.presentation?.variant ?? null,
          reasons,
        },
      })));
  }
  return {
    actions: evaluations.filter((evaluation) => evaluation.reasons.length === 0).map(({ action }) => action),
    suppressedCount: evaluations.filter((evaluation) => evaluation.reasons.length > 0).length,
  };
}

export async function getPromotedHomeActions(
  propertyId: string,
  db: HomeActionSourceDb = prisma,
  options: {
    includePersonalization?: boolean;
    environmentInsights?: readonly EnvironmentInsight[];
    evaluatedAt?: Date;
    userId?: string | null;
    propertyLabel?: string;
  } = {},
): Promise<{
  actions: HomeAction[];
  diagnostics: { candidateCount: number; suppressedCount: number; snoozedCount: number };
}> {
  const incidentActions = await loadIncidentActions(propertyId, db, options.propertyLabel);
  const activeWeatherIncidentIds = new Set(incidentActions
    .filter((action) => action.evidence.some((evidence) => evidence.source.includes('National Weather Service')))
    .map((action) => action.source.entityId));
  const environmentActions = adaptEnvironmentInsightsToHomeActions(
    propertyId,
    options.environmentInsights ?? [],
    incidentActions,
    options.evaluatedAt,
    options.propertyLabel,
  );
  const activeEnvironmentActionIds = new Set(environmentActions.map((action) => action.id.replace(/^environment:/, '')));
  const activeEnvironmentWeatherFamilies = new Set((options.environmentInsights ?? [])
    .filter((insight) => activeEnvironmentActionIds.has(insight.id))
    .map((insight) => environmentWeatherFamily(insight.category))
    .filter((family): family is string => Boolean(family)));
  const groups = await Promise.all([
    loadGuidanceActions(
      propertyId,
      db,
      activeWeatherIncidentIds,
      activeEnvironmentWeatherFamilies,
      options.evaluatedAt ?? new Date(),
      options.propertyLabel,
    ), Promise.resolve(incidentActions),
    loadRecallActions(propertyId, db), loadCoverageActions(propertyId, db),
    loadCoverageRenewalActions(propertyId, db, options.evaluatedAt),
    loadHealthInsightActions(propertyId, db, options.evaluatedAt),
    loadRepairReplaceDecisionActions(propertyId, db, options.evaluatedAt),
    loadProjectActions(propertyId, db), loadSeasonalChecklistActions(propertyId, db),
    loadInspectionFindingActions(propertyId, db),
    loadSalePrepActions(propertyId, db),
    options.includePersonalization === false ? Promise.resolve([]) : loadPersonalizationActions(propertyId, db),
    loadRefinanceDataRequiredActions(propertyId, db),
    loadRefinanceOpportunityActions(propertyId, db, options.evaluatedAt),
    loadHomeDigitalTwinFactReviewActions(propertyId, db),
    loadHomeCapitalTimelineMaterialWindowActions(propertyId, db),
    loadPropertyTaxAppealCaseActions(propertyId, db),
    loadSavingsBenefitsActions(propertyId, db),
    loadOwnershipCostChangeActions(propertyId, db),
    Promise.resolve(environmentActions),
  ]);
  const rawCandidates = groups.flat();
  const grounded = filterGroundedHomeActions(rawCandidates, {
    propertyId,
    userId: options.userId,
    source: 'home_action_source_grounding_gate',
  });
  const candidates = grounded.actions;
  const groundingSuppressedCount = grounded.suppressedCount;
  if (candidates.length === 0) {
    return {
      actions: [],
      diagnostics: {
        candidateCount: rawCandidates.length,
        suppressedCount: groundingSuppressedCount,
        snoozedCount: 0,
      },
    };
  }

  const actionKeys = candidates.map((action) => action.id);
  const [terminalEvents, activeSnoozes] = await Promise.all([
    db.orchestrationActionEvent.findMany({
      where: { propertyId, actionKey: { in: actionKeys }, actionType: { in: ['USER_MARKED_COMPLETE', 'USER_DISMISSED'] } },
      select: { actionKey: true },
    }),
    db.orchestrationActionSnooze.findMany({
      where: { propertyId, actionKey: { in: actionKeys }, endedAt: null, snoozeUntil: { gt: new Date() } },
      select: { actionKey: true },
    }),
  ]);
  const suppressed = new Set([...terminalEvents, ...activeSnoozes].map((item) => item.actionKey));
  return {
    actions: candidates.filter((action) => !suppressed.has(action.id)),
    diagnostics: {
      candidateCount: rawCandidates.length,
      suppressedCount: new Set(terminalEvents.map((item) => item.actionKey)).size + groundingSuppressedCount,
      snoozedCount: new Set(activeSnoozes.map((item) => item.actionKey)).size,
    },
  };
}
