'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import {
  ExpandableSummaryCard,
  MobilePageContainer,
  MobileSection,
  MobileSectionHeader,
  QuickActionGrid,
  QuickActionTile,
  SummaryCard,
} from '@/components/mobile/dashboard/MobilePrimitives';
import {
  MOBILE_AI_TOOL_CATALOG,
  MOBILE_AI_TOOL_GROUPS,
} from '@/components/mobile/dashboard/mobileToolCatalog';

function buildAiToolHref(propertyId: string | undefined, toolHref: string): string {
  if (!propertyId) return toolHref;
  const separator = toolHref.includes('?') ? '&' : '?';
  return `${toolHref}${separator}propertyId=${encodeURIComponent(propertyId)}`;
}

export default function AIToolsPage() {
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyIdFromQuery = searchParams.get('propertyId') || undefined;
  const resolvedPropertyId = selectedPropertyId || propertyIdFromQuery;

  const tools = MOBILE_AI_TOOL_CATALOG.filter((tool) => tool.key !== 'view-all');
  const groupedTools = MOBILE_AI_TOOL_GROUPS.map((group) => ({
    ...group,
    items: tools.filter((tool) => tool.group === group.key),
  })).filter((group) => group.items.length > 0);

  const dailySnapshotHref = `/dashboard/daily-snapshot${resolvedPropertyId ? `?propertyId=${encodeURIComponent(resolvedPropertyId)}` : ''}`;
  const riskRadarHref = `/dashboard/risk-radar${resolvedPropertyId ? `?propertyId=${encodeURIComponent(resolvedPropertyId)}` : ''}`;

  return (
    <MobilePageContainer className="space-y-7 pt-2 pb-24">
      <MobileSection>
        <MobileSectionHeader title="AI Tools" subtitle="Smart decision support for your home" />
      </MobileSection>

      {groupedTools.map((group, index) => (
        <MobileSection key={group.key}>
          <ExpandableSummaryCard
            title={group.title}
            summary={group.summary}
            metric={`${group.items.length} tools`}
            defaultOpen={index === 0}
          >
            <QuickActionGrid>
              {group.items.map((tool) => (
                <QuickActionTile
                  key={tool.key}
                  title={tool.title}
                  subtitle={tool.description}
                  icon={tool.emoji}
                  artworkSrc={tool.artworkSrc}
                  href={buildAiToolHref(resolvedPropertyId, tool.href)}
                />
              ))}
            </QuickActionGrid>
          </ExpandableSummaryCard>
        </MobileSection>
      ))}

      <MobileSection>
        <SummaryCard title="Intelligence Details" subtitle="Deep-dive pages from mobile home intelligence">
          <Link
            href={dailySnapshotHref}
            className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
          >
            Daily Snapshot
          </Link>
          <Link
            href={riskRadarHref}
            className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
          >
            Risk Radar
          </Link>
        </SummaryCard>
      </MobileSection>

      <MobileSection>
        <SummaryCard
          title="Need broader navigation?"
          subtitle="Use the More tab in bottom navigation for all pages and tools."
        >
          <Link
            href="/dashboard"
            className="no-brand-style inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
          >
            <Sparkles className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </SummaryCard>
      </MobileSection>
    </MobilePageContainer>
  );
}
