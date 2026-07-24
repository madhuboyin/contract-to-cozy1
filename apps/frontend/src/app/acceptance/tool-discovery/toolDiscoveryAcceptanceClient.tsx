'use client';

import type {
  CapabilitySuggestionDTO,
  RankedHomeActionDTO,
  ToolDiscoveryAvailabilityDTO,
  UnifiedHomeDTO,
} from '@/types';
import { UnifiedHomeToolsSection } from '@/components/home/UnifiedHomeToolsSection';
import { ExploreToolsCatalog } from '@/features/tools/ExploreToolsCatalog';
import { contextFromUnifiedHome } from '@/features/tools/toolDiscoveryRegistry';

const coverageAction: RankedHomeActionDTO = {
  id: 'coverage-action-1',
  lineageId: 'coverage-lineage-1',
  priority: 'SOON',
  state: 'OPEN',
  job: 'DECIDE',
  signal: 'Furnace coverage and service decision',
  whyItMatters: 'The furnace lacks confirmed coverage and may need professional service.',
  recommendedAction: 'Compare coverage before scheduling service',
  expectedOutcome: 'Choose an informed coverage and service path.',
  timing: { dueAt: null, windowStart: null, windowEnd: null, rationale: 'Before service' },
  evidence: [],
  assumptions: [],
  confidence: { score: 0.84, label: 'HIGH', missing: [] },
  primaryCta: { label: 'Review furnace', href: '/dashboard/properties/tool-discovery-property/inventory' },
  secondaryCtas: [],
  source: { kind: 'GUIDANCE', entityId: 'furnace-1', version: '1' },
  governance: { safetyTier: 'REGULATED_COVERAGE' },
  feedbackControls: ['COMPLETE'],
  ranking: {
    rank: 1,
    score: 90,
    explanation: 'Coverage decision due before service.',
    components: { consequence: 1, urgency: 1, confidence: 1, householdRelevance: 1, actionability: 1, missingContextPenalty: 0 },
  },
  deduplication: { canonicalKey: 'coverage:furnace', mergedActionIds: [] },
};

function serverSuggestion(input: {
  capabilityId: string;
  rank: number;
  reasonCode: string;
  source: CapabilitySuggestionDTO['source'];
}): CapabilitySuggestionDTO {
  return {
    suggestionId:
      `${input.capabilityId}:${input.source.kind}:${input.source.id}:tool-context-v2`,
    capabilityId: input.capabilityId,
    manifestVersion: 1,
    recommendationVersion: 'capability-recommendation-v1',
    contextVersion: 'tool-context-v2',
    rank: input.rank,
    scoreBand: 'HIGH',
    label: input.capabilityId
      .split('-')
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' '),
    shortDescription: 'A server-provided capability suggestion.',
    iconName: 'SPARKLES',
    outcomeCategory: 'UNDERSTAND_HOME',
    reasonCode: input.reasonCode,
    whyNow: 'The current Home context makes this tool useful now.',
    expectedOutcome: 'A clearer next step grounded in this home.',
    readiness: {
      state: 'READY',
      reasonCodes: [],
      missingFactKeys: [],
      explanations: [],
    },
    evidence: {
      mode: 'STRUCTURED_ONLY',
      summary: 'Based on the authorized Home context.',
      sourceObservedAt: '2026-07-20T00:00:00.000Z',
      actionConfidence: null,
      contextWarningCodes: [],
    },
    source: input.source,
    launch: {
      label: `Open ${input.capabilityId}`,
      href:
        `/dashboard/properties/tool-discovery-property/tools/${input.capabilityId}`,
    },
  };
}

