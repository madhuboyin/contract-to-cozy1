'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import { track } from '@/lib/analytics/events';
import ToolExplainerSection from '@/components/tool-explainer/ToolExplainerSection';
import { coverageLoopTrust } from '@/lib/trust/trustPresets';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import InsuranceTrendClient from '../insurance-trend/InsuranceTrendClient';
import RiskPremiumOptimizerPanel from '@/components/ai/RiskPremiumOptimizerPanel';
import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
import { PropertyContextCapturePanel } from '@/components/property-context/PropertyContextCapturePanel';
import PolicyRecordReadinessPanel from '@/components/coverage/PolicyRecordReadinessPanel';
import CoverageReviewQuestionsPanel from '@/components/coverage/CoverageReviewQuestionsPanel';
import CoverageComparisonPanel from '@/components/coverage/CoverageComparisonPanel';
import CoverageTermReviewPanel from '@/components/coverage/CoverageTermReviewPanel';
import InsuranceHandoffPanel from '@/components/coverage/InsuranceHandoffPanel';
import InsuranceMarketContextPanel from '@/components/coverage/InsuranceMarketContextPanel';

type CoverageStage = 'current' | 'questions' | 'renewal' | 'compare' | 'risk';

const STAGES: { key: CoverageStage; label: string; description: string }[] = [
  { key: 'current', label: 'Current protection', description: 'Review the records currently available.' },
  { key: 'questions', label: 'Questions', description: 'Resolve missing or incomplete protection records.' },
  { key: 'renewal', label: 'Renewal', description: 'Review observed confirmed term changes.' },
  { key: 'compare', label: 'Compare choices', description: 'See equivalence, unknowns, and tradeoffs.' },
  { key: 'risk', label: 'Reduce loss risk', description: 'Plan loss-prevention work without savings promises.' },
];

// Only stages whose question maps to an existing deterministic Ask operation seed a prompt; Renewal opens Ask unseeded until a renewal comparison exists.
const ASK_STAGE_QUESTIONS: Partial<Record<CoverageStage, string>> = {
  current: 'Show gaps in my home protection.',
  questions: 'What questions should I ask my insurer?',
  compare: 'Compare my current insurance policy against alternatives.',
  risk: 'What loss-prevention work matters most?',
};

// Opened from a guided journey, the link continues that journey in Ask (the read that shows where it stands and its in-Ask step action) instead of a stage
// question. Only the journey travels: the Ask coverage answers are about the home's current policy, not one policy chosen by id, and the journey's own step
// action carries the step. The journey id is checked against the property on the server.
const ASK_JOURNEY_QUESTION = 'Continue this guided journey.';

