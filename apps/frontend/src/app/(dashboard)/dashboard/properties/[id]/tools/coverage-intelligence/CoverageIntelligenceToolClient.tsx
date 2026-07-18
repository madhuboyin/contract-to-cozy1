'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { TrendingUp } from 'lucide-react';
import HomeToolsRail from '../../components/HomeToolsRail';
import { track } from '@/lib/analytics/events';
import CoverageIntelligencePanel from '@/components/ai/CoverageIntelligencePanel';
import ToolExplainerSection from '@/components/tool-explainer/ToolExplainerSection';
import { coverageLoopTrust } from '@/lib/trust/trustPresets';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import CoverageOptionsClient from '../coverage-options/CoverageOptionsClient';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
import { PropertyContextCapturePanel } from '@/components/property-context/PropertyContextCapturePanel';

type CoverageTab = 'coverage' | 'options';

const TABS: { key: CoverageTab; label: string }[] = [
  { key: 'coverage', label: 'Coverage' },
  { key: 'options', label: 'Options' },
];

export default function CoverageIntelligenceToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const rawTab = searchParams.get('tab') as CoverageTab | null;
  const activeTab: CoverageTab = rawTab === 'options' ? 'options' : 'coverage';
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

  function switchTab(tab: CoverageTab) {
    const next = new URLSearchParams(searchParams.toString());
    if (tab === 'coverage') {
      next.delete('tab');
    } else {
      next.set('tab', tab);
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
    confidenceLabel: 'Medium-High, based on linked policy and inventory signals',
    freshnessLabel: 'Updates when coverage documents, warranties, or inventory change',
    sourceLabel: 'Coverage graph + property inventory + policy details',
  });

  const tabNav = (
    <div role="tablist" aria-label="Coverage views" className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          role="tab"
          aria-selected={activeTab === key}
          onClick={() => switchTab(key)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <ToolWorkspaceTemplate
      backHref={backHref}
      backLabel={backLabel}
      eyebrow={fromProtect ? 'Full audit report' : 'Home tool'}
      title="Coverage Intelligence"
      subtitle={
        fromProtect
          ? 'Full property coverage audit — insurance, warranty economics, and decision trace.'
          : 'Insurance and warranty coverage assessment for this property.'
      }
      trust={trust}
      introAction={
        <HomeToolsRail propertyId={propertyId} showDesktop={false} />
      }
    >
      {/* Tab navigation */}
      {tabNav}

      {activeTab === 'coverage' && (
        <ToolExplainerSection toolKey="coverageIntelligence" id="how-it-works" />
      )}

      {/* Tab content */}
      {activeTab === 'coverage' && (
        <>
          <CoverageIntelligencePanel propertyId={propertyId} />
          <PropertyContextCapturePanel
            propertyId={propertyId}
            featureKey="COVERAGE_INTELLIGENCE"
            operationKey="ASSESS_PROPERTY_COVERAGE"
          />
          <Link
            href={`/dashboard/properties/${propertyId}/tools/insurance-trend?from=coverage-intelligence`}
            className="flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 text-sm hover:bg-teal-50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <TrendingUp className="h-4 w-4 shrink-0 text-teal-700" />
              <span className="text-teal-900">
                <span className="font-medium">See how local premiums are trending</span>
                <span className="ml-1.5 text-teal-700">— compare your estimate against your area in Home Lab</span>
              </span>
            </div>
            <span className="shrink-0 text-teal-700">→</span>
          </Link>
        </>
      )}
      {activeTab === 'options' && (
        <CoverageOptionsClient />
      )}

    </ToolWorkspaceTemplate>
  );
}
