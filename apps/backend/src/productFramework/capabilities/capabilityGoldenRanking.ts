import type { PropertyContextSnapshot } from '../../modules/propertyContext';
import type { HomeAction } from '../homeAction.contract';
import { RECOMMENDATION_SAFETY_TIERS } from '../recommendationGovernance.contract';
import { matchCapabilityCandidates } from './capabilityCandidateMatcher';
import { buildCapabilityRecommendationContext } from './capabilityRecommendationContext';
import { buildCapabilitySuggestionResponse } from './capabilityExplanationBuilder';
import {
  CAPABILITY_GOLDEN_FIXTURES,
  CAPABILITY_GOLDEN_RANKING_EXPECTATIONS,
  type CapabilityGoldenFixture,
  type CapabilityGoldenRankingExpectation,
} from './capabilityGoldenFixtures';
import { applyCapabilityGovernancePolicy } from './capabilityGovernancePolicy';
import { rankCapabilityCandidates } from './capabilityRanking';
import { evaluateCapabilityCandidateReadiness } from './capabilityReadinessEvaluator';
import { applyCapabilitySuppressionPolicy } from './capabilitySuppressionPolicy';
import { canonicalCapabilityRegistry } from './canonicalCapabilityRegistry';

const GOLDEN_NOW = '2026-07-24T12:00:00.000Z';

export type CapabilityGoldenGovernanceState = {
  decisions: readonly string[];
  reasonCodes: readonly string[];
};

export type CapabilityGoldenDuplicate = {
  capabilityId: string;
  sourceId: string;
  reasonCodes: readonly string[];
};

export type CapabilityGoldenRankingResult = {
  fixtureId: string;
  eligibleCapabilityIds: readonly string[];
  ineligibleCapabilityIds: readonly string[];
  needsContextCapabilityIds: readonly string[];
  suppressedDuplicates: readonly CapabilityGoldenDuplicate[];
  topCapabilityIds: readonly string[];
  reasonCodes: Readonly<Record<string, string>>;
  sourceIdentities: Readonly<Record<string, {
    kind: string;
    id: string;
  }>>;
  readinessExplanations: Readonly<Record<string, readonly string[]>>;
  governanceStates: Readonly<Record<string, CapabilityGoldenGovernanceState>>;
};

function sorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function propertyContext(
  fixture: CapabilityGoldenFixture,
): PropertyContextSnapshot {
  const sparse = fixture.id === 'sparse-new-home';
  return {
    propertyId: `property-${fixture.id}`,
    contextVersion: `golden-${fixture.id}-v1`,
    generatedAt: GOLDEN_NOW,
    scopes: ['CORE', 'SYSTEMS', 'ROOMS', 'PROJECTS'],
    facts: sparse ? {} : {
      'core.yearBuilt': {
        key: 'core.yearBuilt',
        value: 1987,
        state: 'KNOWN',
        source: 'PUBLIC_RECORD',
        verified: true,
        confidence: 0.95,
        observedAt: GOLDEN_NOW,
        validUntil: null,
        correctionPath: null,
      },
    },
    warnings: [],
  };
}

function duplicateAction(input: {
  fixture: CapabilityGoldenFixture;
  capabilityId: string;
}): HomeAction {
  const id = `action-${input.fixture.id}-${input.capabilityId}`;
  const propertyId = `property-${input.fixture.id}`;
  return {
    id,
    propertyId,
    lineageId: `lineage-${id}`,
    source: {
      kind: 'RECALL',
      entityId: `entity-${id}`,
      version: 'v1',
    },
    job: 'DECIDE',
    state: 'OPEN',
    priority: 'SOON',
    signal: 'A reviewed source action already launches this capability.',
    whyItMatters: 'The duplicate suggestion must not compete with its source action.',
    recommendedAction: 'Use the existing action.',
    expectedOutcome: 'The homeowner sees one clear launch path.',
    timing: {
      dueAt: null,
      windowStart: null,
      windowEnd: null,
      rationale: 'The source action is current.',
    },
    evidence: [{
      id: `evidence-${id}`,
      type: 'SYSTEM_DERIVATION',
      label: 'Golden fixture source',
      source: 'CAP-408',
      observedAt: GOLDEN_NOW,
      freshness: 'CURRENT',
      confidence: 0.95,
    }],
    assumptions: [],
    options: [],
    tradeoffs: [],
    confidence: {
      score: 0.95,
      label: 'HIGH',
      missing: [],
    },
    recommendationResponse: {
      status: 'AVAILABLE',
      safetyTier: 'LOW_CONSEQUENCE',
      reasonCode: 'GOLDEN_FIXTURE_AVAILABLE',
      message: 'The fixture action is available.',
      safeNextAction: 'Review the existing action.',
      missingFacts: [],
      retryable: false,
      materialActionAllowed: true,
    },
    governance: {
      safetyTier: 'LOW_CONSEQUENCE',
      professionalBoundary: null,
      jurisdictionCheck: {
        status: 'NOT_REQUIRED',
        jurisdiction: null,
        checkedAt: null,
        source: null,
      },
      conservativeFallback: null,
      emergencyEscalation: null,
      commercialDisclosure: {
        involvesCommercialAction: false,
        relationshipType: 'NONE',
        compensationMayOccur: false,
        rankingInfluenced: false,
        summary: 'No commercial relationship is involved.',
        selectionCriteria: [],
        nonCommercialAlternatives: [],
      },
      reviewedBy: ['CAP-408'],
      policyVersion: 'golden-fixture-v1',
    },
    primaryCta: {
      kind: 'REVIEW',
      label: 'Review action',
      href: `/dashboard/properties/${propertyId}`,
    },
    secondaryCtas: [],
    feedbackControls: ['DISMISS'],
    relatedJourneyId: null,
    createdAt: GOLDEN_NOW,
    lastEvaluatedAt: GOLDEN_NOW,
  };
}

