import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  adaptHomeActionSource,
  ensureHomeActionPresentation,
  homeActionLaunchEligibilityReasons,
  type HomeAction,
} from '../productFramework';
import { prisma } from '../lib/prisma';
import { emitHomeActionsSurfaced, emitNorthStarLineageEvent } from './analytics';
import {
  getActivationFirstValue,
  getEntryContext,
  recordFirstActionResolution,
} from './entryContext.service';
import { getOrchestrationSummary } from './orchestration.service';
import { recordOrchestrationEvent } from './orchestrationEvent.service';
import { publishOrchestrationSnoozeSignal, snoozeAction } from './orchestrationSnooze.service';
import { filterGroundedHomeActions, getPromotedHomeActions } from './homeActionSourcePromotion.service';
import { BuyerAcquisitionService } from './buyerAcquisition.service';
import { NewHomeSetupService } from './newHomeSetup.service';
import { reconcileActiveMaintenanceTaskWork } from './maintenanceTaskCanonicalReconciliation.service';
import { getGuidanceJourneyDisplayTitle } from './guidanceEngine/guidanceTemplateRegistry';
import { guidanceFinancialContextService } from './guidanceEngine/guidanceFinancialContext.service';
import { getHomeAssetDisplayLabel, resolveCanonicalAssetLabel } from '../productFramework/homeAssetDisplay';
import { materializeRecommendationsForProperty } from '../modules/personalization/application/materializeRecommendations.usecase';
import { getAggregationPropertyContext } from './aggregationContext/context';
import { getContextCompleteness } from '../modules/propertyContext/application/getContextCompleteness';
import {
  applyPersonalizationHomeActionLifecycle,
  type PersonalizationHomeCommand,
} from '../modules/personalization/application/applyHomeActionLifecycle.usecase';
import { logger } from '../lib/logger';
import { visibleInventoryItemWhere } from './riskAssetApplicability';
import { detectCoverageGaps } from './coverageGap.service';
import { markPropertyAsHavingNoMortgage } from './financing.service';
import {
  buildInventoryCoveragePresentation,
  type InventoryCoveragePresentation,
} from './inventoryCoverageState.service';
import { getEnvironmentReportForProperty } from './environmentReport.service';
import { buildHomeFirstValueInsight } from './environment/environmentHomeOutlook.service';
import {
  CAPABILITY_RECOMMENDATION_VERSION,
  canonicalCapabilityRegistry,
  type CapabilitySuggestionResponse,
} from '../productFramework/capabilities';
import {
  getCapabilitySuggestionsFromAuthorizedSources,
} from './capabilityRecommendation.service';
import { capabilityRecommendationsEnabled } from './capabilityPromotionPolicy.service';
import { ownershipCostDecisionService } from './ownershipCosts/ownershipCostDecision.service';
import { resolvePropertyAccess } from './propertyAccess.service';
import { invokeReadSkillOperationForConsumer } from './skills/skillConsumerRuntime';
import {
  applyCoverageActionLifecyclePolicy,
  coverageActionRuntimePolicy,
} from './coverageLifecycle.service';
import { proposeWorkItemFromHomeAction } from '../modules/homeOperations/adapters/homeActionWorkItem.adapter';
import { resolveAndUpsertWorkItem } from '../modules/homeOperations/application/resolveWorkItem.usecase';
import { recordReconciliationFailure } from '../modules/homeOperations/infrastructure/reconciliationRepository';
import { hasAcceptedWorkItemForProperty } from '../modules/homeOperations/application/hasAcceptedWorkItem.usecase';
import { snoozeWorkItem } from '../modules/homeOperations/application/snoozeWorkItem.usecase';
import { transitionWorkItem } from '../modules/homeOperations/application/transitionWorkItem.usecase';
import { markWorkItemUnderstood, recordWorkEvent } from '../modules/homeOperations/infrastructure/workItemRepository';
import type { OperationalWorkItemAcceptanceState, OperationalWorkItemDisposition, OperationalWorkItemState, Prisma } from '@prisma/client';
import { SOURCE_KINDS_WITHOUT_COMPLETION_ADAPTER } from './intelligence/homeActionAdapterOwnership';
import {
  OWNERSHIP_COST_CHANGE_ID_PREFIX,
  ACTIVATION_ID_PREFIX,
  OPERATIONAL_WORK_ID_PREFIX,
} from './intelligence/homeActionProducerOwnership';
import {
  completeAcceptedOperationalWorkItem,
  CompletionEvidencePolicyViolationError,
  UnsupportedWorkItemCompletionError,
} from './homeActionCompletion.service';
import { COMPLETION_EVIDENCE_POLICY } from './intelligence/completionEvidencePolicy.registry';
import {
  resolveDecisionFamilyRef,
  resolveHomeActionDecisionLineage,
  resolveActionDecisionLineagePolicy,
  startOrResumeHomeActionDecisionThread,
  unavailableDecisionLineage,
  assertHomeActionDecisionLineageSatisfiedForCommitment,
  type HomeActionDecisionLineage,
} from './decisionPlatform/homeActionDecisionLineage';
import { getSuppressedHomeActionIds } from './decisionPlatform/homeActionUsefulnessFeedback.service';
import { REPAIR_REPLACE_PROFILES } from './agents/repairReplaceProfileCatalog';
export { capabilityRecommendationsEnabled } from './capabilityPromotionPolicy.service';

export const HOME_ACTION_COMMANDS = [
  'COMPLETE',
  'DEFER',
  'SNOOZE',
  'DISMISS',
  'ALREADY_DONE',
  'NOT_RELEVANT',
  'NO_MORTGAGE',
  'CORRECT_FACT',
  'ACKNOWLEDGE',
  'REMOVE_FROM_HOME',
] as const;

// Completion-adapter ownership per source kind (SOURCE_KINDS_WITHOUT_COMPLETION_ADAPTER)
// is now declared once in ./intelligence/homeActionAdapterOwnership.ts, alongside
// work-key eligibility — see that file for the Home Intelligence FRD Phase 0 rationale.

export const HomeActionCommandSchema = z.object({
  command: z.enum(HOME_ACTION_COMMANDS),
  reason: z.string().trim().min(1).max(1000).nullable().optional(),
  nextTriggerAt: z.string().datetime().nullable().optional(),
  consequenceAcknowledged: z.boolean().default(false),
  // Home Intelligence Functional Completeness FRD Phase 4 (HI-OUT-002/003).
  // Only meaningful for COMPLETE/ALREADY_DONE; whether they're actually
  // required depends on the action's safetyTier (completionEvidencePolicy
  // .registry.ts), checked in executeHomeActionCommand once the action is
  // loaded, not here — this schema stays permissive.
  completionCostCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  completionObservedResult: z.enum(['CONFIRMED_HEALTHY', 'NEEDS_ATTENTION', 'FAILED']).nullable().optional(),
  // Home Intelligence Functional Completeness FRD Phase 4 review finding 2
  // gap fix (HI-OUT-003): the rest of the richer completion field set.
  completionDate: z.string().datetime().nullable().optional(),
  completionFulfillmentMode: z.enum(['DIY', 'PROVIDER']).nullable().optional(),
  completionProviderName: z.string().trim().max(200).nullable().optional(),
  completionNotes: z.string().trim().max(2000).nullable().optional(),
  completionFollowUpNeeded: z.boolean().optional(),
  completionPhotoDocumentIds: z.array(z.string()).max(20).optional(),
}).superRefine((value, ctx) => {
  if (['DEFER', 'SNOOZE'].includes(value.command) && !value.nextTriggerAt) {
    ctx.addIssue({
      code: 'custom',
      path: ['nextTriggerAt'],
      message: `${value.command} requires a next trigger date.`,
    });
  }
  if (
    ['DEFER', 'DISMISS', 'NOT_RELEVANT', 'NO_MORTGAGE', 'REMOVE_FROM_HOME'].includes(value.command) &&
    !value.consequenceAcknowledged
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['consequenceAcknowledged'],
      message: `${value.command} requires consequence acknowledgement.`,
    });
  }
});

export const HomeActionInteractionSchema = z.object({
  interaction: z.literal('OPENED'),
});

export type UnifiedHomeCapabilitySuggestions =
  CapabilitySuggestionResponse & {
    status: 'AVAILABLE' | 'DISABLED' | 'UNAVAILABLE';
  };

function emptyUnifiedHomeCapabilitySuggestions(input: {
  status: 'DISABLED' | 'UNAVAILABLE';
  contextVersion: string;
  generatedAt: string;
}): UnifiedHomeCapabilitySuggestions {
  return {
    status: input.status,
    contractVersion: 'capability-suggestions-v1',
    registryVersion: canonicalCapabilityRegistry.version,
    recommendationVersion: CAPABILITY_RECOMMENDATION_VERSION,
    contextVersion: input.contextVersion,
    generatedAt: input.generatedAt,
    surface: 'HOME',
    suggestions: [],
  };
}

export async function getUnifiedHomeCapabilitySuggestions(input: {
  propertyId: string;
  userId: string;
  propertyContext: Awaited<ReturnType<typeof getAggregationPropertyContext>>;
  actions: RankedHomeAction[];
}, options: {
  enabled?: boolean;
  now?: () => Date;
  evaluate?: typeof getCapabilitySuggestionsFromAuthorizedSources;
} = {}): Promise<UnifiedHomeCapabilitySuggestions> {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString();
  if (!(options.enabled ?? capabilityRecommendationsEnabled())) {
    return emptyUnifiedHomeCapabilitySuggestions({
      status: 'DISABLED',
      contextVersion: input.propertyContext.contextVersion,
      generatedAt,
    });
  }
  try {
    const response = await (
      options.evaluate ?? getCapabilitySuggestionsFromAuthorizedSources
    )({
      propertyId: input.propertyId,
      userId: input.userId,
      surface: 'HOME',
      limit: 3,
      propertyContext: input.propertyContext,
      actions: input.actions,
    });
    return { status: 'AVAILABLE', ...response };
  } catch (error) {
    logger.warn(
      { err: error, propertyId: input.propertyId, userId: input.userId },
      'Unified Home capability suggestions failed closed',
    );
    return emptyUnifiedHomeCapabilitySuggestions({
      status: 'UNAVAILABLE',
      contextVersion: input.propertyContext.contextVersion,
      generatedAt,
    });
  }
}

