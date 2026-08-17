'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { BuyerClosingHome } from '@/components/home/BuyerClosingHome';
import { RecentOwnerTransition } from '@/components/home/RecentOwnerTransition';
import { UnifiedHomeSurface } from '@/components/home/UnifiedHomeSurface';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WelcomeModal } from '@/app/(dashboard)/dashboard/components/WelcomeModal';
import type { BuyerClosingHomeOverview, BuyerRecentOwnerTransition, UnifiedHomeDTO } from '@/types';

type PropertyKey = 'owner-one' | 'owner-two' | 'purchase';
type BuyerView = 'entry' | 'onboarding' | 'home' | 'plan' | 'documents' | 'inspection' | 'ask' | 'recent';

const BASE_PATH = '/acceptance/home-buyer-lifecycle/slice8';
const OWNER_ONE_ID = 'slice8-owner-harbor';
const OWNER_TWO_ID = 'slice8-owner-maple';
const PURCHASE_ID = 'slice8-purchase-river';

function acceptanceHref(params: Record<string, string>): string {
  return `${BASE_PATH}?${new URLSearchParams(params).toString()}`;
}

function homeFixture(id: string, name: string, address: string, documents: number): UnifiedHomeDTO {
  return {
    contractVersion: 'phase2-home-v1',
    property: { id, name, address, dwellingType: 'SINGLE_FAMILY', updatedAt: '2026-08-17T12:00:00.000Z' },
    propertyContext: {
      contextVersion: `slice8-${id}`,
      scopes: [],
      completenessPercent: 90,
      knownFactCount: 20,
      missingFactCount: 0,
      conflictedFactCount: 0,
      staleFactCount: 0,
      warningCount: 0,
    },
    attention: {
      actions: [],
      totalCount: 0,
      planHref: acceptanceHref({ scenario: 'protected', property: id === OWNER_ONE_ID ? 'owner-one' : id === OWNER_TWO_ID ? 'owner-two' : 'purchase' }),
      firstValueInsight: null,
    },
    decisions: [],
    capabilitySuggestions: {
      contractVersion: 'capability-suggestions-v1',
      registryVersion: 'slice8-registry-v1',
      recommendationVersion: 'capability-recommendation-v1',
      contextVersion: `slice8-${id}`,
      generatedAt: '2026-08-17T12:00:00.000Z',
      status: 'AVAILABLE',
      surface: 'HOME',
      suggestions: [],
    },
    activeMajorMoment: null,
    glance: {
      recordCompleteness: 90,
      knownPropertyFacts: 20,
      trackedSystems: documents === 14 ? 7 : documents === 6 ? 4 : 5,
      verifiedSystems: documents === 14 ? 5 : documents === 6 ? 3 : 4,
      documentCount: documents,
      verifiedDocumentCount: documents,
      coverageGapCount: 0,
      openWorkCount: 0,
      recentChanges: [],
      recordHref: acceptanceHref({ scenario: 'protected', property: id === OWNER_ONE_ID ? 'owner-one' : 'owner-two', view: 'documents' }),
      systemsHref: acceptanceHref({ scenario: 'protected', property: id === OWNER_ONE_ID ? 'owner-one' : 'owner-two', view: 'systems' }),
      coverageHref: acceptanceHref({ scenario: 'protected', property: id === OWNER_ONE_ID ? 'owner-one' : 'owner-two', view: 'coverage' }),
      workHref: acceptanceHref({ scenario: 'protected', property: id === OWNER_ONE_ID ? 'owner-one' : 'owner-two', view: 'work' }),
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

function buyerOverview(mode: 'buyer' | 'protected'): BuyerClosingHomeOverview {
  const params: Record<string, string> = mode === 'buyer'
    ? { scenario: 'buyer' }
    : { scenario: 'protected', property: 'purchase' };
  return {
    property: { id: PURCHASE_ID, address: '42 River Street', city: 'Portland', state: 'ME', zipCode: '04101' },
    journey: {
      status: 'ACTIVE',
      stage: 'DUE_DILIGENCE',
      // Deliberately elapsed: a date alone must never close the journey.
      targetCloseDate: '2026-08-15T12:00:00.000Z',
      moveInDate: '2026-08-22T12:00:00.000Z',
      progress: { completed: 3, total: 9, percent: 33 },
    },
    nextAction: {
      id: 'slice8-contract-review',
      actionKey: 'REVIEW_ACCEPTED_CONTRACT',
      title: 'Review accepted contract dates',
      description: 'Confirm extracted dates before they update the Closing Plan.',
      status: 'PENDING',
      phase: 'DUE_DILIGENCE',
      priority: 'NOW',
      checklistSection: 'CONTRACT_CONTINGENCIES',
      dueAt: '2026-08-18T12:00:00.000Z',
      assignedToUserId: null,
    },
    nextActionGuidance: {
      actionId: 'slice8-contract-review',
      rationale: 'Confirm the dates that change your closing guidance.',
      consequenceOfDelay: 'A missed confirmed contract date can reduce your options.',
      responsibleParty: 'Buyer agent or attorney',
      suggestedQuestion: 'Which confirmed contract date affects me first?',
      ctaLabel: 'Review this step',
      ctaHref: `/dashboard/properties/${PURCHASE_ID}/buyer-plan?taskId=slice8-contract-review`,
    },
    blockers: [],
    milestones: [
      { id: 'inspection', milestoneKey: 'INSPECTION_CONTINGENCY', type: 'INSPECTION_CONTINGENCY', label: 'Inspection contingency', dueAt: '2026-08-19T12:00:00.000Z', status: 'IN_PROGRESS' },
      { id: 'closing', milestoneKey: 'CLOSING', type: 'CLOSING', label: 'Professional closing appointment', dueAt: '2026-08-15T12:00:00.000Z', status: 'NOT_STARTED' },
    ],
    readinessLanes: [
      { key: 'CONTRACT', label: 'Contract', completed: 2, total: 2, blocked: 0 },
      { key: 'DUE_DILIGENCE', label: 'Due diligence', completed: 1, total: 3, blocked: 0 },
      { key: 'CLOSING', label: 'Closing readiness', completed: 0, total: 3, blocked: 0 },
      { key: 'MOVE', label: 'Move & possession', completed: 0, total: 1, blocked: 0 },
    ],
    evidence: {
      inspectionState: 'REVIEW_PENDING',
      inspectionReportCount: 1,
      openMaterialFindingCount: 1,
      documentCount: 4,
      verifiedDocumentCount: 2,
      documentsNeedingReviewCount: 1,
    },
    people: { contactCount: 3, assignedTaskCount: 2 },
    routes: {
      plan: acceptanceHref({ ...params, view: 'plan' }),
      documents: acceptanceHref({ ...params, view: 'documents' }),
      inspection: acceptanceHref({ ...params, view: 'inspection' }),
      ask: acceptanceHref({ ...params, view: 'ask' }),
    },
  };
}

function recentTransition(): BuyerRecentOwnerTransition {
  return {
    property: { id: PURCHASE_ID, address: '42 River Street', city: 'Portland', state: 'ME', zipCode: '04101' },
    journey: {
      stage: 'CLOSED',
      ownershipStartedAt: '2026-08-17T12:00:00.000Z',
      daysSinceOwnershipStart: 0,
      progress: { resolved: 3, total: 9, percent: 33, active: 6 },
    },
    evidence: {
      documentCount: 4,
      verifiedDocumentCount: 2,
      inspectionReportCount: 1,
      openMaterialFindingCount: 1,
    },
    advocacy: { eligible: false, successMoment: null, inviteAvailable: true },
    routes: {
      plan: acceptanceHref({ scenario: 'buyer', view: 'plan' }),
      timeline: acceptanceHref({ scenario: 'buyer', view: 'documents' }),
      homeRecords: acceptanceHref({ scenario: 'buyer', view: 'documents' }),
      homeOperations: acceptanceHref({ scenario: 'buyer', view: 'recent' }),
      household: acceptanceHref({ scenario: 'buyer', view: 'recent' }),
      ask: acceptanceHref({ scenario: 'buyer', view: 'ask' }),
    },
  };
}

function useFixtureQueries() {
  return useState(() => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const fixture of [
      homeFixture(OWNER_ONE_ID, 'Harbor House', '18 Harbor View Lane, Portland, ME 04101', 14),
      homeFixture(OWNER_TWO_ID, 'Maple Cottage', '7 Maple Avenue, Augusta, ME 04330', 6),
      homeFixture(PURCHASE_ID, 'River Street Home', '42 River Street, Portland, ME 04101', 4),
    ]) {
      client.setQueryData(['unified-home', fixture.property.id], fixture);
      client.setQueryData(['home-event-radar-top-match', fixture.property.id], { items: [], hasMore: false, nextCursor: null });
    }
    return client;
  })[0];
}

function BuyerOnboarding({ onContinue }: { onContinue: () => void }) {
  const [choice, setChoice] = useState<'own' | 'buying' | 'new-build' | 'exploring' | null>(null);
  const [address, setAddress] = useState('');
  const [concern, setConcern] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (choice === 'buying' && address.trim()) onContinue();
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle><h1 className="text-2xl">Where are you in the home journey?</h1></CardTitle>
          <CardDescription>Choose a journey before adding the property. No owner experience is assumed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={submit}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Home journey">
              {([['own', 'I own it'], ['buying', 'Buying existing'], ['new-build', 'New build'], ['exploring', 'Exploring']] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={choice === value} onClick={() => setChoice(value)} className="min-h-11 rounded-xl border border-slate-300 px-3 font-semibold aria-pressed:border-teal-700 aria-pressed:bg-teal-50">
                  {label}
                </button>
              ))}
            </div>
            {choice === 'buying' ? (
              <fieldset className="space-y-4 rounded-2xl border border-teal-200 bg-teal-50 p-4">
                <legend className="px-2 font-semibold">Prepare my buyer plan</legend>
                <label className="block text-sm font-semibold">Property address
                  <input value={address} onChange={(event) => setAddress(event.target.value)} required className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-semibold">Target closing date<input type="date" defaultValue="2026-08-15" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" /></label>
                  <label className="block text-sm font-semibold">Move-in date<input type="date" defaultValue="2026-08-22" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" /></label>
                </div>
                <label className="block text-sm font-semibold">Inspection concern<textarea value={concern} onChange={(event) => setConcern(event.target.value)} className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 bg-white p-3" /></label>
              </fieldset>
            ) : null}
            <Button type="submit" disabled={choice !== 'buying' || !address.trim()} className="w-full">Create my Closing Plan</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

const planItems = [
  'Contract & contingencies',
  'Inspection & negotiation',
  'Purchase financing',
  'Title, escrow & insurance',
  'Final walkthrough',
  'Closing disclosure & funds',
  'Closing day',
  'Move & possession',
];

function BuyerPlanFixture({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [reviewed, setReviewed] = useState(false);
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <p className="text-sm font-semibold text-teal-800">42 River Street · Due diligence</p>
        <h1 className="text-3xl font-semibold">Closing Plan</h1>
        <p className="mt-2 text-slate-600">One property-scoped plan for tasks, evidence, people, and closing readiness.</p>
      </header>
      <Card>
        <CardHeader><CardTitle><h2 className="text-xl">Purchase checklist</h2></CardTitle></CardHeader>
        <CardContent><ul className="grid gap-3 sm:grid-cols-2">{planItems.map((item) => <li key={item} className="rounded-xl border border-slate-200 p-3">{item}</li>)}</ul></CardContent>
      </Card>
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader><CardTitle><h2 className="text-xl">Professional close confirmation</h2></CardTitle><CardDescription>The elapsed target date has not changed the journey. Confirm only after the professional closing is complete.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> I confirm the professional close completed</label>
          <Button disabled={!reviewed} onClick={onClose}>Complete closing and open my home</Button>
        </CardContent>
      </Card>
      <Button variant="outline" onClick={() => router.push(acceptanceHref({ scenario: 'buyer', view: 'home' }))}>Back to Closing Home</Button>
    </main>
  );
}

function SupportingBuyerView({ view }: { view: BuyerView }) {
  const router = useRouter();
  const content = view === 'documents'
    ? ['Documents', 'Accepted contract and inspection report stay with this purchase property.']
    : view === 'inspection'
      ? ['Inspection Hub', 'One material finding is ready for negotiation or post-close disposition.']
      : ['Ask Cozy', 'What is blocking me before closing?'];
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 sm:px-6">
      <Card><CardHeader><CardTitle><h1 className="text-2xl">{content[0]}</h1></CardTitle><CardDescription>{content[1]}</CardDescription></CardHeader><CardContent><Button onClick={() => router.push(acceptanceHref({ scenario: 'buyer', view: 'home' }))}>Return to Closing Home</Button></CardContent></Card>
    </main>
  );
}

