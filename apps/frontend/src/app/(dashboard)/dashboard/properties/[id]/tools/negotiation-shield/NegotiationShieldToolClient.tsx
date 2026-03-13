'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileText,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import HomeToolsRail from '../../components/HomeToolsRail';
import { api } from '@/lib/api/client';
import type { Property } from '@/types';
import {
  IconBadge,
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
  SummaryCard,
} from '@/components/mobile/dashboard/MobilePrimitives';
import {
  listNegotiationShieldCases,
  type NegotiationShieldCaseSummary,
} from './negotiationShieldApi';

type ScenarioCardDefinition = {
  key: 'contractor-quote-review' | 'insurance-premium-increase';
  title: string;
  description: string;
  href: (propertyId: string) => string;
  icon: typeof FileText;
};

const SCENARIO_CARDS: ScenarioCardDefinition[] = [
  {
    key: 'contractor-quote-review',
    title: 'Contractor quote review',
    description: 'Review pricing clarity, leverage points, and the questions worth asking before you approve work.',
    href: (propertyId) =>
      `/dashboard/properties/${propertyId}/tools/negotiation-shield?scenario=contractor-quote-review`,
    icon: FileText,
  },
  {
    key: 'insurance-premium-increase',
    title: 'Insurance premium increase',
    description: 'Pressure-test a renewal jump, surface property-backed leverage, and prepare a review request.',
    href: (propertyId) =>
      `/dashboard/properties/${propertyId}/tools/negotiation-shield?scenario=insurance-premium-increase`,
    icon: Shield,
  },
];

function formatPropertyLabel(property: Property | null | undefined, propertyId: string) {
  if (!property) return `Property ${propertyId.slice(0, 8)}`;
  return property.name?.trim() || property.address || `Property ${propertyId.slice(0, 8)}`;
}

function formatCaseSubtitle(item: NegotiationShieldCaseSummary) {
  const scenarioLabel =
    item.scenarioType === 'CONTRACTOR_QUOTE_REVIEW'
      ? 'Contractor quote review'
      : 'Insurance premium increase';
  const updatedLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(item.updatedAt));
  return `${scenarioLabel} • Updated ${updatedLabel}`;
}

function getStatusTone(
  status: NegotiationShieldCaseSummary['status']
): 'info' | 'elevated' | 'good' {
  if (status === 'ANALYZED') return 'good';
  if (status === 'READY_FOR_REVIEW') return 'elevated';
  return 'info';
}