export type HomeActionCommandInput = z.infer<typeof HomeActionCommandSchema>;

type RankingComponents = {
  consequence: number;
  urgency: number;
  confidence: number;
  householdRelevance: number;
  actionability: number;
  missingContextPenalty: number;
};

// Home Operations Slice 2: the durable identity a work-item-eligible action
// resolved to (see homeActionWorkItem.adapter.ts). Additive presentation
// annotation on the ranked response, not a change to the core HomeAction
// Zod contract other consumers rely on. null for advisory/recommendation
// -only sources (PERSONALIZATION/SYSTEM/SAVINGS_BENEFITS) and for a
// work-item-eligible action whose resolution failed this request.
export type HomeActionWorkItemLink = {
  id: string;
  workKey: string;
  state: OperationalWorkItemState;
  acceptanceState: OperationalWorkItemAcceptanceState;
  disposition: OperationalWorkItemDisposition | null;
};

export type RankedHomeAction = HomeAction & {
  ranking: {
    rank: number;
    score: number;
    explanation: string;
    components: RankingComponents;
  };
  deduplication: {
    canonicalKey: string;
    mergedActionIds: string[];
  };
  workItem: HomeActionWorkItemLink | null;
  // Home Intelligence Functional Completeness FRD Phase 3A (HI-DEC-002).
  // Additive presentation annotation, same pattern as workItem above — null
  // for the overwhelming majority of actions that have no registered
  // decision family at all (see resolveDecisionFamilyRef).
  decisionLineage: HomeActionDecisionLineage | null;
  // Home Intelligence Functional Completeness FRD Phase 7 (HI-FBK-002 /
  // HI-ATT-003): "a 'not useful' response in Cozy shall be visible to the
  // Home feed policy immediately." Before this field existed,
  // getSuppressedHomeActionIds() was only ever consulted by the Ask/Cozy
  // PRIORITY_LIST path and proactive notification delivery — Home, Fix, and
  // getUnifiedHome all read this same feed directly and never saw the
  // signal, so a "not useful" rating given in Cozy was invisible everywhere
  // else. Computed once here so every surface that reads getHomeActionFeed
  // sees the identical decoration — display-only, never filters the feed
  // or overrides a SAFETY_EMERGENCY floor (mapConsumerPriorityCategory
  // already hard-floors that independently of this flag).
  fatigueSuppressed: boolean;
};

// ── Home Operations Item #12 (§5.16): empty-state reason ────────────────────
//
// "No actions" can mean several very different things, and the doc's
// requirement is explicit: "Do not translate system silence into a
// home-health guarantee." This is a pure, synchronous decision function so
// it stays unit-testable without mocking the rest of this file's I/O graph.
// It only matters when the feed is empty — callers should only compute
// inputs for it inside that branch, since hasEverAcceptedWork requires an
// extra query best skipped on the common (non-empty) path.

export type HomeActionEmptyStateReason =
  | 'DATA_UNAVAILABLE'
  | 'RECOMMENDATIONS_PAUSED'
  | 'SOURCE_EVALUATION_PENDING'
  | 'MISSING_FACTS'
  | 'NO_ACCEPTED_WORK'
  | 'ALL_CAUGHT_UP';

// Judgment call, not a derived truth — no existing percent-threshold
// precedent elsewhere in this codebase. Revisit with product if it proves
// too aggressive/lax in practice.
const MISSING_FACTS_COMPLETENESS_THRESHOLD_PERCENT = 50;

export function computeHomeActionEmptyStateReason(input: {
  surfacedCount: number;
  candidateCount: number;
  personalizationStatus: 'AVAILABLE' | 'PAUSED' | 'FAILED';
  derivedFrom: { riskAssessment: boolean; checklist: boolean };
  contextCompletenessPercent: number | null;
  hasEverAcceptedWork: boolean;
}): HomeActionEmptyStateReason | null {
  if (input.surfacedCount > 0) return null;
  if (input.personalizationStatus === 'FAILED') return 'DATA_UNAVAILABLE';
  if (input.personalizationStatus === 'PAUSED') return 'RECOMMENDATIONS_PAUSED';
  if (input.candidateCount === 0 && !input.derivedFrom.riskAssessment && !input.derivedFrom.checklist) {
    return 'SOURCE_EVALUATION_PENDING';
  }
  if (
    input.contextCompletenessPercent !== null &&
    input.contextCompletenessPercent < MISSING_FACTS_COMPLETENESS_THRESHOLD_PERCENT
  ) {
    return 'MISSING_FACTS';
  }
  if (!input.hasEverAcceptedWork) return 'NO_ACCEPTED_WORK';
  return 'ALL_CAUGHT_UP';
}

const HOME_ACTION_PRIORITY_ORDER: Record<HomeAction['priority'], number> = {
  NOW: 0,
  SOON: 1,
  PLAN: 2,
  CONSIDER: 3,
};

const CONSEQUENCE_SCORE: Record<HomeAction['governance']['safetyTier'], number> = {
  SAFETY_EMERGENCY: 40,
  REGULATED_COVERAGE: 32,
  MATERIAL_FINANCIAL: 28,
  LOW_CONSEQUENCE: 12,
};

const URGENCY_SCORE: Record<HomeAction['priority'], number> = {
  NOW: 30,
  SOON: 22,
  PLAN: 12,
  CONSIDER: 4,
};

const JOB_SCORE: Record<HomeAction['job'], number> = {
  MAJOR_MOMENT: 12,
  DECIDE: 10,
  STAY_AHEAD: 8,
};

function normalizedSignal(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 160);
}

export function homeActionCanonicalKey(action: HomeAction): string {
  const inventoryCoverageAction = action.source.kind === 'COVERAGE' || (
    action.source.kind === 'GUIDANCE' &&
    action.governance.safetyTier === 'REGULATED_COVERAGE'
  );
  if (inventoryCoverageAction) return `coverage-item:${action.source.entityId}`;

  // A replacement decision for a specific inventory item is one homeowner
  // decision regardless of which producer surfaced it — the Lifespan Engine
  // repair-vs-replace verdict and the Home Capital Timeline replacement
  // window must not stack as two cards. Both carry the item id (one on
  // lineageId, one as the presentation subject / source.entityId); collapse
  // them onto a shared key so the signal-text heuristic can't split them.
  // See docs/product/HOME_ACTION_HEALTH_FACTOR_COPY_FRD.md §13.
  const replacementItemId = resolveReplacementDecisionItemId(action);
  if (replacementItemId) return `replacement-item:${replacementItemId}`;

  // A tracked physical asset with no inventory-item id — the smoke & CO
  // detectors, and any other first-class asset a producer names without an
  // item row. A risk "past service life" card and a maintenance "check" card
  // for the same detectors carry different signal text, so the signal
  // heuristic below splits them into two. Collapse producer-agnostic
  // service/lifecycle actions about the same known asset onto one key.
  // See docs/product/HOME_ACTION_HEALTH_FACTOR_COPY_FRD.md §16.
  if (!ASSET_SERVICE_KEY_EXCLUDED_SOURCE_KINDS.has(action.source.kind)) {
    const variant = action.presentation?.variant;
    const eligibleVariant = !variant || ASSET_SERVICE_KEY_ELIGIBLE_VARIANTS.has(variant);
    if (eligibleVariant) {
      const inventorySubject = action.presentation?.subject?.kind === 'INVENTORY_ITEM'
        ? action.presentation.subject.id.trim()
        : null;
      if (inventorySubject) return `asset-service-item:${inventorySubject}`;

      const assetLabel = resolveCanonicalAssetLabel(
        action.presentation?.subject?.label,
        action.evidence?.[0]?.label,
        action.source.entityId,
        action.signal,
      );
      if (assetLabel) return `asset-service:${normalizedSignal(assetLabel)}`;
    }
  }

  const signal = normalizedSignal(action.signal);
  if (signal) return `signal:${signal}`;
  if (action.lineageId) return `lineage:${action.lineageId}`;
  return `entity:${action.source.entityId}`;
}

// Coverage and recall each own their own dedup identity (coverage-item: above,
// and a recall is deliberately its own homeowner concern). Seasonal aggregate
// cards are counts, not per-asset. Everything else about a known asset is one
// "service this asset" concern regardless of which producer raised it.
const ASSET_SERVICE_KEY_EXCLUDED_SOURCE_KINDS = new Set<HomeAction['source']['kind']>(['COVERAGE', 'RECALL']);
const ASSET_SERVICE_KEY_ELIGIBLE_VARIANTS = new Set<NonNullable<HomeAction['presentation']>['variant']>([
  'ASSET_LIFECYCLE',
  'HEALTH_FACTOR_REVIEW',
  'HOME_FACT_REVIEW',
  'GENERIC_ACTION',
]);

/** The inventory item a replacement/lifecycle decision is about, or null. */
function resolveReplacementDecisionItemId(action: HomeAction): string | null {
  for (const prefix of REPAIR_REPLACE_PROFILES.flatMap((profile) => profile.lineagePrefixes)) {
    if (action.lineageId?.startsWith(prefix)) {
      const id = action.lineageId.slice(prefix.length).trim();
      return id || null;
    }
  }
  if (
    action.id.startsWith('home-capital-timeline-window:') &&
    action.presentation?.subject?.kind === 'INVENTORY_ITEM'
  ) {
    return action.presentation.subject.id.trim() || null;
  }
  return null;
}

type CoverageStateForHomeAction = Pick<InventoryCoveragePresentation, 'coverageState' | 'coverageActionable'>;