function BuyerScenario() {
  const router = useRouter();
  const view = (useSearchParams().get('view') || 'entry') as BuyerView;
  const queryClient = useFixtureQueries();
  if (view === 'entry') return <WelcomeModal userFirstName="Taylor" onStart={() => router.push(acceptanceHref({ scenario: 'buyer', view: 'onboarding' }))} />;
  if (view === 'onboarding') return <BuyerOnboarding onContinue={() => router.push(acceptanceHref({ scenario: 'buyer', view: 'home' }))} />;
  if (view === 'plan') return <BuyerPlanFixture onClose={() => router.push(acceptanceHref({ scenario: 'buyer', view: 'recent' }))} />;
  if (view === 'documents' || view === 'inspection' || view === 'ask') return <SupportingBuyerView view={view} />;
  if (view === 'recent') {
    return <QueryClientProvider client={queryClient}><div className="min-h-screen space-y-6 bg-slate-50 px-4 py-6 sm:px-6"><RecentOwnerTransition transition={recentTransition()} /><UnifiedHomeSurface propertyId={PURCHASE_ID} properties={[{ id: PURCHASE_ID, address: '42 River Street' }]} recentOwnerTransition={recentTransition()} /></div></QueryClientProvider>;
  }
  return <BuyerClosingHome overview={buyerOverview('buyer')} />;
}