export default function CoverageIntelligenceToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const requestedStage = searchParams.get('stage');
  // The exact policy a Home Action refers to (FRD v1.171). Without it the panel guesses: first applicable policy, then latest expiry.
  const requestedPolicyId = searchParams.get('policyId');
  const legacyTab = searchParams.get('tab');
  const activeStage: CoverageStage =
    requestedStage === 'questions' ||
    requestedStage === 'renewal' ||
    requestedStage === 'compare' ||
    requestedStage === 'risk'
      ? requestedStage
      : legacyTab === 'options'
        ? 'questions'
        : 'current';
  const selectedInventoryItemId =
    searchParams.get('itemId') ?? searchParams.get('inventoryItemId');
  const fromProtect = searchParams.get('from') === 'protect';
  const guidanceOverviewHref = guidanceJourneyId
    ? buildGuidanceOverviewHref({
        propertyId,
        journeyId: guidanceJourneyId,
        stepKey: guidanceStepKey,
        inventoryItemId: searchParams.get('itemId') ?? searchParams.get('inventoryItemId'),
        issueType: searchParams.get('issueType'),
      })
    : null;

  const isGuidanceContext = Boolean(guidanceJourneyId);

  useEffect(() => {
    if (!propertyId) return;
    track('workflow_started', { tool: 'coverage-intelligence', propertyId, entryPoint: isGuidanceContext ? 'guidance' : 'direct' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId || !selectedInventoryItemId) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('itemId', selectedInventoryItemId);
    next.set('inventoryItemId', selectedInventoryItemId);
    const fallbackReturnParams = new URLSearchParams(searchParams.toString());
    fallbackReturnParams.delete('itemId');
    fallbackReturnParams.delete('inventoryItemId');
    fallbackReturnParams.delete('returnTo');
    const fallbackReturnQuery = fallbackReturnParams.toString();
    next.set(
      'returnTo',
      guidanceOverviewHref ??
        (
          fallbackReturnQuery
            ? `/dashboard/properties/${propertyId}/tools/coverage-intelligence?${fallbackReturnQuery}`
            : `/dashboard/properties/${propertyId}/tools/coverage-intelligence`
        )
    );
    router.replace(
      `/dashboard/properties/${propertyId}/inventory/items/${selectedInventoryItemId}/coverage?${next.toString()}`
    );
  }, [guidanceOverviewHref, propertyId, router, searchParams, selectedInventoryItemId]);

  if (selectedInventoryItemId) {
    return null;
  }

  function switchStage(stage: CoverageStage) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('tab');
    if (stage === 'current') {
      next.delete('stage');
    } else {
      next.set('stage', stage);
    }
    router.replace(`/dashboard/properties/${propertyId}/tools/coverage-intelligence?${next.toString()}`);
  }

  const backHref = guidanceOverviewHref
    ? guidanceOverviewHref
    : fromProtect
      ? `/dashboard/properties/${propertyId}/protect`
      : `/dashboard/properties/${propertyId}`;
  const backLabel = guidanceOverviewHref
    ? 'Back to guidance'
    : fromProtect
      ? 'Back to Protect'
      : 'Back to property';
  const trust = coverageLoopTrust({
    confidenceLabel: 'Record review only; confidence depends on confirmed policy facts',
    freshnessLabel: 'Updates when coverage documents, warranties, or inventory change',
    sourceLabel: 'Linked policy records + property inventory + homeowner-confirmed details',
  });

  const currentQuery = searchParams.toString();
  const askHref = buildAskWorkspaceHref({
    propertyId,
    ...(guidanceJourneyId
      ? {
        question: ASK_JOURNEY_QUESTION,
        launchOperationId: 'GUIDANCE_JOURNEY_CONTINUE',
        launchEntityType: 'GUIDANCE_JOURNEY',
        launchEntityId: guidanceJourneyId,
        launchJourneyId: guidanceJourneyId,
      }
      : { question: ASK_STAGE_QUESTIONS[activeStage] }),
    from: 'coverage-intelligence',
    launchSurface: 'COVERAGE_INTELLIGENCE_TOOL',
    launchCapabilityId: 'coverage-intelligence',
    backTo: `/dashboard/properties/${propertyId}/tools/coverage-intelligence${currentQuery ? `?${currentQuery}` : ''}`,
  });

  const tabNav = (
    <div role="tablist" aria-label="Coverage and premium review stages" className="grid gap-1 rounded-xl border border-border bg-muted/40 p-1 sm:grid-cols-2 lg:grid-cols-5">
      {STAGES.map(({ key, label, description }) => (
        <button
          key={key}
          role="tab"
          aria-selected={activeStage === key}
          aria-controls={`coverage-stage-${key}`}
          onClick={() => switchStage(key)}
          className={`rounded-lg px-3 py-2 text-left transition-colors ${
            activeStage === key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="block text-xs font-semibold">{label}</span>
          <span className="mt-0.5 block text-[11px] leading-snug opacity-75">{description}</span>
        </button>
      ))}
    </div>
  );

  return (
    <ToolWorkspaceTemplate
      backHref={backHref}
      backLabel={backLabel}
      eyebrow={fromProtect ? 'Full review' : 'Protection workspace'}
      title="Coverage & Premium Review"
      subtitle={
        fromProtect
          ? 'Review current records, material questions, renewal context, and loss-prevention actions.'
          : 'See what the Home Record knows, identify questions worth resolving, and prepare for renewal.'
      }
      trust={trust}
      introAction={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={askHref}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 text-sm font-semibold text-teal-900 hover:bg-teal-100"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {guidanceJourneyId ? 'Continue in Ask Cozy' : 'Ask Cozy'}
          </Link>
          <HomeToolsRail propertyId={propertyId} showDesktop={false} />
        </div>
      }
    >
      {/* Tab navigation */}
      {tabNav}

      {activeStage === 'current' && (
        <ToolExplainerSection toolKey="coverageIntelligence" id="how-it-works" />
      )}

      {/* Tab content */}
      {activeStage === 'current' && (
        <div id="coverage-stage-current" role="tabpanel" className="space-y-4">
          <PolicyRecordReadinessPanel propertyId={propertyId} policyId={requestedPolicyId} />
          <CoverageTermReviewPanel propertyId={propertyId} guidanceJourneyId={guidanceJourneyId} guidanceStepKey={guidanceStepKey} />
          <PropertyContextCapturePanel
            propertyId={propertyId}
            featureKey="COVERAGE_INTELLIGENCE"
            operationKey="ASSESS_PROPERTY_COVERAGE"
          />
        </div>
      )}
      {activeStage === 'questions' && (
        <div id="coverage-stage-questions" role="tabpanel">
          <CoverageReviewQuestionsPanel propertyId={propertyId} />
        </div>
      )}
      {activeStage === 'renewal' && (
        <div id="coverage-stage-renewal" role="tabpanel" className="space-y-4">
          <InsuranceTrendClient embedded />
          <InsuranceMarketContextPanel propertyId={propertyId} />
        </div>
      )}
      {activeStage === 'compare' && (
        <div id="coverage-stage-compare" role="tabpanel" className="space-y-4">
          <CoverageComparisonPanel
            propertyId={propertyId}
            guidanceJourneyId={guidanceJourneyId}
            guidanceStepKey={guidanceStepKey}
            guidanceStepId={searchParams.get('guidanceStepId')}
            sourceActionId={searchParams.get('sourceActionId')}
          />
          <InsuranceHandoffPanel propertyId={propertyId} />
        </div>
      )}
      {activeStage === 'risk' && (
        <div id="coverage-stage-risk" role="tabpanel" className="space-y-4">
          <RiskPremiumOptimizerPanel propertyId={propertyId} />
        </div>
      )}

    </ToolWorkspaceTemplate>
  );
}