export function reconcileCoverageHomeActions(
  actions: HomeAction[],
  coverageByInventoryItemId: ReadonlyMap<string, CoverageStateForHomeAction>,
): HomeAction[] {
  return actions.filter((action) => {
    const isLiveCoverageReview = action.source.kind === 'COVERAGE';
    const isPolicyLevelReview = isLiveCoverageReview &&
      action.presentation?.variant === 'COVERAGE_REVIEW' &&
      action.presentation.subject?.kind === 'PROPERTY';
    // Policy-term reviews are already scoped to a verified current term and
    // an open evidence-backed gap. Inventory responsibility reconciliation
    // applies only to item-level coverage recommendations.
    if (isPolicyLevelReview) return true;
    const isCoverageGuidance = action.source.kind === 'GUIDANCE' &&
      action.governance.safetyTier === 'REGULATED_COVERAGE' &&
      coverageByInventoryItemId.has(action.source.entityId);
    if (!isLiveCoverageReview && !isCoverageGuidance) return true;

    const presentation = coverageByInventoryItemId.get(action.source.entityId);
    if (!presentation) return false;

    if (isLiveCoverageReview) {
      return presentation.coverageState === 'MISSING' && presentation.coverageActionable;
    }

    return presentation.coverageState === 'INCOMPLETE';
  });
}

export function selectEligibleActiveJourney<T extends { id: string }>(
  journeys: readonly T[],
  actions: readonly Pick<HomeAction, 'relatedJourneyId'>[],
): T | null {
  const eligibleJourneyIds = new Set(
    actions
      .map((action) => action.relatedJourneyId)
      .filter((id): id is string => Boolean(id)),
  );
  return journeys.find((journey) => eligibleJourneyIds.has(journey.id)) ?? null;
}

function formatMomentCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function humanizeCapitalTimelineCategory(category: string): string {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** For item-less journeys (no inventoryItemId), trace the originating signal back to what it's actually about — an incident, or a capital-timeline system/category. */
async function resolveJourneyMomentSubject(journey: {
  inventoryItemId?: string | null;
  contextSnapshotJson?: unknown;
  primarySignal?: { sourceEntityType: string | null; sourceEntityId: string | null; metadataJson: unknown } | null;
}): Promise<string | null> {
  if (journey.inventoryItemId) return null; // already named in the moment title via "for {item}"

  // User-initiated journeys (e.g. "Or describe it yourself") carry no signal at all —
  // their contextSnapshotJson.userNote is the user's own words, the most reliable subject available.
  const context = (journey.contextSnapshotJson && typeof journey.contextSnapshotJson === 'object' ? journey.contextSnapshotJson : {}) as Record<string, unknown>;
  if (typeof context.userNote === 'string' && context.userNote.trim()) {
    return context.userNote.trim();
  }

  const signal = journey.primarySignal;
  if (!signal) return null;

  const metadata = (signal.metadataJson && typeof signal.metadataJson === 'object' ? signal.metadataJson : {}) as Record<string, unknown>;
  if (typeof metadata.incidentTitle === 'string' && metadata.incidentTitle.trim()) {
    return metadata.incidentTitle.trim();
  }

  if (!signal.sourceEntityId) return null;

  if (signal.sourceEntityType === 'RESERVE_FUND_LINE_ITEM') {
    const timelineItem = await prisma.homeCapitalTimelineItem.findUnique({
      where: { id: signal.sourceEntityId },
      select: { category: true, inventoryItem: { select: { name: true } } },
    });
    if (timelineItem) {
      return timelineItem.inventoryItem?.name ?? humanizeCapitalTimelineCategory(timelineItem.category);
    }
  }

  if (signal.sourceEntityType === 'INCIDENT') {
    const incident = await prisma.incident.findUnique({
      where: { id: signal.sourceEntityId },
      select: { title: true },
    });
    if (incident?.title) return incident.title;
  }

  if (signal.sourceEntityType === 'NEGOTIATION_SHIELD_CASE') {
    const negotiationCase = await prisma.negotiationShieldCase.findUnique({
      where: { id: signal.sourceEntityId },
      select: { title: true },
    });
    if (negotiationCase?.title) return negotiationCase.title;
  }

  return null;
}

/** Homeowner-facing summary of what a guidance journey is actually about, so a bare display title (e.g. "Review a financial exposure") isn't shown without any grounding. */
async function buildJourneyMomentContext(journey: {
  inventoryItemId?: string | null;
  contextSnapshotJson?: unknown;
  derivedSnapshotJson?: unknown;
  primarySignal?: { sourceEntityType: string | null; sourceEntityId: string | null; metadataJson: unknown } | null;
}): Promise<string | null> {
  const subject = await resolveJourneyMomentSubject(journey);

  if (!journey.derivedSnapshotJson) return subject;
  const { upcomingCost, coverageImpact } = guidanceFinancialContextService.evaluate({ journey });
  if (upcomingCost <= 0) return subject;

  const amount = formatMomentCurrency(upcomingCost);
  const coverageNote =
    coverageImpact === 'NOT_COVERED'
      ? 'not covered by current policy or warranty'
      : coverageImpact === 'PARTIAL'
        ? 'coverage only partially confirmed'
        : 'coverage status not yet confirmed';

  return subject ? `${subject} — ${amount} at stake, ${coverageNote}.` : `${amount} at stake — ${coverageNote}.`;
}

async function loadCurrentCoverageStates(propertyId: string): Promise<Map<string, CoverageStateForHomeAction>> {
  const [items, responsibilities] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { propertyId, ...visibleInventoryItemWhere() },
      include: { warranty: true, insurancePolicy: true },
    }),
    prisma.propertyResponsibility.findMany({
      where: { propertyId },
      select: { scope: true, party: true },
    }),
  ]);

  return new Map(items.map((item) => {
    const presentation = buildInventoryCoveragePresentation(item, responsibilities);
    return [item.id, {
      coverageState: presentation.coverageState,
      coverageActionable: presentation.coverageActionable,
    }];
  }));
}

export function scoreHomeAction(action: HomeAction): { score: number; components: RankingComponents; explanation: string } {
  const confidence = Math.round((action.confidence.score ?? 0.5) * 10);
  const missingContextPenalty = Math.min(15, action.confidence.missing.length * 3);
  const actionability = action.primaryCta.href && action.primaryCta.label ? 8 : 0;
  const components: RankingComponents = {
    consequence: CONSEQUENCE_SCORE[action.governance.safetyTier],
    urgency: URGENCY_SCORE[action.priority],
    confidence,
    householdRelevance: JOB_SCORE[action.job],
    actionability,
    missingContextPenalty,
  };
  const score = components.consequence + components.urgency + components.confidence +
    components.householdRelevance + components.actionability - components.missingContextPenalty;
  const contextExplanation = missingContextPenalty > 0
    ? `${action.confidence.missing.length} missing context item${action.confidence.missing.length === 1 ? '' : 's'} lowered priority`
    : action.recommendationResponse.status !== 'AVAILABLE'
      ? 'source confidence is insufficient'
      : 'no missing-context penalty';
  const explanation = [
    `${action.priority === 'NOW' ? 'Immediate' : action.priority === 'SOON' ? 'Time-sensitive' : action.priority === 'PLAN' ? 'Plannable' : 'Optional'} timing`,
    `${action.governance.safetyTier.toLowerCase().replace(/_/g, ' ')} consequence`,
    `${action.confidence.label.toLowerCase()} confidence`,
    contextExplanation,
  ].join(' · ');
  return { score, components, explanation };
}

/** The date a timing becomes actionable — due date, else the end of its window. */
function timingActionableAtMs(timing: HomeAction['timing']): number | null {
  const candidate = timing.dueAt ?? timing.windowEnd ?? timing.windowStart;
  if (!candidate) return null;
  const ms = Date.parse(candidate);
  return Number.isNaN(ms) ? null : ms;
}

/** Prefers the timing that is actionable sooner; a real date beats "no date". */
function earlierTiming(a: HomeAction['timing'], b: HomeAction['timing']): HomeAction['timing'] {
  const aMs = timingActionableAtMs(a);
  const bMs = timingActionableAtMs(b);
  if (aMs === null) return bMs === null ? a : b;
  if (bMs === null) return a;
  return aMs <= bMs ? a : b;
}

export function rankAndDeduplicateHomeActions(actions: HomeAction[]): RankedHomeAction[] {
  const byCanonicalKey = new Map<string, {
    winner: HomeAction; score: ReturnType<typeof scoreHomeAction>; ids: string[]; timing: HomeAction['timing'];
  }>();

  for (const action of actions) {
    const canonicalKey = homeActionCanonicalKey(action);
    const scored = scoreHomeAction(action);
    const current = byCanonicalKey.get(canonicalKey);
    if (!current) {
      byCanonicalKey.set(canonicalKey, { winner: action, score: scored, ids: [action.id], timing: action.timing });
      continue;
    }
    current.ids.push(action.id);
    // A merged duplicate can carry a sooner window than the winner (two
    // producers projecting the same concern off different clocks). The
    // homeowner should see the earliest actionable date, not the winner's.
    current.timing = earlierTiming(current.timing, action.timing);
    if (scored.score > current.score.score ||
      (scored.score === current.score.score && action.id.localeCompare(current.winner.id) < 0)) {
      current.winner = action;
      current.score = scored;
    }
  }

  return [...byCanonicalKey.entries()]
    .sort(([, a], [, b]) =>
      HOME_ACTION_PRIORITY_ORDER[a.winner.priority] - HOME_ACTION_PRIORITY_ORDER[b.winner.priority] ||
      b.score.score - a.score.score ||
      a.winner.id.localeCompare(b.winner.id))
    .map(([canonicalKey, entry], index) => ({
      ...entry.winner,
      timing: entry.timing,
      ranking: { rank: index + 1, ...entry.score },
      deduplication: {
        canonicalKey,
        mergedActionIds: [...new Set(entry.ids)].filter((id) => id !== entry.winner.id),
      },
      workItem: null,
      decisionLineage: null,
      fatigueSuppressed: false,
    }));
}

/**
 * Home Operations Slice 2 identity resolver hook. Resolves a durable
 * OperationalWorkItem for every work-item-eligible action (best-effort — a
 * resolution failure must not break the Home page), then re-collapses the
 * ranked list a second time preferring the resolved workKey over the fuzzy
 * canonical-key text heuristic already applied by rankAndDeduplicateHomeActions
 * — two actions the signal-text heuristic failed to merge but that resolve
 * to the same durable obligation now collapse into one. Advisory/
 * recommendation-only sources (no work item) keep using their existing
 * canonical key, so signal-string dedup becomes the fallback, not the
 * primary identity.
 */
