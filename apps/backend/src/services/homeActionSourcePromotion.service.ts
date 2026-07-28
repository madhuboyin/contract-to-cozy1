import {
  adaptHomeActionSource,
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

const DEFAULT_FEEDBACK: HomeAction['feedbackControls'] = [
  'COMPLETE', 'DEFER', 'SNOOZE', 'DISMISS', 'ALREADY_DONE', 'NOT_RELEVANT', 'CORRECT_FACT',
];

export type HomeActionSourceDb = Pick<typeof prisma,
  'guidanceJourney' | 'incident' | 'recallMatch' | 'coverageReview' | 'projectRecord' |
  'seasonalChecklist' | 'personalizedRecommendation' | 'orchestrationActionEvent' | 'orchestrationActionSnooze'> &
  Partial<Pick<typeof prisma, 'domainEvent' | 'propertyFinancingProfile' | 'homeDigitalTwin' | 'homeTwinComponent' | 'homeCapitalTimelineAnalysis' | 'propertyTaxAppealCase' | 'propertyHiddenAssetMatch'>>;

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
          label: primary?.label ?? 'Review environment report',
          href: primaryHref,
        },
        secondaryCtas: primaryHref === reportHref ? [] : [{
          kind: 'REVIEW',
          label: 'View environment report',
          href: reportHref,
        }],
        feedbackControls: DEFAULT_FEEDBACK,
        relatedJourneyId: null,
        createdAt: evaluatedAtIso,
        lastEvaluatedAt: evaluatedAtIso,
      });
    });
}

async function loadGuidanceActions(
  propertyId: string,
  db: HomeActionSourceDb,
  activeWeatherIncidentIds: Set<string> = new Set(),
): Promise<HomeAction[]> {
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
          lastObservedAt: true,
          sourceEntityType: true,
          sourceEntityId: true,
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
    const title = subjectLabel
      ? `${journeyTitle} for ${subjectLabel}`
      : journeyTitle;
    const correctionLabel = isCoverageJourney
      ? coverageUncertain ? 'Update coverage information' : 'Add coverage information'
      : 'Add home information';
    const actionId = `guidance:${journey.id}`;
    const correctionHref = isCoverageJourney && journey.inventoryItemId
      ? `/dashboard/properties/${propertyId}/inventory/items/${encodeURIComponent(journey.inventoryItemId)}/coverage?sourceActionId=${encodeURIComponent(actionId)}&returnTo=${encodeURIComponent('/dashboard')}`
      : `/dashboard/properties/${propertyId}/onboarding`;
    const href = resolveGuidanceHref({
      propertyId,
      journeyId: journey.id,
      itemId: journey.inventoryItemId,
      routePath: step?.routePath ?? null,
    });
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
      signal: `${title}: ${step?.label ?? 'continue the active decision'}`,
      whyItMatters: coverageUncertain && subjectLabel
        ? `You previously said you were not sure whether ${subjectLabel} is covered. Confirm the current information, or ask to be reminded later.`
        : step?.description ?? 'This active journey preserves the evidence and decisions needed for the next home outcome.',
      recommendedAction: recommendationResponse.materialActionAllowed
        ? step?.label ?? 'Continue this home decision'
        : recommendationResponse.safeNextAction,
      withheldRecommendedAction: subjectLabel
        ? isCoverageJourney
          ? coverageUncertain
            ? `Confirm coverage for ${subjectLabel}`
            : `Add coverage information for ${subjectLabel}`
          : `Review home information for ${subjectLabel} before continuing`
        : undefined,
      expectedOutcome: 'Advance the active journey without losing its property, evidence, or decision context.',
      timing: {
        dueAt: null,
        windowStart: journey.startedAt.toISOString(),
        windowEnd: null,
        rationale: step?.status === 'BLOCKED' ? 'The current journey step is blocked and needs review.' : 'This is the next incomplete step in an active journey.',
      },
      evidence: [{
        id: journey.primarySignal?.id ?? journey.id,
        type: 'SYSTEM_DERIVATION',
        label: title,
        source: 'Guidance journey',
        observedAt: (journey.primarySignal?.lastObservedAt ?? journey.updatedAt).toISOString(),
        freshness: 'CURRENT',
        confidence,
      }],
      ...decisionContract,
      confidence: { score: confidence, label: confidenceLabel(confidence), missing: missingContextKeys },
      governance,
      primaryCta: {
        kind: 'REVIEW',
        label: recommendationResponse.materialActionAllowed ? step?.label ?? 'Continue journey' : 'Review home information',
        href: recommendationResponse.materialActionAllowed
          ? href
          : `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${encodeURIComponent(journey.id)}`,
      },
      secondaryCtas: [
        {
          kind: 'CORRECT_FACT',
          label: correctionLabel,
          href: correctionHref,
        },
        ...(governance.safetyTier === 'SAFETY_EMERGENCY'
          ? [{
              kind: 'ESCALATE' as const,
              label: 'Review emergency options',
              href: `/dashboard/properties/${propertyId}/incidents`,
            }]
          : []),
      ],
      feedbackControls: DEFAULT_FEEDBACK,
      relatedJourneyId: journey.id,
      createdAt: journey.createdAt.toISOString(),
      lastEvaluatedAt: journey.updatedAt.toISOString(),
    });
  });
}

