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

const DEFAULT_FEEDBACK: HomeAction['feedbackControls'] = [
  'COMPLETE', 'DEFER', 'SNOOZE', 'DISMISS', 'ALREADY_DONE', 'NOT_RELEVANT', 'CORRECT_FACT',
];

export type HomeActionSourceDb = Pick<typeof prisma,
  'guidanceJourney' | 'incident' | 'recallMatch' | 'coverageAnalysis' | 'projectRecord' |
  'seasonalChecklist' | 'personalizedRecommendation' | 'orchestrationActionEvent' | 'orchestrationActionSnooze'>;

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
      inventoryItem: { select: { name: true, assetType: true, category: true } },
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
    const governance = guidanceGovernance(step, journey.templateVersion ?? 'phase4-v1');
    const responseStatus = resolveRecommendationResponseStatus({
      confidence,
      missingFacts: journey.missingContextKeys,
    });
    const recommendationResponse = buildRecommendationResponseContract({
      status: responseStatus,
      safetyTier: governance.safetyTier,
      missingFacts: journey.missingContextKeys,
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
    const isCoverageJourney = journey.journeyTypeKey === 'coverage_gap_resolution';
    const correctionLabel = isCoverageJourney ? 'Add coverage information' : 'Add home information';
    const correctionHref = isCoverageJourney && journey.inventoryItemId
      ? `/dashboard/properties/${propertyId}/inventory/items/${encodeURIComponent(journey.inventoryItemId)}/coverage`
      : `/dashboard/properties/${propertyId}/onboarding`;
    const href = resolveGuidanceHref({
      propertyId,
      journeyId: journey.id,
      itemId: journey.inventoryItemId,
      routePath: step?.routePath ?? null,
    });
    return adaptHomeActionSource('GUIDANCE', {
      id: `guidance:${journey.id}`,
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
      whyItMatters: step?.description ?? 'This active journey preserves the evidence and decisions needed for the next home outcome.',
      recommendedAction: recommendationResponse.materialActionAllowed
        ? step?.label ?? 'Continue this home decision'
        : recommendationResponse.safeNextAction,
      withheldRecommendedAction: subjectLabel
        ? isCoverageJourney
          ? `Add coverage information for ${subjectLabel}`
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
      confidence: { score: confidence, label: confidenceLabel(confidence), missing: journey.missingContextKeys },
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
  const analyses = await db.coverageAnalysis.findMany({
    where: { propertyId, status: 'READY', overallVerdict: { not: 'NOT_WORTH_IT' } },
    orderBy: { computedAt: 'desc' },
    take: 10,
    include: { property: { select: { state: true } } },
  });
  return analyses.map((analysis) => {
    const material = analysis.impactLevel === 'HIGH';
    return adaptHomeActionSource('COVERAGE', {
      id: `coverage:${analysis.id}`,
      propertyId, lineageId: `coverage:${analysis.inventoryItemId ?? 'property'}`, sourceEntityId: analysis.id,
      sourceVersion: analysis.computedAt.toISOString(), state: 'OPEN', priority: material ? 'SOON' : 'PLAN',
      signal: analysis.summary ?? `Coverage review: ${analysis.overallVerdict.toLowerCase().replace(/_/g, ' ')}`,
      whyItMatters: analysis.strategicAdvice ?? 'Coverage gaps can shift repair or replacement cost to the household.',
      recommendedAction: 'Review coverage assumptions and available options',
      expectedOutcome: 'Make a deliberate coverage decision with the current policy, warranty, and exposure context visible.',
      timing: { dueAt: null, windowStart: analysis.computedAt.toISOString(), windowEnd: null, rationale: 'Review before the next covered loss, renewal, or material purchase decision.' },
      evidence: [{ id: analysis.id, type: 'SYSTEM_DERIVATION', label: 'Coverage analysis', source: 'Coverage intelligence', observedAt: analysis.computedAt.toISOString(), freshness: 'CURRENT', confidence: analysis.confidence === 'HIGH' ? 0.9 : analysis.confidence === 'MEDIUM' ? 0.7 : 0.45 }],
      assumptions: [{ key: 'analysis-current', label: 'Analysis currency', value: `Computed ${analysis.computedAt.toISOString()}`, source: 'SYSTEM_DEFAULT', editable: true }],
      options: [
        { id: 'keep-current', label: 'Keep current coverage', summary: 'Accept the current protection and retained exposure.', recommended: false },
        { id: 'review-options', label: 'Review coverage options', summary: 'Compare policy, warranty, self-insurance, and mitigation options.', recommended: true },
      ],
      tradeoffs: [
        { optionId: 'keep-current', dimension: 'RISK', summary: 'Keeps current cost but retains identified exposure.' },
        { optionId: 'review-options', dimension: 'COST', summary: 'May increase near-term cost or effort while reducing retained exposure.' },
      ],
      confidence: { score: analysis.confidence === 'HIGH' ? 0.9 : analysis.confidence === 'MEDIUM' ? 0.7 : 0.45, label: analysis.confidence, missing: [] },
      governance: {
        ...lowConsequenceGovernance(), safetyTier: 'REGULATED_COVERAGE',
        professionalBoundary: 'Coverage guidance is educational and does not replace advice from a licensed insurance professional or the controlling policy language.',
        jurisdictionCheck: {
          status: 'VERIFIED',
          jurisdiction: analysis.property.state,
          checkedAt: analysis.computedAt.toISOString(),
          source: 'Coverage analysis property jurisdiction',
        },
      },
      primaryCta: { kind: 'COMPARE', label: 'Review coverage', href: `/dashboard/properties/${propertyId}/tools/coverage-intelligence` },
      secondaryCtas: [{ kind: 'CORRECT_FACT', label: 'Correct coverage facts', href: `/dashboard/properties/${propertyId}/inventory?filter=missing-coverage` }],
      feedbackControls: DEFAULT_FEEDBACK, relatedJourneyId: null,
      createdAt: analysis.createdAt.toISOString(), lastEvaluatedAt: analysis.updatedAt.toISOString(),
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

export async function getPromotedHomeActions(
  propertyId: string,
  db: HomeActionSourceDb = prisma,
  options: { includePersonalization?: boolean } = {},
): Promise<{
  actions: HomeAction[];
  diagnostics: { candidateCount: number; suppressedCount: number; snoozedCount: number };
}> {
  const incidentActions = await loadIncidentActions(propertyId, db);
  const activeWeatherIncidentIds = new Set(incidentActions
    .filter((action) => action.evidence.some((evidence) => evidence.source.includes('National Weather Service')))
    .map((action) => action.source.entityId));
  const groups = await Promise.all([
    loadGuidanceActions(propertyId, db, activeWeatherIncidentIds), Promise.resolve(incidentActions),
    loadRecallActions(propertyId, db), loadCoverageActions(propertyId, db),
    loadProjectActions(propertyId, db), loadSeasonalChecklistActions(propertyId, db),
    options.includePersonalization === false ? Promise.resolve([]) : loadPersonalizationActions(propertyId, db),
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
