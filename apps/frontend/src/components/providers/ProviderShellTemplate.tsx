'use client';

import { ReactNode } from 'react';
import { MobilePageIntro, MobileToolWorkspace } from '@/components/mobile/dashboard/MobilePrimitives';
import PriorityActionHero from '@/components/system/PriorityActionHero';
import RouteStateCard, { RouteStateKind } from '@/components/system/RouteStateCard';
import TrustStrip from '@/components/system/TrustStrip';

interface ProviderPrimaryAction {
  title: string;
  description: string;
  primaryAction: ReactNode;
  supportingAction?: ReactNode;
  impactLabel?: string;
  confidenceLabel?: string;
  eyebrow?: string;
}

interface ProviderTrustOverride {
  confidenceLabel?: string;
  freshnessLabel?: string;
  sourceLabel?: string;
  rationale?: string | null;
}

interface ProviderRouteState {
  state: RouteStateKind;
  title: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
}

interface ProviderShellTemplateProps {
  title: string;
  subtitle: string;
  eyebrow?: string;
  introAction?: ReactNode;
  className?: string;
  primaryAction: ProviderPrimaryAction;
  trust?: ProviderTrustOverride;
  summary?: ReactNode;
  filters?: ReactNode;
  routeState?: ProviderRouteState | null;
  hideContentWhenState?: boolean;
  children: ReactNode;
}

const DEFAULT_PROVIDER_TRUST: Required<Omit<ProviderTrustOverride, 'rationale'>> & { rationale: string } = {
  confidenceLabel: 'Signal quality improves with verified profile details, recent activity, and completed booking history.',
  freshnessLabel: 'Signals refresh when booking queue, profile, pricing, or availability changes.',
  sourceLabel: 'Provider profile data, booking telemetry, and homeowner request context.',
  rationale: 'Trust signals help homeowners make confident booking decisions and reduce selection anxiety.',
};

export default function ProviderShellTemplate({
  title,
  subtitle,
  eyebrow = 'Provider Workspace',
  introAction,
  className,
  primaryAction,
  trust,
  summary,
  filters,
  routeState,
  hideContentWhenState = false,
  children,
}: ProviderShellTemplateProps) {
  const trustLabels = {
    confidenceLabel: trust?.confidenceLabel || DEFAULT_PROVIDER_TRUST.confidenceLabel,
    freshnessLabel: trust?.freshnessLabel || DEFAULT_PROVIDER_TRUST.freshnessLabel,
    sourceLabel: trust?.sourceLabel || DEFAULT_PROVIDER_TRUST.sourceLabel,
    rationale: trust?.rationale === undefined ? DEFAULT_PROVIDER_TRUST.rationale : trust.rationale,
  };

  return (
    <MobileToolWorkspace
      className={className || 'lg:max-w-7xl lg:px-8 lg:pb-10'}
      intro={<MobilePageIntro eyebrow={eyebrow} title={title} subtitle={subtitle} action={introAction} />}
      summary={
        <div className="space-y-3">
          <PriorityActionHero
            title={primaryAction.title}
            description={primaryAction.description}
            primaryAction={primaryAction.primaryAction}
            supportingAction={primaryAction.supportingAction}
            impactLabel={primaryAction.impactLabel}
            confidenceLabel={primaryAction.confidenceLabel}
            eyebrow={primaryAction.eyebrow || 'Priority Action'}
          />

          <TrustStrip
            confidenceLabel={trustLabels.confidenceLabel}
            freshnessLabel={trustLabels.freshnessLabel}
            sourceLabel={trustLabels.sourceLabel}
            rationale={trustLabels.rationale}
          />

          {summary}
        </div>
      }
      filters={filters}
    >
      {routeState ? (
        <RouteStateCard
          state={routeState.state}
          title={routeState.title}
          description={routeState.description}
          action={routeState.action}
          secondaryAction={routeState.secondaryAction}
        />
      ) : null}

      {hideContentWhenState && routeState ? null : children}
    </MobileToolWorkspace>
  );
}