async function loadIncidentActions(propertyId: string, db: HomeActionSourceDb): Promise<HomeAction[]> {
  const incidents = await db.incident.findMany({
    where: {
      propertyId,
      status: { in: ['DETECTED', 'EVALUATED', 'ACTIVE', 'ACTIONED'] },
      isSuppressed: false,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }],
    },
    orderBy: [{ severityScore: 'desc' }, { updatedAt: 'desc' }],
    take: 20,
    include: { actions: { where: { status: { in: ['PROPOSED', 'CREATED', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'asc' }, take: 1 } },
  });

  return incidents.flatMap((incident) => {
    const proposed = incident.actions[0];
    const critical = incident.severity === 'CRITICAL';
    const isWeather = incident.sourceType === 'WEATHER';
    const details = incident.details && typeof incident.details === 'object' && !Array.isArray(incident.details)
      ? incident.details as Record<string, unknown>
      : {};
    const weatherExpiry = typeof details.expires === 'string' && !Number.isNaN(new Date(details.expires).getTime())
      ? new Date(details.expires).toISOString()
      : incident.expiredAt?.toISOString() ?? null;
    // The worker normally resolves alerts after a successful NWS refresh, but
    // Home must not depend on that asynchronous sweep to remove an alert whose
    // authoritative expiry has already passed.
    if (isWeather && weatherExpiry && new Date(weatherExpiry) <= new Date()) return [];
    const weatherInstruction = typeof details.instruction === 'string' && details.instruction.trim()
      ? details.instruction.trim().slice(0, 1000)
      : null;
    const weatherSource = typeof details.senderName === 'string' && details.senderName.trim()
      ? `National Weather Service — ${details.senderName.trim()}`
      : 'National Weather Service';
    const confidence = incident.confidence == null ? null : Math.max(0, Math.min(1, incident.confidence / 100));
    const href = proposed?.ctaUrl ?? `/dashboard/properties/${propertyId}/incidents/${incident.id}`;
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
      recommendedAction: isWeather
        ? `Review ${incident.title} safety guidance`
        : proposed?.ctaLabel ?? (critical ? 'Review safety response now' : 'Review incident'),
      expectedOutcome: weatherInstruction ?? 'Confirm the incident response and preserve the evidence needed for follow-up.',
      timing: {
        dueAt: isWeather ? weatherExpiry : null,
        windowStart: incident.openedAt.toISOString(),
        windowEnd: isWeather ? weatherExpiry : incident.expiredAt?.toISOString() ?? null,
        rationale: isWeather
          ? weatherExpiry ? 'This official weather alert remains active until the recorded expiration time.' : 'This official weather alert remains active until the source clears it.'
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
      primaryCta: { kind: critical ? 'ESCALATE' : 'REVIEW', label: isWeather ? 'Review weather alert' : proposed?.ctaLabel ?? 'Review incident', href },
      secondaryCtas: [{ kind: 'CORRECT_FACT', label: 'Correct incident context', href: `/dashboard/properties/${propertyId}/incidents/${incident.id}` }],
      feedbackControls: critical && isWeather ? ['ALREADY_DONE', 'CORRECT_FACT'] : critical ? ['COMPLETE', 'ALREADY_DONE', 'CORRECT_FACT'] : DEFAULT_FEEDBACK,
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
        label: 'View seasonal checklist',
        href: `/dashboard/seasonal?propertyId=${encodeURIComponent(propertyId)}`,
      },
      secondaryCtas: [],
      feedbackControls: ['CORRECT_FACT'],
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
      feedbackControls: critical ? ['COMPLETE', 'ALREADY_DONE', 'CORRECT_FACT'] : DEFAULT_FEEDBACK,
      relatedJourneyId: null,
      createdAt: match.createdAt.toISOString(), lastEvaluatedAt: match.updatedAt.toISOString(),
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
    return adaptHomeActionSource('COVERAGE', {
      id: `coverage-review:${review.id}`,
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
      feedbackControls: DEFAULT_FEEDBACK, relatedJourneyId: null,
      createdAt: review.createdAt.toISOString(),
      lastEvaluatedAt: review.updatedAt.toISOString(),
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
    return adaptHomeActionSource('PROJECT', {
      id: `project:${project.id}`, propertyId,
      lineageId: project.guidanceJourneyId ?? `project:${project.id}`, sourceEntityId: project.id,
      sourceVersion: project.updatedAt.toISOString(), job: 'MAJOR_MOMENT', state: project.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'OPEN',
      priority: project.status === 'DISPUTED' || issue?.status === 'ESCALATED' ? 'NOW' : project.status === 'PAUSED' || issue ? 'SOON' : 'PLAN',
      signal: issue ? `${project.name}: ${issue.description}` : `${project.name}: ${milestone?.name ?? 'review project status'}`,
      whyItMatters: issue?.description ?? project.description ?? 'The active project has an incomplete milestone or decision.',
      recommendedAction: issue ? 'Review the open project issue' : milestone?.name ?? 'Review project status',
      expectedOutcome: 'Advance the project with scope, schedule, cost, and evidence context preserved.',
      timing: { dueAt: project.expectedEndDate?.toISOString() ?? null, windowStart: project.startDate.toISOString(), windowEnd: project.expectedEndDate?.toISOString() ?? null, rationale: issue ? 'An open issue may block the next project milestone.' : 'This is the next incomplete milestone in an active project.' },
      evidence: [{ id: project.id, type: 'SYSTEM_DERIVATION', label: project.name, source: 'Project tracker', observedAt: project.updatedAt.toISOString(), freshness: 'CURRENT', confidence: 1 }],
      assumptions: [], options: [], tradeoffs: [], confidence: { score: 1, label: 'HIGH', missing: [] },
      governance: lowConsequenceGovernance(),
      primaryCta: { kind: 'REVIEW', label: issue ? 'Review project issue' : 'Open project', href: `/dashboard/properties/${propertyId}/projects/${project.id}` },
      secondaryCtas: [], feedbackControls: DEFAULT_FEEDBACK,
      relatedJourneyId: project.guidanceJourneyId ?? null,
      createdAt: project.createdAt.toISOString(), lastEvaluatedAt: project.updatedAt.toISOString(),
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

// ---------------------------------------------------------------------------
// Home Digital Twin (Slice 3: contextual Home Actions for missing facts and
// material planning windows). Both loaders only surface what the twin and
// capital timeline already computed — neither recomputes anything here.
// ---------------------------------------------------------------------------

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
      projectedFacts: {
        where: { factState: { in: ['INFERRED', 'CONFLICTED', 'DEFAULT', 'UNKNOWN'] } },
        select: { factState: true, correctionDestination: true },
      },
    },
  });

  const needsAttention = components.flatMap((c) => c.projectedFacts);
  if (needsAttention.length === 0) return [];

  const conflictCount = needsAttention.filter((f) => f.factState === 'CONFLICTED').length;
  const singleDestination = needsAttention.length === 1 ? needsAttention[0].correctionDestination : null;

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
      : `${needsAttention.length} home fact${needsAttention.length === 1 ? '' : 's'} should be added or verified at its source.`,
    whyItMatters:
      'Your planning tools use these Home Record facts for timing and cost estimates — correcting the owning record keeps projections trustworthy.',
    recommendedAction: 'Review the flagged home facts',
    expectedOutcome: 'Canonical Home Record facts replace inferred or default projection values.',
    timing: {
      dueAt: null,
      windowStart: null,
      windowEnd: null,
      rationale: 'Low urgency — review whenever convenient.',
    },
    evidence: [{
      id: twin.id,
      type: 'SYSTEM_DERIVATION',
      label: 'Home Digital Twin projection',
      source: 'Home Record',
      observedAt: twin.updatedAt.toISOString(),
      freshness: 'CURRENT',
      confidence: 1,
    }],
    assumptions: [],
    options: [],
    tradeoffs: [],
    confidence: { score: 1, label: 'HIGH', missing: [] },
    governance: lowConsequenceGovernance('home-digital-twin-fact-review-v1'),
    primaryCta: {
      kind: 'CORRECT_FACT',
      label: 'Review home facts',
      href: singleDestination ?? `/dashboard/properties/${propertyId}`,
    },
    secondaryCtas: [],
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
      items: {
        where: { priority: 'HIGH' },
        orderBy: { windowStart: 'asc' },
        take: 3,
        select: {
          id: true, category: true, windowStart: true, windowEnd: true,
          estimatedCostMinCents: true, estimatedCostMaxCents: true, confidence: true, why: true,
        },
      },
    },
  });
  if (!analysis || analysis.items.length === 0) return [];

  return analysis.items.map((item) => {
    const costRange = item.estimatedCostMinCents != null && item.estimatedCostMaxCents != null
      ? `$${Math.round(item.estimatedCostMinCents / 100).toLocaleString()}–$${Math.round(item.estimatedCostMaxCents / 100).toLocaleString()}`
      : null;
    const windowLabel = item.windowStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const categoryLabel = CAPITAL_TIMELINE_CATEGORY_LABEL[item.category] ?? 'System';
    const confidenceScore = CAPITAL_TIMELINE_CONFIDENCE_SCORE[item.confidence] ?? 0.5;
    const governance = materialFinancialGovernance('home-capital-timeline-window-v1');
    const decisionContract = guidanceDecisionContract(governance);

    return adaptHomeActionSource('SYSTEM', {
      id: `home-capital-timeline-window:${item.id}`,
      propertyId,
      lineageId: `home-capital-timeline-window:${item.id}`,
      sourceEntityId: item.id,
      sourceVersion: analysis.computedAt.toISOString(),
      job: 'MAJOR_MOMENT',
      state: 'OPEN',
      priority: 'PLAN',
      signal: `${categoryLabel} replacement window is approaching (${windowLabel}).`,
      whyItMatters: item.why,
      recommendedAction: 'Review the capital timeline for this system',
      expectedOutcome: costRange
        ? `A planning range (${costRange}) to budget or reserve against before this window arrives.`
        : 'A planning window to budget or reserve against before it arrives.',
      timing: {
        dueAt: null,
        windowStart: item.windowStart.toISOString(),
        windowEnd: item.windowEnd.toISOString(),
        rationale: "Reflects the capital timeline's predicted replacement window, not a fixed deadline.",
      },
      evidence: [{
        id: item.id,
        type: 'SYSTEM_DERIVATION',
        label: 'Capital Timeline projection',
        source: 'Home Capital Timeline',
        observedAt: analysis.computedAt.toISOString(),
        freshness: 'CURRENT',
        confidence: confidenceScore,
      }],
      ...decisionContract,
      confidence: { score: confidenceScore, label: item.confidence as 'LOW' | 'MEDIUM' | 'HIGH', missing: [] },
      governance,
      primaryCta: {
        kind: 'REVIEW',
        label: 'Review capital timeline',
        href: `/dashboard/properties/${propertyId}/tools/capital-timeline`,
      },
      secondaryCtas: [],
      feedbackControls: ['DISMISS', 'SNOOZE', 'NOT_RELEVANT'],
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

  const matches = await db.propertyHiddenAssetMatch.findMany({
    where: {
      propertyId,
      status: { in: ['DETECTED', 'VIEWED', 'PURSUING'] },
      confidenceLevel: 'HIGH',
      outcomes: { none: {} },
      program: { isActive: true, reviewStatus: 'PUBLISHED' },
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
          lastVerifiedAt: true, applicationWindowClosesAt: true, currency: true,
        },
      },
    },
  });

  return matches.map((match) => {
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
      feedbackControls: DEFAULT_FEEDBACK,
      relatedJourneyId: null,
      createdAt: match.firstDetectedAt.toISOString(),
      lastEvaluatedAt: match.lastEvaluatedAt.toISOString(),
    });
  });
}