export async function linkWorkItemsAndReconcile(propertyId: string, actions: RankedHomeAction[]): Promise<RankedHomeAction[]> {
  const resolved = await Promise.all(actions.map(async (action) => {
    const proposal = proposeWorkItemFromHomeAction(action, propertyId);
    if (!proposal) return { action, workItem: null as HomeActionWorkItemLink | null };
    try {
      const item = await resolveAndUpsertWorkItem(proposal);
      return {
        action,
        workItem: { id: item.id, workKey: item.workKey, state: item.state, acceptanceState: item.acceptanceState, disposition: item.disposition },
      };
    } catch (err) {
      await recordReconciliationFailure({
        propertyId,
        operation: 'HOME_ACTION_RESOLVE',
        sourceType: proposal.source.sourceType,
        sourceEntityId: proposal.source.sourceEntityId,
        idempotencyKey: `home-action-resolve:${proposal.source.sourceType}:${proposal.source.sourceEntityId}`,
        payload: JSON.parse(JSON.stringify({
          proposal: {
            ...proposal,
            dueWindowStart: proposal.dueWindowStart?.toISOString() ?? null,
            dueAt: proposal.dueAt?.toISOString() ?? null,
            dueWindowEnd: proposal.dueWindowEnd?.toISOString() ?? null,
          },
        })) as Prisma.InputJsonValue,
        error: err,
      }).catch((ledgerError) => logger.error({ err: ledgerError, actionId: action.id, propertyId }, 'Unable to record Home Operations reconciliation failure'));
      logger.warn({ err, actionId: action.id, propertyId }, 'Home Operations work item resolution failed; action stays unlinked this request');
      return { action, workItem: null as HomeActionWorkItemLink | null };
    }
  }));

  const byKey = new Map<string, { winner: RankedHomeAction; workItem: HomeActionWorkItemLink | null; mergedIds: string[] }>();
  for (const { action, workItem } of resolved) {
    const key = workItem ? `work:${workItem.workKey}` : `canonical:${action.deduplication.canonicalKey}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { winner: action, workItem, mergedIds: [...action.deduplication.mergedActionIds, action.id] });
      continue;
    }
    current.mergedIds.push(action.id, ...action.deduplication.mergedActionIds);
    if (action.ranking.score > current.winner.ranking.score ||
      (action.ranking.score === current.winner.ranking.score && action.id.localeCompare(current.winner.id) < 0)) {
      current.winner = action;
      current.workItem = workItem ?? current.workItem;
    }
  }

  return [...byKey.values()]
    .sort((a, b) =>
      HOME_ACTION_PRIORITY_ORDER[a.winner.priority] - HOME_ACTION_PRIORITY_ORDER[b.winner.priority] ||
      b.winner.ranking.score - a.winner.ranking.score ||
      a.winner.id.localeCompare(b.winner.id))
    .map(({ winner, workItem, mergedIds }, index) => ({
      ...winner,
      ranking: { ...winner.ranking, rank: index + 1 },
      deduplication: {
        canonicalKey: workItem ? workItem.workKey : winner.deduplication.canonicalKey,
        mergedActionIds: [...new Set(mergedIds)].filter((id) => id !== winner.id),
      },
      workItem,
    }));
}

// Home Intelligence Functional Completeness FRD Phase 3 review finding 4.
// Material CTA kinds per HomeActionSchema's own superRefine (homeAction
// .contract.ts) -- a degraded action must not keep one of these, or the
// schema's own "degraded recommendations may expose only review, evidence,
// correction, or escalation actions" invariant would be violated even
// though nothing re-validates the mutated object at runtime.
const MATERIAL_CTA_KINDS: ReadonlySet<HomeAction['primaryCta']['kind']> =
  new Set(['START', 'SCHEDULE', 'COMPARE', 'SELECT_PROVIDER', 'PURCHASE', 'FINANCE']);

function degradeCtaForBlockedDecision<T extends HomeAction['primaryCta']>(cta: T): T {
  return MATERIAL_CTA_KINDS.has(cta.kind) ? { ...cta, kind: 'REVIEW' } : cta;
}

/**
 * Home Intelligence Functional Completeness FRD Phase 3 review finding 4.
 * A DECISION_REQUIRED action with no working lineage must not offer its
 * normal commit CTA -- downgrades it the same way a degraded
 * RecommendationResponseContract already requires (DATA_UNAVAILABLE +
 * materialActionAllowed: false), reusing that existing contract rather
 * than inventing a parallel "blocked" concept.
 */
function degradeActionForBlockedDecision(action: RankedHomeAction): RankedHomeAction {
  return {
    ...action,
    primaryCta: degradeCtaForBlockedDecision(action.primaryCta),
    secondaryCtas: action.secondaryCtas.map(degradeCtaForBlockedDecision),
    recommendationResponse: {
      status: 'DATA_UNAVAILABLE',
      safetyTier: action.governance.safetyTier,
      reasonCode: 'DECISION_LINEAGE_UNAVAILABLE',
      message: 'This material recommendation needs a tracked decision, and none is available yet for this type of recommendation.',
      safeNextAction: 'Review the available evidence and verify independently with a qualified professional before committing.',
      missingFacts: [],
      retryable: false,
      materialActionAllowed: false,
    },
  };
}

// Lineage statuses that mean "no working Decision Thread lineage exists for
// this DECISION_REQUIRED action" -- NOT_APPLICABLE is included: for a
// DECISION_REQUIRED action, the one registered family not covering this
// specific item is functionally the same absence of lineage as no family
// existing at all (Phase 3 review finding 4).
const BLOCKING_DECISION_LINEAGE_STATUSES = new Set(['AMBIGUOUS', 'UNAVAILABLE', 'NOT_APPLICABLE']);

/**
 * Home Intelligence Functional Completeness FRD Phase 3A/Phase 3 review
 * finding 4. Read-only decision-lineage resolution and fail-closed
 * enforcement — mirrors linkWorkItemsAndReconcile's shape but never
 * creates a Decision Thread, so it's safe to run on every Home feed
 * render. resolveActionDecisionLineagePolicy (not safetyTier alone)
 * decides whether an action needs lineage at all; a DECISION_REQUIRED
 * action with no working lineage gets degraded to a safe review-only CTA
 * instead of silently keeping its commit CTA.
 */
export async function linkDecisionLineage(propertyId: string, actions: RankedHomeAction[]): Promise<RankedHomeAction[]> {
  return Promise.all(actions.map(async (action) => {
    const policy = resolveActionDecisionLineagePolicy(action);
    if (policy.kind !== 'DECISION_REQUIRED') return action;
    if (!policy.decisionDefinitionId) {
      // No decision family is registered for this recommendation type at
      // all -- nothing to look up, fail closed immediately. Phase 3 review
      // finding 1: decisionLineage must still be set here, or the frontend
      // falls through to its ungated plain-link render path.
      return degradeActionForBlockedDecision({
        ...action,
        decisionLineage: unavailableDecisionLineage(null, 'No decision-family adapter is registered for this recommendation type.'),
      });
    }
    const ref = resolveDecisionFamilyRef(action);
    if (!ref) {
      return degradeActionForBlockedDecision({
        ...action,
        decisionLineage: unavailableDecisionLineage(null, 'This recommendation could not be resolved to a decision family.'),
      });
    }
    try {
      const decisionLineage = await resolveHomeActionDecisionLineage(propertyId, ref);
      const withLineage = { ...action, decisionLineage };
      return BLOCKING_DECISION_LINEAGE_STATUSES.has(decisionLineage.status)
        ? degradeActionForBlockedDecision(withLineage)
        : withLineage;
    } catch (err) {
      logger.warn({ err, actionId: action.id, propertyId }, 'Decision lineage resolution failed; action degraded to a safe review CTA this request');
      return degradeActionForBlockedDecision({
        ...action,
        decisionLineage: unavailableDecisionLineage(ref, 'Decision lineage could not be resolved right now.'),
      });
    }
  }));
}

type AcceptedOperationalWorkCopyInput = {
  title: string;
  expectedOutcome: string;
  state: OperationalWorkItemState;
};

/**
 * Accepted work stores an outcome separately from its task identity. Keep the
 * outcome in the supporting copy instead of promoting it to the card title.
 * The legacy maintenance outcome is normalized here so existing database rows
 * are corrected immediately without requiring a backfill.
 */
export function acceptedOperationalWorkHomeCopy(item: AcceptedOperationalWorkCopyInput) {
  if (item.state === 'REPORTED_COMPLETE') {
    return {
      recommendedAction: `Verify completion: ${item.title}`,
      expectedOutcome: 'Completion was reported and is waiting for verification.',
      primaryCtaLabel: 'Review completion',
    };
  }

  const legacyCompletedOutcome = item.expectedOutcome.trim().toLowerCase() ===
    'the task is completed and recorded.';
  return {
    recommendedAction: item.title,
    expectedOutcome: legacyCompletedOutcome
      ? 'Complete the task and record the outcome.'
      : item.expectedOutcome,
    primaryCtaLabel: 'Open work',
  };
}

/** @homeActionProducer Appends accepted-work Home Actions to the supplied feed array. */
async function appendAcceptedOperationalWork(
  propertyId: string,
  actions: RankedHomeAction[],
): Promise<RankedHomeAction[]> {
  const represented = new Set(actions.flatMap((action) => action.workItem ? [action.workItem.id] : []));
  const items = await prisma.operationalWorkItem.findMany({
    where: {
      propertyId,
      acceptanceState: 'ACCEPTED',
      state: { notIn: ['VERIFIED', 'CLOSED'] },
      supersededByWorkItemId: null,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }],
    },
    include: { executions: true },
  });
  const projected: RankedHomeAction[] = [];
  for (const item of items) {
    if (represented.has(item.id)) continue;
    const primaryExecution = item.executions.find((entry) => entry.role === 'PRIMARY') ?? item.executions[0];
    // Home Intelligence Functional Completeness FRD Phase 4 (HI-OUT-002).
    // Only a maintenance-backed item routes to a real completion adapter
    // this slice (see homeActionCompletion.service.ts). The "Mark done"
    // control is offered whenever the policy allows attestation at all
    // (LOW_CONSEQUENCE and MATERIAL_FINANCIAL) -- the frontend collects
    // cost/observed-result before submitting when the policy requires it.
    // REGULATED_COVERAGE/SAFETY_EMERGENCY (attestation INSUFFICIENT) keep
    // using the existing "Manage action" evidence drawer instead of a
    // control that would only reject the request server-side.
    const completionEvidencePolicy = COMPLETION_EVIDENCE_POLICY.find((entry) => entry.safetyTier === item.safetyTier);
    const completionEligible = primaryExecution?.executionType === 'MAINTENANCE_TASK' &&
      item.state !== 'REPORTED_COMPLETE' &&
      completionEvidencePolicy?.attestation !== 'INSUFFICIENT';
    const sourceKind: HomeAction['source']['kind'] = primaryExecution?.executionType === 'PROJECT'
      ? 'PROJECT'
      : primaryExecution?.executionType === 'GUIDANCE'
        ? 'GUIDANCE'
        : 'MAINTENANCE';
    const href = `/dashboard/properties/${propertyId}/home-operations?focusWorkItemId=${encodeURIComponent(item.id)}`;
    const material = item.safetyTier === 'MATERIAL_FINANCIAL' || item.safetyTier === 'REGULATED_COVERAGE';
    const displayCopy = acceptedOperationalWorkHomeCopy(item);
    const now = new Date().toISOString();
    const homeAction = adaptHomeActionSource(sourceKind, {
      id: `operational-work:${item.id}`,
      propertyId,
      lineageId: `operational-work:${item.id}`,
      sourceEntityId: primaryExecution?.executionEntityId ?? item.id,
      sourceVersion: item.sourceVersion,
      state: item.state === 'DEFERRED' ? 'DEFERRED' : item.state === 'IN_PROGRESS' || item.state === 'IN_PROJECT' || item.state === 'IN_GUIDANCE' ? 'IN_PROGRESS' : 'OPEN',
      priority: item.priority,
      signal: item.title,
      whyItMatters: item.homeownerReason,
      recommendedAction: displayCopy.recommendedAction,
      expectedOutcome: displayCopy.expectedOutcome,
      presentation: {
        variant: 'ACCEPTED_WORK',
        eyebrow: item.state === 'REPORTED_COMPLETE' ? 'Completion reported' : 'Accepted work',
        headline: displayCopy.recommendedAction.slice(0, 180),
        summary: item.homeownerReason.slice(0, 320),
        whyNow: item.homeownerReason.slice(0, 500),
        keyFacts: [
          { label: 'Task', value: item.title.slice(0, 240) },
          { label: 'Work state', value: String(item.state).toLowerCase().replace(/_/g, ' ') },
          {
            label: 'Due',
            value: item.dueAt ? new Intl.DateTimeFormat('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            }).format(item.dueAt) : 'Not scheduled',
          },
          {
            label: 'Execution',
            value: primaryExecution
              ? `${String(primaryExecution.executionType).toLowerCase().replace(/_/g, ' ')} · ${primaryExecution.executionEntityId}`.slice(0, 240)
              : 'Home Operations work record',
          },
        ],
        factGroups: [],
        subject: { kind: 'WORK_ITEM', id: item.id, label: item.title.slice(0, 180) },
        detailLabel: 'Why this work?',
        group: null,
      },
      timing: {
        dueAt: item.dueAt?.toISOString() ?? null,
        windowStart: item.dueWindowStart?.toISOString() ?? null,
        windowEnd: item.dueWindowEnd?.toISOString() ?? null,
        rationale: item.dueAt ? 'This timing comes from your accepted work plan.' : 'This accepted work remains active until its execution record is resolved.',
      },
      evidence: [{
        id: item.id,
        type: 'SYSTEM_DERIVATION',
        label: 'Accepted Home Operations work',
        source: 'Operational Work Item',
        observedAt: item.updatedAt.toISOString(),
        freshness: 'CURRENT',
        confidence: item.confidence,
      }],
      assumptions: material ? [{ key: 'execution-scope', label: 'Execution scope', value: 'Review the linked work record before committing funds or coverage changes.', source: 'UNKNOWN', editable: true }] : [],
      options: material ? [
        { id: 'continue', label: 'Continue the accepted plan', summary: 'Open the linked execution and review its current scope.', recommended: true },
        { id: 'review', label: 'Review before continuing', summary: 'Pause execution and confirm facts, scope, and professional advice.', recommended: false },
      ] : [],
      tradeoffs: material ? [{ optionId: 'continue', dimension: 'TIMING', summary: 'Continuing may preserve timing, while reviewing may reduce decision risk.' }] : [],
      confidence: { score: item.confidence, label: item.confidence != null && item.confidence >= 0.8 ? 'HIGH' : item.confidence != null && item.confidence >= 0.5 ? 'MEDIUM' : 'LOW', missing: item.missingContext },
      governance: {
        safetyTier: item.safetyTier,
        professionalBoundary: item.safetyTier === 'LOW_CONSEQUENCE' ? null : 'Use the linked governed execution path and an appropriate qualified professional for material, regulated, or safety work.',
        jurisdictionCheck: item.safetyTier === 'REGULATED_COVERAGE'
          ? { status: 'VERIFIED', jurisdiction: 'Recorded on accepted work', checkedAt: (item.acceptedAt ?? item.updatedAt).toISOString(), source: 'Accepted Home Operations governance record' }
          : { status: 'NOT_REQUIRED', jurisdiction: null, checkedAt: null, source: null },
        conservativeFallback: item.safetyTier === 'SAFETY_EMERGENCY' ? 'Pause work and avoid the affected area if there may be immediate danger.' : null,
        emergencyEscalation: item.safetyTier === 'SAFETY_EMERGENCY' ? 'For immediate danger, leave the area and contact emergency services or the appropriate utility.' : null,
        commercialDisclosure: { involvesCommercialAction: false, relationshipType: 'NONE', compensationMayOccur: false, rankingInfluenced: false, summary: 'No provider ranking is created by this portfolio projection.', selectionCriteria: [], nonCommercialAlternatives: [] },
        reviewedBy: [],
        policyVersion: 'home-operations-v1',
      },
      primaryCta: { kind: item.safetyTier === 'SAFETY_EMERGENCY' ? 'ESCALATE' : 'REVIEW', label: displayCopy.primaryCtaLabel, href },
      secondaryCtas: [],
      feedbackControls: completionEligible
        ? ['CORRECT_FACT', 'SNOOZE', 'COMPLETE', 'ALREADY_DONE']
        : ['CORRECT_FACT', 'SNOOZE'],
      relatedJourneyId: primaryExecution?.executionType === 'GUIDANCE' ? primaryExecution.executionEntityId : null,
      createdAt: item.createdAt.toISOString(),
      lastEvaluatedAt: now,
    });
    projected.push({
      ...homeAction,
      ranking: { rank: 0, score: 0, explanation: 'Accepted work continuity', components: { consequence: 0, urgency: 0, confidence: 0, householdRelevance: 0, actionability: 0, missingContextPenalty: 0 } },
      deduplication: { canonicalKey: item.workKey, mergedActionIds: [] },
      workItem: { id: item.id, workKey: item.workKey, state: item.state, acceptanceState: item.acceptanceState, disposition: item.disposition },
      decisionLineage: null,
      fatigueSuppressed: false,
    });
  }
  return [...actions, ...projected]
    .sort((a, b) => HOME_ACTION_PRIORITY_ORDER[a.priority] - HOME_ACTION_PRIORITY_ORDER[b.priority] || b.ranking.score - a.ranking.score)
    .map((action, index) => ({ ...action, ranking: { ...action.ranking, rank: index + 1 } }));
}

export function appendHomeActionLaunchContext(
  href: string,
  action: Pick<HomeAction, 'id' | 'propertyId' | 'source' | 'presentation' | 'relatedJourneyId'> & {
    workItem?: HomeActionWorkItemLink | null;
  },
  contextVersion: string | null,
): string {
  // Do not decorate official/external resources. The continuity contract is
  // for ContractToCozy destinations that can resolve the source Home action.
  if (!href.startsWith('/')) return href;
  const destination = new URL(href, 'https://contracttocozy.local');
  const setIfMissing = (key: string, value: string | null | undefined) => {
    if (value && !destination.searchParams.has(key)) destination.searchParams.set(key, value);
  };
  setIfMissing('launchSurface', 'unified_home');
  setIfMissing('propertyId', action.propertyId);
  setIfMissing('sourceActionId', action.id);
  setIfMissing('sourceEntityType', action.source.kind);
  setIfMissing('sourceEntityId', action.source.entityId);
  setIfMissing('recommendationReason', action.presentation?.variant ?? `HOME_ACTION_${action.source.kind}`);
  setIfMissing('recommendationVersion', action.source.version ?? 'phase2-v1');
  setIfMissing('contextVersion', contextVersion ?? action.source.version ?? 'home-action-v1');
  setIfMissing('journeyId', action.relatedJourneyId);
  setIfMissing('originWorkItemId', action.workItem?.id);
  setIfMissing(
    'itemId',
    action.presentation?.subject?.kind === 'INVENTORY_ITEM'
      ? action.presentation.subject.id
      : null,
  );
  setIfMissing('returnTo', `/dashboard?propertyId=${encodeURIComponent(action.propertyId)}`);
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function addHomeActionLaunchContinuity(
  actions: RankedHomeAction[],
  contextVersion: string | null,
): RankedHomeAction[] {
  return actions.map((action) => ({
    ...action,
    primaryCta: {
      ...action.primaryCta,
      href: appendHomeActionLaunchContext(action.primaryCta.href, action, contextVersion),
    },
    secondaryCtas: action.secondaryCtas.map((cta) => ({
      ...cta,
      href: appendHomeActionLaunchContext(cta.href, action, contextVersion),
    })),
  }));
}

export async function getHomeActionFeed(propertyId: string, userId: string) {
  // Day-91 handoff is idempotent and runs at the standard Home-feed boundary,
  // so the property does not depend on a buyer dashboard or a separate cron.
  await BuyerAcquisitionService.ensureRecurringHandoff(userId, propertyId).catch(() => null);
  await NewHomeSetupService.ensureRecurringHandoff(userId, propertyId).catch(() => null);
  // HI-ATT-008: PropertyMaintenanceTask is the ownership-care authority.
  // Heal legacy/raw system writes before materializing the shared feed so an
  // active task cannot notify or appear on Maintenance while disappearing
  // from Home, Fix, and Cozy's canonical action/work projection.
  await reconcileActiveMaintenanceTaskWork(propertyId);
  const environmentReportPromise = getEnvironmentReportForProperty(propertyId, userId).catch((error) => {
    logger.warn({ err: error, propertyId, userId }, 'Unified Home environment insight evaluation failed closed');
    return null;
  });
  const orchestration = await getOrchestrationSummary(propertyId, userId);
  let personalization: Awaited<ReturnType<typeof materializeRecommendationsForProperty>> | null = null;
  let personalizationStatus: 'AVAILABLE' | 'PAUSED' | 'FAILED' = 'AVAILABLE';
  try {
    personalization = await materializeRecommendationsForProperty(propertyId, 'HOME_READ', userId);
    if (personalization.paused) personalizationStatus = 'PAUSED';
  } catch (error) {
    personalizationStatus = 'FAILED';
    logger.warn({ err: error, propertyId, userId }, 'Unified Home personalization materialization failed closed');
  }
  const environmentReport = await environmentReportPromise;
  const firstValueInsight = buildHomeFirstValueInsight(environmentReport);
  const promoted = await getPromotedHomeActions(propertyId, prisma, {
    includePersonalization: Boolean(personalization && !personalization.paused),
    environmentInsights: environmentReport?.insights ?? [],
    propertyLabel: environmentReport
      ? environmentReport.property.name?.trim() ||
        [environmentReport.property.address, environmentReport.property.city, environmentReport.property.state]
          .filter(Boolean).join(', ')
      : 'This property',
    userId,
  });
  const rawCandidates: HomeAction[] = [...orchestration.homeActions, ...promoted.actions];
  const entryContext = await getEntryContext(propertyId, userId);

  if (entryContext && !entryContext.firstValue.firstActionResolvedAt) {
    const activation = await getActivationFirstValue(propertyId, userId);
    rawCandidates.push(activation.action);
    for (const bucket of Object.values(activation.plan)) rawCandidates.push(...bucket);
  }

  const presentedCandidates = rawCandidates.map(ensureHomeActionPresentation);
  const initiallyGrounded = filterGroundedHomeActions(presentedCandidates, {
    propertyId,
    userId,
    source: 'home_action_feed_grounding_gate',
  });
  const runtimePolicy = coverageActionRuntimePolicy(userId);
  const governedCoverage = applyCoverageActionLifecyclePolicy(initiallyGrounded.actions, {
    rolloutEnabled: runtimePolicy.rollout.enabled,
    killSwitchEnabled: runtimePolicy.killSwitchEnabled,
    ruleSourceStatus: runtimePolicy.ruleSourceStatus,
  });
  const coverageStates = await loadCurrentCoverageStates(propertyId);
  const candidates = reconcileCoverageHomeActions(governedCoverage.actions, coverageStates);
  const coverageConflictSuppressedCount = governedCoverage.actions.length - candidates.length;

  const linkedActions = await linkWorkItemsAndReconcile(propertyId, rankAndDeduplicateHomeActions(candidates));
  const actionsWithDecisions = await linkDecisionLineage(propertyId, linkedActions);
  const actionsWithAcceptedWork = await appendAcceptedOperationalWork(propertyId, actionsWithDecisions);
  const actionsWithContinuity = addHomeActionLaunchContinuity(
    actionsWithAcceptedWork,
    orchestration.aggregationContext?.contextVersion ?? null,
  );
  const finalEligibility = filterGroundedHomeActions(actionsWithContinuity, {
    propertyId,
    userId,
    source: 'home_action_final_eligibility_gate',
    additionalReasons: homeActionLaunchEligibilityReasons,
  });
  const rankedActions = (finalEligibility.actions as RankedHomeAction[]).map((action, index) => ({
    ...action,
    ranking: { ...action.ranking, rank: index + 1 },
  }));
  const fatigueSuppressedIds = await getSuppressedHomeActionIds({
    userId,
    propertyId,
    homeActionIds: rankedActions.map((action) => action.id),
  });
  const actions = rankedActions.map((action) => ({
    ...action,
    fatigueSuppressed: fatigueSuppressedIds.has(action.id),
  }));
  emitHomeActionsSurfaced({ propertyId, userId, actions, source: 'phase2_home_actions' });
  for (const action of actions) {
    for (const supersededActionId of action.deduplication.mergedActionIds) {
      emitNorthStarLineageEvent({
        eventType: 'HOME_ACTION_SUPERSEDED',
        propertyId,
        userId,
        source: 'phase2_home_action_deduplication',
        entryId: `home:${propertyId}`,
        triggerId: `trigger:home-action:${action.lineageId}`,
        signalId: action.lineageId,
        actionId: supersededActionId,
        recommendationVersion: action.source.version ?? 'phase2-v1',
        resolutionReason: `Superseded by canonical action ${action.id}.`,
      });
    }
  }

  // Home Operations Item #12 (§5.16): only computed when the feed is empty —
  // hasEverAcceptedWork is an extra query, deliberately skipped on the
  // common (non-empty) path.
  let emptyStateReason: HomeActionEmptyStateReason | null = null;
  if (actions.length === 0) {
    const hasEverAcceptedWork = await hasAcceptedWorkItemForProperty(propertyId);
    emptyStateReason = computeHomeActionEmptyStateReason({
      surfacedCount: actions.length,
      candidateCount: rawCandidates.length,
      personalizationStatus,
      derivedFrom: orchestration.derivedFrom,
      contextCompletenessPercent: orchestration.aggregationContext?.completeness.completenessPercent ?? null,
      hasEverAcceptedWork,
    });
  }

  return {
    contractVersion: 'phase2-v1',
    propertyId,
    generatedAt: new Date().toISOString(),
    actions,
    firstValueInsight,
    buckets: {
      NOW: actions.filter((action) => action.priority === 'NOW'),
      SOON: actions.filter((action) => action.priority === 'SOON'),
      PLAN: actions.filter((action) => action.priority === 'PLAN'),
      CONSIDER: actions.filter((action) => action.priority === 'CONSIDER'),
    },
    diagnostics: {
      candidateCount: rawCandidates.length,
      surfacedCount: actions.length,
      duplicateCount: candidates.length - actions.length,
      suppressedCount: orchestration.suppressedActions.length + promoted.diagnostics.suppressedCount + governedCoverage.suppressedCount + coverageConflictSuppressedCount,
      coverageConflictSuppressedCount,
      coverageLifecycle: {
        actionPromotionEnabled: governedCoverage.decision.enabled,
        blockers: governedCoverage.decision.blockers,
        rolloutCohort: runtimePolicy.rollout.cohort,
      },
      snoozedCount: orchestration.snoozedActions.length + promoted.diagnostics.snoozedCount,
      promotedCount: promoted.actions.length,
      personalization: {
        status: personalizationStatus,
        evaluatedCount: personalization?.evaluated ?? 0,
        activeCount: personalization?.active ?? 0,
      },
      emptyStateReason,
      // Truth containment: a bare suppressedCount cannot answer "why isn't
      // this on Home?" — the homeowner (or support) needs to see that the
      // work is already tracked elsewhere, not silently dropped. Capped to
      // keep the payload bounded; suppressedCount above remains the total.
      hiddenBecauseTrackedElsewhere: orchestration.suppressedActions.slice(0, 20).map((action) => ({
        title: action.title,
        reasons: action.suppression.reasons.map((entry) => ({
          reason: entry.reason,
          message: entry.message,
          relatedType: entry.relatedType ?? null,
        })),
      })),
    },
  };
}

export async function recordHomeActionOpened(propertyId: string, actionId: string, userId: string) {
  const feed = await getHomeActionFeed(propertyId, userId);
  const action = feed.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new Error('Home action was not found or is no longer actionable.');
  emitNorthStarLineageEvent({
    eventType: 'HOME_ACTION_OPENED',
    propertyId,
    userId,
    source: 'phase2_home',
    entryId: `home:${propertyId}`,
    triggerId: `trigger:home-action:${action.lineageId}`,
    signalId: action.lineageId,
    actionId: action.id,
    recommendationVersion: action.source.version ?? 'phase2-v1',
    journeyId: action.relatedJourneyId,
  });
  if (action.workItem) {
    const understoodAt = new Date();
    await markWorkItemUnderstood(action.workItem.id, understoodAt);
    await recordWorkEvent({
      workItemId: action.workItem.id,
      eventType: 'WORK_UNDERSTOOD',
      actorType: 'USER',
      actorUserId: userId,
      idempotencyKey: `understood:${action.workItem.id}:${userId}`,
      occurredAt: understoodAt,
      payload: { actionId: action.id },
    });
  }

  // HI-DEC-002: opening a decision-family-eligible Home Action is the
  // genuine "starting a material recommendation" moment — create or resume
  // the Decision Thread and persist a Recommendation Snapshot now, before
  // the homeowner reaches a compare/commit surface, rather than on every
  // passive Home feed render (linkDecisionLineage above stays read-only).
  let decisionLineage: HomeActionDecisionLineage | null = null;
  const openPolicy = resolveActionDecisionLineagePolicy(action);
  if (openPolicy.kind === 'DECISION_REQUIRED') {
    const decisionFamilyRef = resolveDecisionFamilyRef(action);
    if (decisionFamilyRef) {
      // Phase 3 review item 3: capture which Home Action, at which source
      // version and Property Context version, triggered this creation — see
      // decisionFamilyAdapter.ts's HomeActionOriginRef.
      const contextVersion = await getAggregationPropertyContext(propertyId, userId, 'UNIFIED_HOME')
        .then((context) => context.contextVersion)
        .catch(() => null);
      decisionLineage = await startOrResumeHomeActionDecisionThread({
        propertyId,
        userId,
        ref: decisionFamilyRef,
        homeActionOrigin: {
          homeActionId: action.id,
          lineageId: action.lineageId,
          sourceEntityId: action.source.entityId,
          sourceVersion: action.source.version,
          contextVersion,
        },
      });
    } else {
      // Phase 3 review finding 1: this action requires lineage but resolves
      // to no registered decision family -- report UNAVAILABLE rather than
      // null, so the frontend's click-time block (shouldBlockNavigationForLineage)
      // still fires even though the feed-render-time gate already caught this.
      decisionLineage = unavailableDecisionLineage(null, 'No decision-family adapter is registered for this recommendation type.');
    }
  }

  return { actionId, interaction: 'OPENED' as const, recordedAt: new Date().toISOString(), decisionLineage };
}

export async function getUnifiedHome(propertyId: string, userId: string) {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access) throw new Error('Property not found or access denied.');
  const propertyRead = invokeReadSkillOperationForConsumer({
    consumer: 'HOME_ACTIONS',
    operationId: 'PROPERTY_SUMMARY',
    role: access.role,
    execute: () => prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        dwellingType: true,
        yearBuilt: true,
        propertySize: true,
        bedrooms: true,
        bathrooms: true,
        heatingType: true,
        coolingType: true,
        roofType: true,
        updatedAt: true,
      },
    }),
  });
  const feedRead = getHomeActionFeed(propertyId, userId);
  const [feed, property, inventory, documentCount, verifiedDocumentCount, recentEvents, activeProject, activeJourneyCandidates, propertyContextSnapshot] =
    await Promise.all([
      feedRead,
      propertyRead,
      prisma.inventoryItem.findMany({
        where: { propertyId, ...visibleInventoryItemWhere() },
        select: {
          id: true,
          name: true,
          category: true,
          isVerified: true,
          warrantyId: true,
          insurancePolicyId: true,
          coverageNotRequired: true,
          updatedAt: true,
        },
      }),
      prisma.document.count({ where: { propertyId } }),
      prisma.document.count({ where: { propertyId, verificationStatus: 'VERIFIED' } }),
      prisma.homeEvent.findMany({
        where: { propertyId },
        orderBy: { occurredAt: 'desc' },
        take: 3,
        select: { id: true, title: true, summary: true, type: true, importance: true, occurredAt: true },
      }),
      prisma.projectRecord.findFirst({
        where: { propertyId, status: { in: ['PLANNING', 'IN_PROGRESS', 'PAUSED', 'DISPUTED'] } },
        orderBy: { updatedAt: 'desc' },
        include: {
          milestones: {
            where: { status: { not: 'COMPLETE' } },
            orderBy: { position: 'asc' },
            take: 1,
          },
          issues: {
            where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'ESCALATED'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.guidanceJourney.findMany({
        where: { propertyId, status: 'ACTIVE' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: {
          inventoryItem: { select: { name: true, assetType: true, category: true } },
          primarySignal: { select: { sourceEntityType: true, sourceEntityId: true, metadataJson: true } },
          steps: {
            where: { status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] } },
            orderBy: { stepOrder: 'asc' },
            take: 1,
          },
        },
      }),
      getAggregationPropertyContext(propertyId, userId, 'UNIFIED_HOME'),
    ]);

  if (!property) throw new Error('Property not found or access denied.');

  const contextCompleteness = getContextCompleteness(propertyContextSnapshot);
  const knownPropertyFacts = contextCompleteness.scopes.reduce((sum, scope) => sum + scope.knownFacts, 0);
  const missingPropertyFacts = contextCompleteness.scopes.reduce((sum, scope) => sum + scope.missingFactKeys.length, 0);
  const conflictedPropertyFacts = contextCompleteness.scopes.reduce((sum, scope) => sum + scope.conflictedFactKeys.length, 0);
  const stalePropertyFacts = contextCompleteness.scopes.reduce((sum, scope) => sum + scope.staleFactKeys.length, 0);
  const recordCompleteness = contextCompleteness.completenessPercent;
  const coverageGapCount = (await detectCoverageGaps(propertyId)).length;
  const capabilitySuggestions = await getUnifiedHomeCapabilitySuggestions({
    propertyId,
    userId,
    propertyContext: propertyContextSnapshot,
    actions: feed.actions,
  });

  const topAttentionActions = feed.actions.slice(0, 5);
  const attentionActionIds = new Set(topAttentionActions.map((action) => action.id));
  const decisions = feed.actions
    .filter((action) => action.job === 'DECIDE' ||
      ['MATERIAL_FINANCIAL', 'REGULATED_COVERAGE'].includes(action.governance.safetyTier))
    .filter((action) => !attentionActionIds.has(action.id))
    .slice(0, 3);

  const projectMilestone = activeProject?.milestones[0] ?? null;
  const projectIssue = activeProject?.issues[0] ?? null;
  const activeJourney = selectEligibleActiveJourney(activeJourneyCandidates, feed.actions);
  const journeyStep = activeJourney?.steps[0] ?? null;
  const activeJourneyMomentContext =
    !activeProject && activeJourney ? await buildJourneyMomentContext(activeJourney) : null;
  const activeMajorMoment = activeProject
    ? {
        kind: 'PROJECT' as const,
        id: activeProject.id,
        title: activeProject.name,
        stage: activeProject.status,
        context: null,
        blocker: projectIssue?.description ?? null,
        nextMilestone: projectMilestone?.name ?? 'Review project status',
        href: `/dashboard/properties/${propertyId}/projects/${activeProject.id}`,
      }
    : activeJourney
      ? {
          kind: 'GUIDANCE_JOURNEY' as const,
          id: activeJourney.id,
          title: activeJourney.inventoryItem
            ? `${getGuidanceJourneyDisplayTitle(activeJourney.journeyTypeKey, activeJourney.issueType)} for ${getHomeAssetDisplayLabel(activeJourney.inventoryItem)}`
            : getGuidanceJourneyDisplayTitle(activeJourney.journeyTypeKey, activeJourney.issueType),
          stage: activeJourney.decisionStage,
          context: activeJourneyMomentContext,
          blocker: journeyStep?.status === 'BLOCKED' ? journeyStep.description ?? journeyStep.label : null,
          nextMilestone: journeyStep?.label ?? 'Continue the current decision',
          href: `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${encodeURIComponent(activeJourney.id)}`,
        }
      : null;

  return {
    contractVersion: 'phase2-home-v1',
    property: {
      id: property.id,
      name: property.name ?? property.address,
      address: `${property.address}, ${property.city}, ${property.state} ${property.zipCode}`,
      dwellingType: property.dwellingType,
      updatedAt: property.updatedAt.toISOString(),
    },
    propertyContext: {
      contextVersion: contextCompleteness.contextVersion,
      scopes: propertyContextSnapshot.scopes,
      completenessPercent: recordCompleteness,
      knownFactCount: knownPropertyFacts,
      missingFactCount: missingPropertyFacts,
      conflictedFactCount: conflictedPropertyFacts,
      staleFactCount: stalePropertyFacts,
      warningCount: propertyContextSnapshot.warnings.length,
    },
    attention: {
      actions: feed.actions,
      totalCount: feed.actions.length,
      planHref: `/dashboard/properties/${propertyId}/home-operations`,
      firstValueInsight: feed.firstValueInsight,
    },
    decisions,
    capabilitySuggestions,
    activeMajorMoment,
    glance: {
      recordCompleteness,
      knownPropertyFacts,
      trackedSystems: inventory.length,
      verifiedSystems: inventory.filter((item) => item.isVerified).length,
      documentCount,
      verifiedDocumentCount,
      coverageGapCount,
      openWorkCount: feed.actions.length,
      recentChanges: recentEvents.map((event) => ({
        ...event,
        occurredAt: event.occurredAt.toISOString(),
      })),
      recordHref: `/dashboard/properties/${propertyId}`,
      systemsHref: `/dashboard/properties/${propertyId}/inventory`,
      coverageHref: `/dashboard/properties/${propertyId}/inventory?tab=items&smart=gaps`,
      workHref: `/dashboard/properties/${propertyId}/home-operations`,
    },
    diagnostics: feed.diagnostics,
    generatedAt: new Date().toISOString(),
  };
}

function validateNextTriggerAt(value: string | null | undefined): Date {
  const date = new Date(value ?? '');
  const max = new Date();
  max.setDate(max.getDate() + 365);
  if (!value || Number.isNaN(date.getTime()) || date <= new Date() || date > max) {
    throw new Error('The next trigger date must be in the future and within 365 days.');
  }
  return date;
}

function resolutionDisposition(command: HomeActionCommandInput['command']) {
  if (command === 'COMPLETE' || command === 'ALREADY_DONE') return 'COMPLETED' as const;
  if (command === 'DEFER' || command === 'SNOOZE') return 'INTENTIONALLY_DEFERRED' as const;
  if (command === 'ACKNOWLEDGE') return 'ACKNOWLEDGED' as const;
  return 'DELIBERATELY_DISMISSED' as const;
}

export async function executeHomeActionCommand(
  propertyId: string,
  actionId: string,
  userId: string,
  rawInput: unknown,
) {
  const input = HomeActionCommandSchema.parse(rawInput);
  const feed = await getHomeActionFeed(propertyId, userId);
  const action = feed.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new Error('Home action was not found or is no longer actionable.');
  if (!action.feedbackControls.includes(input.command)) {
    throw new Error(`${input.command} is not supported for this home action.`);
  }
  if (
    ['COMPLETE', 'ALREADY_DONE'].includes(input.command) &&
    SOURCE_KINDS_WITHOUT_COMPLETION_ADAPTER.has(action.source.kind) &&
    // ownership-cost-change, activation, and accepted-maintenance-work
    // actions are routed to a real completion adapter below by id prefix —
    // declared as isKindLevelCompletionException entries in
    // homeActionProducerOwnership.ts, not part of the untracked-source guard.
    !action.id.startsWith(OWNERSHIP_COST_CHANGE_ID_PREFIX) &&
    !action.id.startsWith(ACTIVATION_ID_PREFIX) &&
    !action.id.startsWith(OPERATIONAL_WORK_ID_PREFIX)
  ) {
    throw new Error(
      `${input.command} is not supported for this home action; use ACKNOWLEDGE instead.`,
    );
  }
  if (action.governance.safetyTier === 'SAFETY_EMERGENCY' &&
    ['DEFER', 'DISMISS', 'NOT_RELEVANT'].includes(input.command)) {
    throw new Error('Safety and emergency actions cannot be deferred or dismissed from the default action feed.');
  }
  // Phase 3 review finding 2: independently reject COMPLETE/ALREADY_DONE
  // for any DECISION_REQUIRED action without LINKED lineage, regardless of
  // which domain-specific handler this command would otherwise route to —
  // see assertHomeActionDecisionLineageSatisfiedForCommitment's doc comment.
  if (['COMPLETE', 'ALREADY_DONE'].includes(input.command)) {
    assertHomeActionDecisionLineageSatisfiedForCommitment(action);
  }

  emitNorthStarLineageEvent({
    eventType: 'HOME_ACTION_ACTED',
    propertyId,
    userId,
    source: 'phase2_home_action_command',
    entryId: `home:${propertyId}`,
    triggerId: `trigger:home-action:${action.lineageId}`,
    signalId: action.lineageId,
    actionId: action.id,
    recommendationVersion: action.source.version ?? 'phase2-v1',
    journeyId: action.relatedJourneyId,
    resolutionReason: input.command,
  });

  if (input.command === 'CORRECT_FACT') {
    const correction = [action.primaryCta, ...action.secondaryCtas]
      .find((cta) => cta.kind === 'CORRECT_FACT');
    return {
      actionId,
      command: input.command,
      state: action.state,
      correctionHref: correction?.href ?? `/dashboard/properties/${propertyId}/onboarding`,
      recordedAt: new Date().toISOString(),
    };
  }

  const reason = input.reason ?? `${input.command.toLowerCase().replace(/_/g, ' ')} from Home`;
  const nextTriggerAt = ['DEFER', 'SNOOZE'].includes(input.command)
    ? validateNextTriggerAt(input.nextTriggerAt)
    : null;

  // Apply portfolio controls to the durable obligation, not merely to the
  // current winning projection ID. Source-specific lifecycle handling below
  // still runs so recommendation feedback remains reconciled.
  if (action.workItem) {
    if (input.command === 'SNOOZE' && nextTriggerAt) {
      await snoozeWorkItem({
        workItemId: action.workItem.id,
        snoozedUntil: nextTriggerAt,
        actorUserId: userId,
        idempotencyKey: `home-action-snooze:${action.workItem.id}:${nextTriggerAt.toISOString()}`,
      });
    } else if (input.command === 'DEFER' && nextTriggerAt && action.workItem.acceptanceState === 'ACCEPTED') {
      await transitionWorkItem({
        workItemId: action.workItem.id,
        to: 'DEFERRED',
        actorType: 'USER',
        actorUserId: userId,
        idempotencyKey: `home-action-defer:${action.workItem.id}:${nextTriggerAt.toISOString()}`,
        timestampValue: nextTriggerAt,
      });
    } else if (
      ['DISMISS', 'NOT_RELEVANT', 'REMOVE_FROM_HOME'].includes(input.command) &&
      action.workItem.state === 'CANDIDATE'
    ) {
      await transitionWorkItem({
        workItemId: action.workItem.id,
        to: 'CLOSED',
        disposition: input.command === 'NOT_RELEVANT' ? 'NOT_RELEVANT' : 'DISMISSED',
        actorType: 'USER',
        actorUserId: userId,
        idempotencyKey: `home-action-disposition:${action.workItem.id}:${input.command}`,
      });
    }
  }

  // Home Intelligence Functional Completeness FRD Phase 4 (HI-OUT-001/002/
  // 004/005/006). Only appendAcceptedOperationalWork's re-projected accepted
  // work carries this id prefix — see homeActionCompletion.service.ts for
  // why this routes through PropertyMaintenanceTaskService rather than
  // transitioning the work item directly.
  if (action.id.startsWith(OPERATIONAL_WORK_ID_PREFIX) && action.workItem &&
    (input.command === 'COMPLETE' || input.command === 'ALREADY_DONE')) {
    try {
      const result = await completeAcceptedOperationalWorkItem({
        workItemId: action.workItem.id,
        propertyId,
        userId,
        safetyTier: action.governance.safetyTier,
        decisionLineage: action.decisionLineage,
        costCents: input.completionCostCents ?? null,
        observedResult: input.completionObservedResult ?? null,
        completedAt: input.completionDate ?? null,
        fulfillmentMode: input.completionFulfillmentMode ?? null,
        providerName: input.completionProviderName ?? null,
        notes: input.completionNotes ?? null,
        followUpNeeded: input.completionFollowUpNeeded ?? false,
        photoDocumentIds: input.completionPhotoDocumentIds ?? [],
      });
      return {
        actionId,
        command: input.command,
        state: 'COMPLETED' as const,
        alreadyComplete: result.alreadyComplete,
        recordedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof CompletionEvidencePolicyViolationError || error instanceof UnsupportedWorkItemCompletionError) {
        throw new Error(error.message);
      }
      throw error;
    }
  }

  if (action.id.startsWith(OWNERSHIP_COST_CHANGE_ID_PREFIX)) {
    const sourceChangeId = action.id.slice(OWNERSHIP_COST_CHANGE_ID_PREFIX.length);
    const ownershipAction = input.command === 'COMPLETE' || input.command === 'ALREADY_DONE'
      ? 'RESOLVE'
      : input.command === 'DEFER' || input.command === 'SNOOZE'
        ? 'SNOOZE'
        : input.command === 'NOT_RELEVANT'
          ? 'NO_ACTION'
          : 'DISMISS';
    const decision = await ownershipCostDecisionService.record(
      propertyId,
      userId,
      {
        action: ownershipAction,
        sourceChangeId,
        sourceActionId: action.id,
        reason,
        revisitAt: nextTriggerAt?.toISOString() ?? null,
        recommendationSnapshotId: action.decisionLineage?.status === 'LINKED'
          ? action.decisionLineage.thread.currentRecommendationSnapshotId
          : null,
      },
    );
    return {
      actionId,
      command: input.command,
      state: decision.lifecycleState,
      nextTriggerAt: decision.revisitAt,
      decisionId: decision.id,
      recordedAt: decision.recordedAt,
    };
  }

  if (
    action.id === `refinance-data-required:${propertyId}` &&
    input.command === 'NO_MORTGAGE'
  ) {
    await markPropertyAsHavingNoMortgage(propertyId);
  }

  if (action.id.startsWith(ACTIVATION_ID_PREFIX)) {
    const result = await recordFirstActionResolution(propertyId, userId, {
      disposition: resolutionDisposition(input.command),
      reason,
      consequenceAcknowledged: input.consequenceAcknowledged || ['COMPLETE', 'ALREADY_DONE'].includes(input.command),
      nextTriggerAt: nextTriggerAt?.toISOString() ?? null,
    });
    return { ...result, command: input.command };
  }

  if (action.source.kind === 'PERSONALIZATION' && input.command !== 'NO_MORTGAGE') {
    const personalizationLifecycle = await applyPersonalizationHomeActionLifecycle({
      recommendationId: action.source.entityId,
      propertyId,
      actionKey: action.id,
      userId,
      command: input.command as PersonalizationHomeCommand,
      reason,
      nextTriggerAt,
    });
    if (personalizationLifecycle.snoozed) {
      await publishOrchestrationSnoozeSignal(propertyId, action.id);
    }
  } else if (nextTriggerAt) {
    await snoozeAction({ propertyId, actionKey: action.id, snoozeUntil: nextTriggerAt, snoozeReason: reason });
  } else {
    await recordOrchestrationEvent({
      propertyId,
      actionKey: action.id,
      actionType: ['COMPLETE', 'ALREADY_DONE'].includes(input.command)
        ? 'USER_MARKED_COMPLETE'
        : 'USER_DISMISSED',
      source: 'USER',
      createdBy: userId,
      payload: { command: input.command, reason, consequenceAcknowledged: input.consequenceAcknowledged },
    });
  }

  const resolvedAt = new Date();
  const disposition = resolutionDisposition(input.command);
  emitNorthStarLineageEvent({
    eventType: 'HOME_ACTION_RESOLUTION_RECORDED',
    propertyId,
    userId,
    occurredAt: resolvedAt,
    source: 'phase2_home_action_command',
    entryId: `home:${propertyId}`,
    triggerId: `trigger:home-action:${action.lineageId}`,
    signalId: action.lineageId,
    actionId: action.id,
    recommendationVersion: action.source.version ?? 'phase2-v1',
    journeyId: action.relatedJourneyId,
    executionId: randomUUID(),
    resolutionDisposition: disposition,
    verificationStatus: disposition === 'COMPLETED' ? 'PENDING' : 'NOT_REQUIRED',
    resolutionReason: reason,
    consequenceAcknowledged: input.consequenceAcknowledged || disposition === 'COMPLETED',
    nextTriggerAt: nextTriggerAt?.toISOString() ?? null,
    unresolvedSafetyRequirement: false,
  });

  return {
    actionId,
    command: input.command,
    state: nextTriggerAt
      ? 'SNOOZED'
      : disposition === 'COMPLETED'
        ? 'COMPLETED'
        : disposition === 'ACKNOWLEDGED'
          ? 'ACKNOWLEDGED'
          : 'DISMISSED',
    nextTriggerAt: nextTriggerAt?.toISOString() ?? null,
    recordedAt: resolvedAt.toISOString(),
  };
}
