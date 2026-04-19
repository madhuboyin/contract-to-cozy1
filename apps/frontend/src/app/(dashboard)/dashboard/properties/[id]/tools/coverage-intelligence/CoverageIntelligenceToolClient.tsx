'use client';

import { useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import { track } from '@/lib/analytics/events';
import CoverageIntelligencePanel from '@/components/ai/CoverageIntelligencePanel';
import ToolExplainerSection from '@/components/tool-explainer/ToolExplainerSection';
import { GuidanceInlinePanel } from '@/components/guidance/GuidanceInlinePanel';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import { coverageLoopTrust } from '@/lib/trust/trustPresets';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import CoverageOptionsClient from '../coverage-options/CoverageOptionsClient';
import InsuranceTrendClient from '../insurance-trend/InsuranceTrendClient';

type CoverageTab = 'coverage' | 'options' | 'trend';

const TABS: { key: CoverageTab; label: string }[] = [
  { key: 'coverage', label: 'Coverage' },
  { key: 'options', label: 'Options' },
  { key: 'trend', label: 'Trend' },
];

export default function CoverageIntelligenceToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const rawTab = searchParams.get('tab') as CoverageTab | null;
  const activeTab: CoverageTab = rawTab === 'options' || rawTab === 'trend' ? rawTab : 'coverage';

  const isGuidanceContext = Boolean(guidanceJourneyId);

  useEffect(() => {
    if (!propertyId) return;
    track('workflow_started', { tool: 'coverage-intelligence', propertyId, entryPoint: isGuidanceContext ? 'guidance' : 'direct' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  function switchTab(tab: CoverageTab) {
    const next = new URLSearchParams(searchParams.toString());
    if (tab === 'coverage') {
      next.delete('tab');
    } else {
      next.set('tab', tab);
    }
    router.replace(`/dashboard/properties/${propertyId}/tools/coverage-intelligence?${next.toString()}`);
  }

  const backHref = isGuidanceContext
    ? `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${guidanceJourneyId}`
    : `/dashboard/properties/${propertyId}`;
  const trust = coverageLoopTrust({
    confidenceLabel: 'Medium-High, based on linked policy and inventory signals',
    freshnessLabel: 'Updates when coverage documents, warranties, or inventory change',
    sourceLabel: 'CtC coverage graph + property inventory + policy metadata',
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
      backLabel={isGuidanceContext ? 'Back to guidance' : 'Back to property'}
      eyebrow="Home Tool"
      title="Coverage Intelligence"
      subtitle="Insurance and warranty coverage assessment for this property."
      trust={trust}
      introAction={
        <HomeToolsRail propertyId={propertyId} showDesktop={false} />
      }
    >
      {/* Tab navigation */}
      {tabNav}

      {/* Standalone-only widgets — hidden when arriving from a guidance step */}
      {!isGuidanceContext && activeTab === 'coverage' && (
        <>
          <GuidanceInlinePanel
            propertyId={propertyId}
            title="Where This Tool Fits"
            subtitle="Coverage Intelligence is part of active guidance journeys. Complete the next required step after review."
            toolKey="coverage-intelligence"
            limit={1}
            journeyId={guidanceJourneyId}
          />

          <ToolExplainerSection toolKey="coverageIntelligence" id="how-it-works" />
        </>
      )}

      {/* Tab content */}
      {activeTab === 'coverage' && (
        <CoverageIntelligencePanel propertyId={propertyId} />
      )}
      {activeTab === 'options' && (
        <CoverageOptionsClient />
      )}
      {activeTab === 'trend' && (
        <InsuranceTrendClient />
      )}

      <GuidanceStepCompletionCard
        propertyId={propertyId}
        guidanceStepKey={guidanceStepKey}
        guidanceJourneyId={guidanceJourneyId}
        actionLabel="Mark coverage review complete"
      />
    </ToolWorkspaceTemplate>
  );
}