export async function getPromotedHomeActions(
  propertyId: string,
  db: HomeActionSourceDb = prisma,
  options: {
    includePersonalization?: boolean;
    environmentInsights?: readonly EnvironmentInsight[];
    evaluatedAt?: Date;
  } = {},
): Promise<{
  actions: HomeAction[];
  diagnostics: { candidateCount: number; suppressedCount: number; snoozedCount: number };
}> {
  const incidentActions = await loadIncidentActions(propertyId, db);
  const activeWeatherIncidentIds = new Set(incidentActions
    .filter((action) => action.evidence.some((evidence) => evidence.source.includes('National Weather Service')))
    .map((action) => action.source.entityId));
  const environmentActions = adaptEnvironmentInsightsToHomeActions(
    propertyId,
    options.environmentInsights ?? [],
    incidentActions,
    options.evaluatedAt,
  );
  const groups = await Promise.all([
    loadGuidanceActions(propertyId, db, activeWeatherIncidentIds), Promise.resolve(incidentActions),
    loadRecallActions(propertyId, db), loadCoverageActions(propertyId, db),
    loadProjectActions(propertyId, db), loadSeasonalChecklistActions(propertyId, db),
    options.includePersonalization === false ? Promise.resolve([]) : loadPersonalizationActions(propertyId, db),
    loadRefinanceDataRequiredActions(propertyId, db),
    loadHomeDigitalTwinFactReviewActions(propertyId, db),
    loadHomeCapitalTimelineMaterialWindowActions(propertyId, db),
    loadPropertyTaxAppealCaseActions(propertyId, db),
    loadSavingsBenefitsActions(propertyId, db),
    Promise.resolve(environmentActions),
  ]);
  const candidates = groups.flat();
  if (candidates.length === 0) {
    return { actions: [], diagnostics: { candidateCount: 0, suppressedCount: 0, snoozedCount: 0 } };
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
      candidateCount: candidates.length,
      suppressedCount: new Set(terminalEvents.map((item) => item.actionKey)).size,
      snoozedCount: new Set(activeSnoozes.map((item) => item.actionKey)).size,
    },
  };
}
