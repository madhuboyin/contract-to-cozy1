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
import { AI_TOOL_ARTWORK } from '@/components/mobile/dashboard/aiToolArtwork';

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

  const tools = [
    {
      title: 'Repair vs Replace',
      subtitle: 'Decision support for repairs',
      icon: '🛠️',
      trailingIcon: '🔧',
      artworkSrc: AI_TOOL_ARTWORK['repair-vs-replace'],
      href: buildAiToolHref(resolvedPropertyId, '/dashboard/replace-repair'),
    },
    {
      title: 'Coverage Intelligence',
      subtitle: 'Coverage gap analysis',
      icon: '🧾',
      trailingIcon: '✅',
      artworkSrc: AI_TOOL_ARTWORK['coverage-intelligence'],
      href: buildAiToolHref(resolvedPropertyId, '/dashboard/coverage-intelligence'),
    },
    {
      title: 'Risk Optimizer',
      subtitle: 'Premium pressure reduction',
      icon: '📉',
      trailingIcon: '🛡️',
      artworkSrc: AI_TOOL_ARTWORK['risk-optimizer'],
      href: buildAiToolHref(resolvedPropertyId, '/dashboard/risk-premium-optimizer'),
    },
    {
      title: 'Do-Nothing Simulator',
      subtitle: 'Cost of delayed action',
      icon: '⏳',
      trailingIcon: '📈',
      artworkSrc: AI_TOOL_ARTWORK['do-nothing-simulator'],
      href: buildAiToolHref(resolvedPropertyId, '/dashboard/do-nothing-simulator'),
    },
    {
      title: 'Home Savings Check',
      subtitle: 'Find recurring bill savings',
      icon: '💸',
      trailingIcon: '🏦',
      artworkSrc: AI_TOOL_ARTWORK['home-savings-check'],
      href: buildAiToolHref(resolvedPropertyId, '/dashboard/home-savings'),
    },
  ];

  const dailySnapshotHref = `/dashboard/daily-snapshot${resolvedPropertyId ? `?propertyId=${encodeURIComponent(resolvedPropertyId)}` : ''}`;
  const riskRadarHref = `/dashboard/risk-radar${resolvedPropertyId ? `?propertyId=${encodeURIComponent(resolvedPropertyId)}` : ''}`;

  return (
    <MobilePageContainer className="space-y-7 pt-2 pb-24">
      <MobileSection>
        <MobileSectionHeader title="AI Tools" subtitle="Smart decision support for your home" />
      </MobileSection>

      <MobileSection>
        <ExpandableSummaryCard
          title="Insurance + Risk Tools"
          summary="Coverage and premium intelligence"
          metric="3 tools"
          defaultOpen
        >
          <QuickActionGrid>
            {tools.slice(0, 3).map((tool) => (
              <QuickActionTile key={tool.title} {...tool} />
            ))}
          </QuickActionGrid>
        </ExpandableSummaryCard>
      </MobileSection>

      <MobileSection>
        <ExpandableSummaryCard
          title="Savings + Inaction Tools"
          summary="Budget and delay-impact simulations"
          metric="2 tools"
          defaultOpen
        >
          <QuickActionGrid>
            {tools.slice(3).map((tool) => (
              <QuickActionTile key={tool.title} {...tool} />
            ))}
          </QuickActionGrid>
        </ExpandableSummaryCard>
      </MobileSection>

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