function formatStatusLabel(status: NegotiationShieldCaseSummary['status']) {
  return status
    .toLowerCase()
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function ScenarioCard({
  propertyId,
  card,
  active,
}: {
  propertyId: string;
  card: ScenarioCardDefinition;
  active: boolean;
}) {
  const Icon = card.icon;

  return (
    <Link
      href={card.href(propertyId)}
      className={`no-brand-style block rounded-[20px] border p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)] transition-colors ${
        active
          ? 'border-[hsl(var(--mobile-brand-border))] bg-[linear-gradient(145deg,hsl(var(--mobile-brand-soft)),#fff7e3)]'
          : 'border-[hsl(var(--mobile-border-subtle))] bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <IconBadge tone={active ? 'brand' : 'info'}>
          <Icon className="h-4 w-4" />
        </IconBadge>
        {active ? <StatusChip tone="info">Selected</StatusChip> : null}
      </div>
      <div className="mt-4 space-y-1.5">
        <p className="mb-0 text-base font-semibold text-[hsl(var(--mobile-text-primary))]">
          {card.title}
        </p>
        <p className="mb-0 text-sm leading-6 text-[hsl(var(--mobile-text-secondary))]">
          {card.description}
        </p>
      </div>
    </Link>
  );
}

export default function NegotiationShieldToolClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const propertyId = params.id;
  const selectedScenario = searchParams.get('scenario');

  const propertyQuery = useQuery({
    queryKey: ['property', propertyId],
    queryFn: async () => {
      const response = await api.getProperty(propertyId);
      return response.data as Property;
    },
    enabled: Boolean(propertyId),
  });

  const casesQuery = useQuery({
    queryKey: ['negotiation-shield-cases', propertyId],
    queryFn: () => listNegotiationShieldCases(propertyId),
    enabled: Boolean(propertyId),
  });

  const propertyLabel = formatPropertyLabel(propertyQuery.data, propertyId);
  const selectedScenarioCard =
    SCENARIO_CARDS.find((card) => card.key === selectedScenario) ?? null;
  const recentCases = (casesQuery.data ?? []).slice(0, 3);

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to property
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow="Home Tool"
        title="Negotiation Shield"
        subtitle={`Use ${propertyLabel} to review contractor quotes and insurance premium increases with clearer leverage and a response-ready workflow.`}
      />

      <MobileFilterSurface>
        <HomeToolsRail propertyId={propertyId} />
      </MobileFilterSurface>

      <MobileSection>
        <SummaryCard
          title="When to use it"
          subtitle="Bring in a quote, renewal notice, or your own notes. Negotiation Shield helps organize the evidence before you respond."
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {SCENARIO_CARDS.map((card) => (
              <ScenarioCard
                key={card.key}
                propertyId={propertyId}
                card={card}
                active={selectedScenarioCard?.key === card.key}
              />
            ))}
          </div>
        </SummaryCard>
      </MobileSection>

      <MobileSection>
        <SummaryCard
          title="Entry point"
          subtitle={
            selectedScenarioCard
              ? `${selectedScenarioCard.title} is selected. Step 7 will add the full create-and-review flow here.`
              : 'Choose a scenario to focus the upcoming create-and-review flow.'
          }
        >
          <div className="space-y-2.5">
            <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-4 py-3">
              <p className="mb-0 text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
                {selectedScenarioCard
                  ? `${selectedScenarioCard.title} ready`
                  : 'Select a scenario to get started'}
              </p>
              <p className="mb-0 mt-1 text-sm leading-6 text-[hsl(var(--mobile-text-secondary))]">
                {selectedScenarioCard
                  ? 'Case setup, input collection, and document upload wiring will land in the next UI step.'
                  : 'You can already deep-link into this page now, and recent cases will appear below as the workflow UI is added.'}
              </p>
            </div>
            {selectedScenarioCard ? (
              <Button asChild className="min-h-[44px] w-full sm:w-auto">
                <Link href={selectedScenarioCard.href(propertyId)}>
                  Continue with {selectedScenarioCard.title}
                </Link>
              </Button>
            ) : null}
          </div>
        </SummaryCard>
      </MobileSection>

      <MobileSection>
        <MobileSectionHeader
          title="Recent cases"
          subtitle="A compact preview from the property-scoped backend list. Full list and detail UI comes next."
        />
        <SummaryCard
          title="Case activity"
          subtitle={
            casesQuery.isLoading
              ? 'Loading recent Negotiation Shield activity...'
              : recentCases.length > 0
                ? 'Your latest case summaries are ready for the next workflow step.'
                : 'No Negotiation Shield cases yet. Start with a contractor quote or premium increase when you are ready.'
          }
        >
          {casesQuery.isError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              We could not load recent cases right now.
            </div>
          ) : casesQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`negotiation-shield-loading-${index}`}
                  className="h-16 animate-pulse rounded-xl bg-[hsl(var(--mobile-bg-muted))]"
                />
              ))}
            </div>
          ) : recentCases.length > 0 ? (
            <div className="space-y-2">
              {recentCases.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <IconBadge tone="info">
                      <ShieldCheck className="h-4 w-4" />
                    </IconBadge>
                    <div className="min-w-0">
                      <p className="mb-0 truncate text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
                        {item.title}
                      </p>
                      <p className="mb-0 mt-1 text-xs text-[hsl(var(--mobile-text-secondary))]">
                        {formatCaseSubtitle(item)}
                      </p>
                    </div>
                  </div>
                  <StatusChip tone={getStatusTone(item.status)}>
                    {formatStatusLabel(item.status)}
                  </StatusChip>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-4 py-4 text-sm leading-6 text-[hsl(var(--mobile-text-secondary))]">
              Recent cases will appear here once the create flow is live. The backend list wiring is already connected for this property.
            </div>
          )}
        </SummaryCard>
      </MobileSection>
    </MobilePageContainer>
  );
}