function sourceEntityType(
  fixtureId: string,
  capabilityId: string,
): string | null {
  if (fixtureId === 'plant-suitable-room' && capabilityId === 'plant-advisor') {
    return 'ROOM';
  }
  return null;
}

function triggerFamily(capabilityId: string): string {
  const capability = canonicalCapabilityRegistry.getById(capabilityId);
  const trigger = capability?.recommendation.triggerFamilies[0];
  if (!trigger) {
    throw new Error(`Golden fixture capability has no trigger family: ${capabilityId}.`);
  }
  return trigger;
}

function fixtureAndExpectation(fixtureId: string): {
  fixture: CapabilityGoldenFixture;
  expectation: CapabilityGoldenRankingExpectation;
} {
  const fixture = CAPABILITY_GOLDEN_FIXTURES.find((item) => item.id === fixtureId);
  const expectation = CAPABILITY_GOLDEN_RANKING_EXPECTATIONS.find(
    (item) => item.fixtureId === fixtureId,
  );
  if (!fixture || !expectation) {
    throw new Error(`Unknown or incomplete capability golden fixture: ${fixtureId}.`);
  }
  return { fixture, expectation };
}

/**
 * Runs one complete recommendation pipeline against a deterministic golden
 * home. Fixtures exercise eligibility, safe partial value, governance,
 * source-action suppression, ranking, explanation, and source lineage.
 */
