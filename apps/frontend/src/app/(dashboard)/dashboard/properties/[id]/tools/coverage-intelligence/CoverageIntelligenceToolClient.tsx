'use client';

import { useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import { track } from '@/lib/analytics/events';
import CoverageIntelligencePanel from '@/components/ai/CoverageIntelligencePanel';
import ToolExplainerSection from '@/components/tool-explainer/ToolExplainerSection';
import { coverageLoopTrust } from '@/lib/trust/trustPresets';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import CoverageOptionsClient from '../coverage-options/CoverageOptionsClient';
import InsuranceTrendClient from '../insurance-trend/InsuranceTrendClient';
import RiskPremiumOptimizerPanel from '@/components/ai/RiskPremiumOptimizerPanel';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
import { PropertyContextCapturePanel } from '@/components/property-context/PropertyContextCapturePanel';

type CoverageStage = 'current' | 'questions' | 'renewal' | 'risk';

const STAGES: { key: CoverageStage; label: string; description: string }[] = [
  { key: 'current', label: 'Current protection', description: 'Review the records currently available.' },
  { key: 'questions', label: 'Questions', description: 'Resolve missing or incomplete protection records.' },
  { key: 'renewal', label: 'Renewal', description: 'Review modeled regional cost context.' },
  { key: 'risk', label: 'Reduce loss risk', description: 'Plan loss-prevention work without savings promises.' },
];

export default function CoverageIntelligenceToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const requestedStage = searchParams.get('stage');
  const legacyTab = searchParams.get('tab');
  const activeStage: CoverageStage =
    requestedStage === 'questions' ||
    requestedStage === 'renewal' ||
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

  const tabNav = (
    <div role="tablist" aria-label="Coverage and premium review stages" className="grid gap-1 rounded-xl border border-border bg-muted/40 p-1 sm:grid-cols-2 lg:grid-cols-4">
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
        <HomeToolsRail propertyId={propertyId} showDesktop={false} />
      }
    >
      {/* Tab navigation */}
      {tabNav}

      {activeStage === 'current' && (
        <ToolExplainerSection toolKey="coverageIntelligence" id="how-it-works" />
      )}

      {/* Tab content */}
      {activeStage === 'current' && (
        <div id="coverage-stage-current" role="tabpanel">
          <CoverageIntelligencePanel propertyId={propertyId} />
          <PropertyContextCapturePanel
            propertyId={propertyId}
            featureKey="COVERAGE_INTELLIGENCE"
            operationKey="ASSESS_PROPERTY_COVERAGE"
          />
        </div>
      )}
      {activeStage === 'questions' && (
        <div id="coverage-stage-questions" role="tabpanel">
          <CoverageOptionsClient />
        </div>
      )}
      {activeStage === 'renewal' && (
        <div id="coverage-stage-renewal" role="tabpanel">
          <InsuranceTrendClient embedded />
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
