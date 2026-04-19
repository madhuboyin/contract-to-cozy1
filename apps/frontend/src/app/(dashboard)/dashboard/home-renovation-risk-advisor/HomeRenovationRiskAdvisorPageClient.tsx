'use client';

// apps/frontend/src/app/(dashboard)/dashboard/home-renovation-risk-advisor/HomeRenovationRiskAdvisorPageClient.tsx
// Home Renovation Risk Advisor — mobile-first advisor page

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, Hammer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { api } from '@/lib/api/client';
import {
  MobilePageContainer,
  MobileSection,
  MobileSectionHeader,
  EmptyStateCard,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { MOBILE_TYPE_TOKENS, MOBILE_CARD_RADIUS } from '@/components/mobile/dashboard/mobileDesignTokens';
import { AdvisorInputCard } from '@/components/features/homeRenovationAdvisor/AdvisorInputCard';
import { AdvisorSummaryCard } from '@/components/features/homeRenovationAdvisor/AdvisorSummaryCard';
import { AdvisorPermitCard } from '@/components/features/homeRenovationAdvisor/AdvisorPermitCard';
import { AdvisorTaxCard } from '@/components/features/homeRenovationAdvisor/AdvisorTaxCard';
import { AdvisorLicensingCard } from '@/components/features/homeRenovationAdvisor/AdvisorLicensingCard';
import { AdvisorAssumptionsCard } from '@/components/features/homeRenovationAdvisor/AdvisorAssumptionsCard';
import { AdvisorWarningsCard } from '@/components/features/homeRenovationAdvisor/AdvisorWarningsCard';
import { AdvisorNextActionsCard } from '@/components/features/homeRenovationAdvisor/AdvisorNextActionsCard';
import { AdvisorSkeleton } from '@/components/features/homeRenovationAdvisor/AdvisorSkeleton';
import { AdvisorLinkedIntegrations } from '@/components/features/homeRenovationAdvisor/AdvisorLinkedIntegrations';
import { AdvisorRetroactiveBar } from '@/components/features/homeRenovationAdvisor/AdvisorRetroactiveBar';
import { AdvisorDisclaimerBar } from '@/components/features/homeRenovationAdvisor/AdvisorDisclaimerBar';
import {
  formatRenovationType,
  formatRiskLevel,
  formatConfidence,
  riskColorClass,
  confidenceColorClass,
} from '@/components/features/homeRenovationAdvisor/AdvisorUtils';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import type { RenovationAdvisorSession, Property } from '@/types';

// ---------------------------------------------------------------------------
// Hero card
// ---------------------------------------------------------------------------

function AdvisorHero({ propertyAddress }: { propertyAddress?: string }) {
  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))]',
        'bg-[linear-gradient(145deg,hsl(var(--mobile-brand-soft)),#fff)]',
        'p-4'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--mobile-brand-border))] bg-white">
          <Hammer className="h-4 w-4 text-[hsl(var(--mobile-brand-strong))]" />
        </div>
        <div className="min-w-0">
          <p className="mb-0 text-[11px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
            Home Tool
          </p>
          <h1 className="mb-0 text-base font-semibold leading-tight text-[hsl(var(--mobile-text-primary))]">
            Renovation Risk Advisor
          </h1>
          <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
            Check permit rules, property tax impact, and contractor requirements before starting a major renovation.
          </p>
          {propertyAddress && (
            <p className={cn('mb-0 mt-1.5 text-[hsl(var(--mobile-brand-strong))]', MOBILE_TYPE_TOKENS.caption)}>
              For: {propertyAddress}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop sidebar
// ---------------------------------------------------------------------------

function AdvisorDesktopSidebar({
  propertyAddress,
  session,
}: {
  propertyAddress?: string;
  session: RenovationAdvisorSession | null;
}) {
  const riskColors = session ? riskColorClass(session.overallRiskLevel) : null;
  const confidenceClass = session ? confidenceColorClass(session.overallConfidence) : null;

  return (
    <aside className="hidden space-y-4 lg:block lg:sticky lg:top-4">
      {/* Property context card */}
      <div
        className={cn(
          MOBILE_CARD_RADIUS,
          'border border-[hsl(var(--mobile-border-subtle))] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.07)]'
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-primary))]">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="mb-0 text-[11px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
              Property
            </p>
            <p className="mb-0 mt-1 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              {propertyAddress || 'Current property'}
            </p>
            <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
              Jurisdiction-specific rules are derived from your property location.
            </p>
          </div>
        </div>

        {session && session.status === 'COMPLETED' && (
          <div className="mt-4 space-y-2">
            <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3.5 py-3">
              <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Renovation type</p>
              <p className="mb-0 mt-1 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                {formatRenovationType(session.renovationType)}
              </p>
            </div>
            {riskColors && (
              <div className={cn('rounded-2xl border px-3.5 py-3', riskColors.bg, riskColors.border)}>
                <p className={cn('mb-0', MOBILE_TYPE_TOKENS.caption, riskColors.text)}>Overall risk</p>
                <p className={cn('mb-0 mt-1 text-sm font-semibold', riskColors.text)}>
                  {formatRiskLevel(session.overallRiskLevel)}
                </p>
              </div>
            )}
            {confidenceClass && (
              <div className={cn('rounded-2xl border px-3.5 py-3', confidenceClass)}>
                <p className={cn('mb-0', MOBILE_TYPE_TOKENS.caption)}>Confidence</p>
                <p className="mb-0 mt-1 text-sm font-semibold">
                  {formatConfidence(session.overallConfidence)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* How it works card */}
      <div
        className={cn(
          MOBILE_CARD_RADIUS,
          'border border-[hsl(var(--mobile-border-subtle))] bg-[linear-gradient(160deg,#ffffff,hsl(var(--mobile-brand-soft)))] p-5'
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--mobile-brand-border))] bg-white text-[hsl(var(--mobile-brand-strong))]">
            <Hammer className="h-4 w-4" />
          </div>
          <div>
            <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">How it works</p>
            <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
              Select a renovation type and run a check. The advisor uses your property location to estimate permit requirements, tax impact, and contractor licensing.
            </p>
            <p className={cn('mb-0 mt-3 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
              Estimates use national fallback rules when local data is limited. Always verify with your local building department.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function AdvisorEmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))] bg-white p-6 text-center shadow-[0_8px_24px_rgba(15,23,42,0.04)]'
      )}
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))]">
        <Hammer className="h-5 w-5 text-[hsl(var(--mobile-brand-strong))]" />
      </div>
      <h3 className="mb-2 text-base font-semibold text-[hsl(var(--mobile-text-primary))]">
        Check before you build
      </h3>
      <p className={cn('mb-4 mx-auto max-w-xs text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
        Select a renovation type above and run the advisor to see permit requirements, estimated tax impact, and contractor licensing rules.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-5 py-2.5 text-sm font-semibold text-white"
      >
        Get started
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function compactPropertyAddress(property: Property | null | undefined): string {
  if (!property) return '';
  const locality = [property.city, property.state].filter(Boolean).join(', ');
  return [property.address, locality].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type HomeRenovationRiskAdvisorPageClientProps = {
  propertyId?: string;
};

export default function HomeRenovationRiskAdvisorPageClient({
  propertyId: propertyIdOverride,
}: HomeRenovationRiskAdvisorPageClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const propertyId = propertyIdOverride ?? selectedPropertyId ?? searchParams.get('propertyId') ?? undefined;

  React.useEffect(() => {
    if (!propertyIdOverride) return;
    if (selectedPropertyId !== propertyIdOverride) {
      setSelectedPropertyId(propertyIdOverride);
    }
  }, [propertyIdOverride, selectedPropertyId, setSelectedPropertyId]);

  // Session state
  const [currentSessionId, setCurrentSessionId] = React.useState<string | null>(
    () => searchParams.get('sessionId') ?? null
  );
  const [renovationType, setRenovationType] = React.useState('');
  const [projectCost, setProjectCost] = React.useState('');

  // Reset session when property changes
  React.useEffect(() => {
    setCurrentSessionId(null);
    setRenovationType('');
    setProjectCost('');
  }, [propertyId]);

  // Keep the session id reflected in the canonical property-scoped URL.
  React.useEffect(() => {
    if (!propertyId) return;
    const params = new URLSearchParams();
    if (currentSessionId) params.set('sessionId', currentSessionId);
    const suffix = params.toString();
    const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-renovation-risk-advisor${
      suffix ? `?${suffix}` : ''
    }`;
    router.replace(href, { scroll: false });
  }, [currentSessionId, propertyId, router]);

  // -------------------------------------------------------------------------
  // Data queries
  // -------------------------------------------------------------------------

  const propertyQuery = useQuery({
    queryKey: ['advisor-property', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const response = await api.getProperty(propertyId);
      if (!response.success) return null;
      return response.data as Property;
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const sessionQuery = useQuery({
    queryKey: ['renovation-advisor-session', currentSessionId],
    queryFn: async () => {
      if (!currentSessionId) return null;
      return api.getRenovationAdvisorSession(currentSessionId);
    },
    enabled: !!currentSessionId,
    staleTime: 2 * 60 * 1000,
    refetchInterval: (query) => {
      // Poll while evaluating
      return query.state.data?.status === 'PROCESSING' ? 2000 : false;
    },
  });

  const currentSession = sessionQuery.data ?? null;
  const property = propertyQuery.data ?? null;
  const propertyAddress = compactPropertyAddress(property);

  // Pre-fill renovation type from existing session
  React.useEffect(() => {
    if (currentSession && !renovationType) {
      setRenovationType(currentSession.renovationType);
    }
  }, [currentSession, renovationType]);

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const createAndEvaluateMutation = useMutation({
    mutationFn: async () => {
      if (!propertyId || !renovationType) throw new Error('Missing required fields');

      const costValue = projectCost ? parseFloat(projectCost) : undefined;

      // Create session
      const created = await api.createRenovationAdvisorSession({
        propertyId,
        renovationType,
        entryPoint: 'HOME_TOOLS',
        flowType: 'EXPLICIT_PRE_PROJECT',
        projectCostInput: costValue,
      });

      // Evaluate immediately
      const evaluated = await api.evaluateRenovationAdvisorSession(created.id, {
        forceRefresh: false,
        evaluationMode: 'FULL',
      });

      return evaluated;
    },
    onSuccess: (session) => {
      setCurrentSessionId(session.id);
      queryClient.setQueryData(['renovation-advisor-session', session.id], session);
    },
  });

  const rerunMutation = useMutation({
    mutationFn: async () => {
      if (!currentSessionId) throw new Error('No session');
      const costValue = projectCost ? parseFloat(projectCost) : undefined;

      // Update inputs if changed
      await api.updateRenovationAdvisorSession(currentSessionId, {
        projectCostInput: costValue ?? null,
      });

      // Re-evaluate
      return api.evaluateRenovationAdvisorSession(currentSessionId, {
        forceRefresh: true,
        evaluationMode: 'FULL',
      });
    },
    onSuccess: (session) => {
      queryClient.setQueryData(['renovation-advisor-session', session.id], session);
    },
  });

  const isEvaluating =
    createAndEvaluateMutation.isPending ||
    rerunMutation.isPending ||
    currentSession?.status === 'PROCESSING';

  function handleRun() {
    const renovationTypeChanged =
      currentSession && currentSession.renovationType !== renovationType;

    if (currentSessionId && !renovationTypeChanged) {
      // Same renovation type — re-run the existing session
      rerunMutation.mutate();
    } else {
      // No session, or renovation type changed — always create a fresh session
      setCurrentSessionId(null);
      createAndEvaluateMutation.mutate();
    }
  }

  // -------------------------------------------------------------------------
  // No property selected
  // -------------------------------------------------------------------------

  if (!propertyId) {
    return (
      <MobilePageContainer className="space-y-7 py-3 lg:max-w-2xl lg:px-8 lg:pb-10">
        <MobileSection>
          <Link
            href="/dashboard"
            className="no-brand-style inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
        </MobileSection>
        <EmptyStateCard
          title="Select a property"
          description="Renovation Risk Advisor requires a selected property to check local permit, tax, and licensing rules."
          action={
            <Link
              href="/dashboard/properties"
              className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 text-sm font-semibold text-white"
            >
              Open Properties
            </Link>
          }
        />
      </MobilePageContainer>
    );
  }

  // -------------------------------------------------------------------------
  // Jurisdiction label from property
  // -------------------------------------------------------------------------

  const jurisdictionLabel = property
    ? [property.city, property.state, property.zipCode].filter(Boolean).join(', ')
    : null;

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  const hasResult = currentSession?.status === 'COMPLETED' || currentSession?.status === 'PARTIAL';
  const hasFailed = currentSession?.status === 'FAILED';
  const mutationError = createAndEvaluateMutation.error ?? rerunMutation.error;

  return (
    <MobilePageContainer className="space-y-5 py-3 lg:max-w-7xl lg:px-8 lg:pb-10">
      <MobileSection className="lg:space-y-4">
        <Link
          href={`/dashboard?propertyId=${encodeURIComponent(propertyId)}`}
          className="no-brand-style inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
      </MobileSection>

      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:space-y-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {/* Hero */}
          <MobileSection className="lg:hidden">
            <AdvisorHero propertyAddress={propertyAddress || undefined} />
          </MobileSection>

          <HomeToolHeader
            toolId="home-renovation-risk-advisor"
            propertyId={propertyId}
            monitoringAddress={propertyAddress || undefined}
          />

          {/* Retroactive context banner */}
          {currentSession?.flowType === 'RETROACTIVE_COMPLIANCE' && (
            <MobileSection>
              <AdvisorRetroactiveBar
                renovationLabel={
                  currentSession.renovationLabel || formatRenovationType(currentSession.renovationType)
                }
              />
            </MobileSection>
          )}

          {/* Input card */}
          <MobileSection>
            <AdvisorInputCard
              renovationType={renovationType}
              projectCost={projectCost}
              jurisdictionLabel={jurisdictionLabel}
              isEvaluating={isEvaluating}
              hasExistingSession={!!currentSessionId}
              onRenovationTypeChange={setRenovationType}
              onProjectCostChange={setProjectCost}
              onRun={handleRun}
            />
          </MobileSection>

          {/* Error state */}
          {mutationError && (
            <MobileSection>
              <EmptyStateCard
                title="Check failed"
                description="There was a problem running the renovation check. Please try again."
                action={
                  <button
                    type="button"
                    onClick={handleRun}
                    className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
                  >
                    Retry
                  </button>
                }
              />
            </MobileSection>
          )}

          {/* Session failed state */}
          {hasFailed && !mutationError && (
            <MobileSection>
              <EmptyStateCard
                title="Check could not complete"
                description="The advisor was unable to evaluate this renovation type. Try again or select a different renovation type."
              />
            </MobileSection>
          )}

          {/* Loading state */}
          {(sessionQuery.isLoading || isEvaluating) && !hasResult && (
            <MobileSection>
              <AdvisorSkeleton />
            </MobileSection>
          )}

          {/* Results */}
          {hasResult && currentSession && (
            <>
              <MobileSection>
                <MobileSectionHeader title="Results" />
                <AdvisorSummaryCard
                  session={currentSession}
                  onRerun={handleRun}
                  isRerunning={isEvaluating}
                />
                <AdvisorLinkedIntegrations
                  session={currentSession}
                  propertyId={propertyId}
                />
              </MobileSection>

              {/* Module cards */}
              <MobileSection className="space-y-3">
                <MobileSectionHeader title="Details" />
                {/* Unsupported area fallback — shown when no local data is available */}
                {currentSession.uiMeta?.unsupportedArea && (
                  <div
                    className={cn(
                      MOBILE_CARD_RADIUS,
                      'border border-amber-200 bg-amber-50 p-4',
                    )}
                  >
                    <p className="mb-1 text-sm font-semibold text-amber-800">
                      Limited local data available
                    </p>
                    <p className={cn('mb-0 text-amber-700', MOBILE_TYPE_TOKENS.caption)}>
                      Detailed permit, tax, and licensing data wasn&apos;t available for your specific area. The estimates below are based on national defaults — treat them as directional and verify requirements locally before making any decisions.
                    </p>
                  </div>
                )}
                {currentSession.permit && (
                  <AdvisorPermitCard permit={currentSession.permit} />
                )}
                {currentSession.taxImpact && (
                  <AdvisorTaxCard taxImpact={currentSession.taxImpact} />
                )}
                {currentSession.licensing && (
                  <AdvisorLicensingCard licensing={currentSession.licensing} />
                )}
              </MobileSection>

              {/* Warnings */}
              {currentSession.warnings.length > 0 && (
                <MobileSection>
                  <AdvisorWarningsCard warnings={currentSession.warnings} />
                </MobileSection>
              )}

              {/* Assumptions */}
              {currentSession.assumptions.length > 0 && (
                <MobileSection>
                  <AdvisorAssumptionsCard assumptions={currentSession.assumptions} />
                </MobileSection>
              )}

              {/* Next actions */}
              {currentSession.nextActions.length > 0 && (
                <MobileSection>
                  <AdvisorNextActionsCard nextActions={currentSession.nextActions} />
                </MobileSection>
              )}

              {/* Disclaimer */}
              <MobileSection>
                <AdvisorDisclaimerBar
                  disclaimerText={currentSession.disclaimerText}
                  disclaimerVersion={currentSession.disclaimerVersion}
                />
              </MobileSection>
            </>
          )}

          {/* Empty state — no session yet */}
          {!currentSessionId && !isEvaluating && !sessionQuery.isLoading && !mutationError && (
            <MobileSection>
              <AdvisorEmptyState
                onStart={() => {
                  if (renovationType) {
                    handleRun();
                  } else {
                    document.getElementById('renovation-type-select')?.focus();
                  }
                }}
              />
            </MobileSection>
          )}

          {/* Footer note */}
          <MobileSection>
            <div className="flex items-center justify-center gap-2 pb-2 text-xs text-[hsl(var(--mobile-text-muted))] lg:justify-start">
              <Hammer className="h-3.5 w-3.5" />
              Estimates use local jurisdiction rules. Always verify with your local building department.
            </div>
          </MobileSection>
        </div>

        {/* Desktop sidebar */}
        <AdvisorDesktopSidebar
          propertyAddress={propertyAddress || undefined}
          session={currentSession}
        />
      </div>
    </MobilePageContainer>
  );
}
