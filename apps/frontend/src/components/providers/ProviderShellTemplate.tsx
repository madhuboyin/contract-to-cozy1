'use client';

import { ReactNode } from 'react';
import { MobilePageIntro, MobileToolWorkspace } from '@/components/mobile/dashboard/MobilePrimitives';
import PriorityActionHero from '@/components/system/PriorityActionHero';
import RouteStateCard, { RouteStateKind } from '@/components/system/RouteStateCard';
import TrustStrip from '@/components/system/TrustStrip';
import { mergeTrustContract, type TrustContract } from '@/lib/trust/trustContract';

interface ProviderPrimaryAction {
  title: string;
  description: string;
  primaryAction: ReactNode;
  supportingAction?: ReactNode;
  impactLabel?: string;
  confidenceLabel?: string;
  eyebrow?: string;
}

type ProviderTrustOverride = Partial<TrustContract>;

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

const DEFAULT_PROVIDER_TRUST: TrustContract = {
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
  const trustLabels = mergeTrustContract(DEFAULT_PROVIDER_TRUST, trust);

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

          {summary}

          <TrustStrip
            variant="footnote"
            confidenceLabel={trustLabels.confidenceLabel}
            freshnessLabel={trustLabels.freshnessLabel}
            sourceLabel={trustLabels.sourceLabel}
          />
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