export function evaluateCapabilityGoldenRankingFixture(
  fixtureId: string,
): CapabilityGoldenRankingResult {
  const { fixture, expectation } = fixtureAndExpectation(fixtureId);
  const action = duplicateAction({
    fixture,
    capabilityId: expectation.duplicateCapabilityId,
  });
  const projectCapabilities = new Set(
    Object.entries(expectation.expectedSourceIdentities)
      .filter(([, source]) => source.kind === 'PROJECT')
      .map(([capabilityId]) => capabilityId),
  );
  const journeyCapabilityIds = [
    ...fixture.contextualCapabilityIds.filter(
      (capabilityId) => !projectCapabilities.has(capabilityId),
    ),
    expectation.ineligibleCapabilityId,
  ];

  const context = buildCapabilityRecommendationContext({
    propertyId: `property-${fixture.id}`,
    propertyContext: propertyContext(fixture),
    actions: [action],
    actionSourceMetadata: [{
      actionId: action.id,
      ctaCapabilityIds: [expectation.duplicateCapabilityId],
      freshness: 'CURRENT',
    }],
    journeys: journeyCapabilityIds.map((capabilityId) => ({
      id: `journey-${fixture.id}-${capabilityId}`,
      kind: triggerFamily(capabilityId),
      status: 'ACTIVE',
      stage: 'ACTIVE',
      sourceEntityType: sourceEntityType(fixture.id, capabilityId),
      sourceEntityId: sourceEntityType(fixture.id, capabilityId)
        ? `entity-${fixture.id}-${capabilityId}`
        : null,
      signalIntentFamily: triggerFamily(capabilityId),
      observedAt: GOLDEN_NOW,
    })),
    projects: [...projectCapabilities].map((capabilityId) => ({
      id: `project-${fixture.id}-${capabilityId}`,
      kind: 'RENOVATION',
      status: 'IN_PROGRESS',
      milestoneKind: 'DOCUMENTATION',
      signalIntentFamilies: [triggerFamily(capabilityId)],
      sourceEntityType: 'PROJECT',
      sourceEntityId: `project-${fixture.id}-${capabilityId}`,
      observedAt: GOLDEN_NOW,
    })),
    availableCapabilityIds: fixture.contextualCapabilityIds,
    availabilityPolicyVersion: 'golden-availability-v1',
    governance: {
      canUseCapabilities: true,
      allowedSafetyTiers: RECOMMENDATION_SAFETY_TIERS,
      enforceApprovals: false,
      evidenceAccess: 'ALLOWED',
      contextFreshness: 'CURRENT',
    },
    readinessMetrics: {
      trackedSystemCount: fixture.id === 'sparse-new-home' ? 0 : 2,
      coverageGapCount: fixture.id === 'sparse-new-home' ? 0 : 1,
      jurisdictionStatus: 'KNOWN',
    },
    lifecycle: [],
    surface: 'HOME',
    limit: 3,
    generatedAt: GOLDEN_NOW,
  });
  const matchResult = matchCapabilityCandidates({
    registry: canonicalCapabilityRegistry,
    context,
  });
  const readinessResult = evaluateCapabilityCandidateReadiness({
    registry: canonicalCapabilityRegistry,
    context,
    matchResult,
  });
  const governanceResult = applyCapabilityGovernancePolicy({
    registry: canonicalCapabilityRegistry,
    context,
    readinessResult,
  });
  const suppressionResult = applyCapabilitySuppressionPolicy({
    registry: canonicalCapabilityRegistry,
    context,
    governanceResult,
  });
  const rankingResult = rankCapabilityCandidates({
    registry: canonicalCapabilityRegistry,
    context,
    suppressionResult,
  });
  const response = buildCapabilitySuggestionResponse({
    registry: canonicalCapabilityRegistry,
    context,
    rankingResult,
  });

  const grouped = new Map<string, typeof suppressionResult.candidates>();
  for (const candidate of suppressionResult.candidates) {
    const candidates = grouped.get(candidate.capabilityId) ?? [];
    grouped.set(candidate.capabilityId, [...candidates, candidate]);
  }
  const eligibleCapabilityIds = sorted(
    [...grouped.entries()]
      .filter(([, candidates]) =>
        candidates.some((candidate) => !candidate.suppression.suppressed))
      .map(([capabilityId]) => capabilityId),
  );
  const ineligibleCapabilityIds = sorted(
    [...grouped.entries()]
      .filter(([, candidates]) =>
        candidates.every((candidate) => candidate.suppression.suppressed))
      .map(([capabilityId]) => capabilityId),
  );
  const needsContextCapabilityIds = sorted(
    [...grouped.entries()]
      .filter(([, candidates]) => candidates.some(
        (candidate) =>
          !candidate.suppression.suppressed
          && candidate.readiness.state === 'NEEDS_CONTEXT',
      ))
      .map(([capabilityId]) => capabilityId),
  );
  const governanceStates = Object.fromEntries(
    [...grouped.entries()].map(([capabilityId, candidates]) => [
      capabilityId,
      {
        decisions: sorted(candidates.map((candidate) => candidate.policy.decision)),
        reasonCodes: sorted(candidates.flatMap(
          (candidate) => candidate.policy.reasonCodes,
        )),
      },
    ]),
  );

  return {
    fixtureId,
    eligibleCapabilityIds,
    ineligibleCapabilityIds,
    needsContextCapabilityIds,
    suppressedDuplicates: suppressionResult.candidates
      .filter((candidate) =>
        candidate.suppression.reasonCodes.includes(
          'SOURCE_ACTION_ALREADY_LAUNCHES_CAPABILITY',
        ))
      .map((candidate) => ({
        capabilityId: candidate.capabilityId,
        sourceId: candidate.source.id,
        reasonCodes: sorted(candidate.suppression.reasonCodes),
      }))
      .sort((left, right) =>
        left.capabilityId.localeCompare(right.capabilityId)
        || left.sourceId.localeCompare(right.sourceId)),
    topCapabilityIds: response.suggestions.map(
      (suggestion) => suggestion.capabilityId,
    ),
    reasonCodes: Object.fromEntries(
      response.suggestions.map((suggestion) => [
        suggestion.capabilityId,
        suggestion.reasonCode,
      ]),
    ),
    sourceIdentities: Object.fromEntries(
      response.suggestions.map((suggestion) => [
        suggestion.capabilityId,
        {
          kind: suggestion.source.kind,
          id: suggestion.source.id,
        },
      ]),
    ),
    readinessExplanations: Object.fromEntries(
      response.suggestions.map((suggestion) => [
        suggestion.capabilityId,
        suggestion.readiness.explanations,
      ]),
    ),
    governanceStates,
  };
}

export function evaluateAllCapabilityGoldenRankingFixtures():
readonly CapabilityGoldenRankingResult[] {
  return CAPABILITY_GOLDEN_FIXTURES.map((fixture) =>
    evaluateCapabilityGoldenRankingFixture(fixture.id));
}