function PropertySwitcher({ selected }: { selected: PropertyKey }) {
  const router = useRouter();
  const options: Array<[PropertyKey, string, string]> = [
    ['owner-one', 'Harbor House', 'Owned'],
    ['owner-two', 'Maple Cottage', 'Owned'],
    ['purchase', '42 River Street', 'Closing journey'],
  ];
  return (
    <nav aria-label="Property switcher" className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto">
        {options.map(([value, label, status]) => <button key={value} type="button" aria-pressed={selected === value} onClick={() => router.push(acceptanceHref({ scenario: 'protected', property: value }))} className="min-h-11 shrink-0 rounded-xl border border-slate-300 px-4 text-left aria-pressed:border-teal-700 aria-pressed:bg-teal-50"><span className="block font-semibold">{label}</span><span className="block text-xs text-slate-600">{status}</span></button>)}
      </div>
    </nav>
  );
}

function ProtectedHomeownerScenario() {
  const selected = (useSearchParams().get('property') || 'owner-one') as PropertyKey;
  const queryClient = useFixtureQueries();
  const fixture = selected === 'owner-one'
    ? { id: OWNER_ONE_ID, address: '18 Harbor View Lane' }
    : selected === 'owner-two'
      ? { id: OWNER_TWO_ID, address: '7 Maple Avenue' }
      : { id: PURCHASE_ID, address: '42 River Street' };
  return (
    <QueryClientProvider client={queryClient}>
      <PropertySwitcher selected={selected} />
      {selected === 'purchase' ? <BuyerClosingHome overview={buyerOverview('protected')} /> : (
        <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6"><UnifiedHomeSurface propertyId={fixture.id} properties={[fixture]} /></div>
      )}
    </QueryClientProvider>
  );
}

export function Slice8AcceptanceClient() {
  const scenario = useSearchParams().get('scenario') || 'buyer';
  return (
    <>
      <title>Home buyer Slice 8 acceptance | ContractToCozy</title>
      {scenario === 'protected' ? <ProtectedHomeownerScenario /> : <BuyerScenario />}
    </>
  );
}
