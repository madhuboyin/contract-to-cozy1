'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { RecentOwnerTransition } from '@/components/home/RecentOwnerTransition';
import { UnifiedHomeSurface } from '@/components/home/UnifiedHomeSurface';
import type { BuyerRecentOwnerTransition, UnifiedHomeDTO } from '@/types';

export const HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID = 'home-buyer-lifecycle-acceptance-property';

const transition: BuyerRecentOwnerTransition = {
  property: {
    id: HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID,
    address: '18 Harbor View Lane',
    city: 'Portland',
    state: 'ME',
    zipCode: '04101',
  },
  journey: {
    stage: 'FIRST_30_DAYS',
    ownershipStartedAt: '2026-08-01T12:00:00.000Z',
    daysSinceOwnershipStart: 16,
    progress: { resolved: 6, total: 9, percent: 67, active: 2 },
  },
  evidence: {
    documentCount: 14,
    verifiedDocumentCount: 11,
    inspectionReportCount: 2,
    openMaterialFindingCount: 0,
  },
  advocacy: {
    eligible: true,
    successMoment: 'FIRST_90_DAY_PROGRESS',
    inviteAvailable: true,
  },
  routes: {
    plan: `/dashboard/properties/${HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID}/buyer-plan`,
    timeline: `/dashboard/properties/${HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID}/timeline`,
    homeRecords: `/dashboard/properties/${HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID}/documents`,
    homeOperations: `/dashboard/properties/${HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID}/maintenance`,
    household: `/dashboard/properties/${HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID}/household`,
    ask: `/dashboard/ask?propertyId=${HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID}`,
  },
};

function unifiedHomeFixture(urgent: boolean): UnifiedHomeDTO {
  return {
    contractVersion: 'phase2-home-v1',
    property: {
      id: HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID,
      name: 'Harbor View Home',
      address: '18 Harbor View Lane, Portland, ME 04101',
      dwellingType: 'SINGLE_FAMILY',
      updatedAt: '2026-08-17T12:00:00.000Z',
    },
    propertyContext: {
      contextVersion: 'acceptance-v1',
      scopes: [],
      completenessPercent: 92,
      knownFactCount: 23,
      missingFactCount: 0,
      conflictedFactCount: 0,
      staleFactCount: 0,
      warningCount: 0,
    },
    attention: {
      actions: [],
      totalCount: 0,
      planHref: `/dashboard/properties/${HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID}/maintenance`,
      firstValueInsight: null,
    },
    decisions: [],
    capabilitySuggestions: {
      contractVersion: 'capability-suggestions-v1',
      registryVersion: 'acceptance-registry-v1',
      recommendationVersion: 'capability-recommendation-v1',
      contextVersion: 'acceptance-v1',
      generatedAt: '2026-08-17T12:00:00.000Z',
      status: 'AVAILABLE',
      surface: 'HOME',
      suggestions: [],
    },
    activeMajorMoment: urgent ? {
      kind: 'PROJECT',
      id: 'urgent-handoff-project',
      title: 'Resolve the active water shutoff issue',
      stage: 'ACTION_REQUIRED',
      context: 'A plumber is scheduled and the main shutoff location is documented.',
      blocker: 'Confirm the leak is contained before continuing setup.',
      nextMilestone: 'Record the repair outcome',
      href: `/dashboard/properties/${HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID}/projects/urgent-handoff-project`,
    } : null,
    glance: {
      recordCompleteness: 92,
      knownPropertyFacts: 23,
      trackedSystems: 8,
      verifiedSystems: 6,
      documentCount: 14,
      verifiedDocumentCount: 11,
      coverageGapCount: 0,
      openWorkCount: urgent ? 1 : 0,
      recentChanges: [],
      recordHref: `/dashboard/properties/${HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID}/documents`,
      systemsHref: `/dashboard/properties/${HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID}/inventory`,
      coverageHref: `/dashboard/properties/${HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID}/coverage`,
      workHref: `/dashboard/properties/${HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID}/maintenance`,
    },
    diagnostics: {
      candidateCount: 0,
      surfacedCount: 0,
      duplicateCount: 0,
      suppressedCount: 0,
      snoozedCount: 0,
      promotedCount: 0,
      personalization: { status: 'AVAILABLE', evaluatedCount: 0, activeCount: 0 },
      emptyStateReason: 'ALL_CAUGHT_UP',
    },
    generatedAt: '2026-08-17T12:00:00.000Z',
  };
}

export function HomeBuyerLifecycleAcceptanceClient() {
  const urgent = useSearchParams().get('urgent') === '1';
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(
      ['unified-home', HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID],
      unifiedHomeFixture(urgent),
    );
    client.setQueryData(
      ['home-event-radar-top-match', HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID],
      { items: [], hasMore: false, nextCursor: null },
    );
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <main className="min-h-screen space-y-6 bg-slate-50 px-4 py-6 sm:px-6 sm:py-8">
        <RecentOwnerTransition transition={transition} />
        <UnifiedHomeSurface
          propertyId={HOME_BUYER_LIFECYCLE_ACCEPTANCE_PROPERTY_ID}
          properties={[{ id: transition.property.id, address: transition.property.address }]}
          recentOwnerTransition={transition}
        />
      </main>
    </QueryClientProvider>
  );
}