const home: UnifiedHomeDTO = {
  contractVersion: 'phase2-home-v1',
  property: {
    id: 'tool-discovery-property',
    name: 'Acceptance Home',
    address: '1 Acceptance Way',
    dwellingType: 'DETACHED_SINGLE_FAMILY',
    updatedAt: '2026-07-20T00:00:00.000Z',
  },
  propertyContext: {
    contextVersion: 'tool-context-v2',
    scopes: [],
    completenessPercent: 75,
    knownFactCount: 8,
    missingFactCount: 2,
    conflictedFactCount: 0,
    staleFactCount: 0,
    warningCount: 0,
  },
  attention: {
    actions: [coverageAction],
    totalCount: 1,
    planHref: '/dashboard/actions',
    firstValueInsight: null,
  },
  decisions: [],
  capabilitySuggestions: {
    status: 'AVAILABLE',
    contractVersion: 'capability-suggestions-v1',
    registryVersion: 'acceptance-registry-v1',
    recommendationVersion: 'capability-recommendation-v1',
    contextVersion: 'tool-context-v2',
    generatedAt: '2026-07-20T00:00:00.000Z',
    surface: 'HOME',
    suggestions: [
      serverSuggestion({
        capabilityId: 'coverage-options',
        rank: 1,
        reasonCode: 'COVERAGE_GAPS_PRESENT',
        source: {
          kind: 'HOME_ACTION',
          id: 'coverage-action-1',
          actionId: 'coverage-action-1',
          journeyId: null,
          entityType: 'INVENTORY_ITEM',
          entityId: 'furnace-1',
          sourceVersion: 'action-v1',
          observedAt: '2026-07-20T00:00:00.000Z',
        },
      }),
      serverSuggestion({
        capabilityId: 'service-price-radar',
        rank: 2,
        reasonCode: 'SERVICE_DECISION_ACTIVE',
        source: {
          kind: 'JOURNEY',
          id: 'journey-service-1',
          actionId: null,
          journeyId: 'journey-service-1',
          entityType: 'SERVICE',
          entityId: 'hvac-service',
          sourceVersion: 'OPTIONS',
          observedAt: '2026-07-20T00:00:00.000Z',
        },
      }),
      serverSuggestion({
        capabilityId: 'home-digital-twin',
        rank: 3,
        reasonCode: 'PROPERTY_CONTEXT_INCOMPLETE',
        source: {
          kind: 'PROPERTY_CONTEXT',
          id: 'core.yearBuilt',
          actionId: null,
          journeyId: null,
          entityType: null,
          entityId: null,
          sourceVersion: null,
          observedAt: '2026-07-20T00:00:00.000Z',
        },
      }),
    ],
  },
  activeMajorMoment: null,
  glance: {
    recordCompleteness: 75,
    knownPropertyFacts: 8,
    trackedSystems: 4,
    verifiedSystems: 3,
    documentCount: 2,
    verifiedDocumentCount: 2,
    coverageGapCount: 2,
    openWorkCount: 1,
    recentChanges: [],
    recordHref: '/dashboard/properties',
    systemsHref: '/dashboard/inventory',
    coverageHref: '/dashboard/protect',
    workHref: '/dashboard/actions',
  },
  diagnostics: {
    candidateCount: 1,
    surfacedCount: 1,
    duplicateCount: 0,
    suppressedCount: 0,
    snoozedCount: 0,
    promotedCount: 0,
    personalization: { status: 'AVAILABLE', evaluatedCount: 0, activeCount: 0 },
  },
  generatedAt: '2026-07-20T00:00:00.000Z',
};

const availability: ToolDiscoveryAvailabilityDTO = {
  enabled: true,
  enforceReleaseGates: false,
  disabledToolIds: [],
  rollouts: {},
  generatedAt: '2026-07-20T00:00:00.000Z',
};

export function ToolDiscoveryAcceptanceClient() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Tool discovery acceptance</h1>
      <UnifiedHomeToolsSection home={home} propertyId={home.property.id} />
      <section aria-labelledby="catalog-heading" className="space-y-4">
        <h2 id="catalog-heading" className="text-xl font-semibold">Explore tools fixture</h2>
        <ExploreToolsCatalog
          propertyId={home.property.id}
          availability={availability}
          context={contextFromUnifiedHome(home)}
          launchContext={{ contextVersion: home.propertyContext.contextVersion }}
        />
      </section>
    </main>
  );
}
