'use client';

import { ReactNode } from 'react';
import { MobileStickyActionBar } from '@/components/mobile/dashboard/MobilePrimitives';
import PriorityActionHero, { PriorityActionHeroProps } from '@/components/system/PriorityActionHero';
import RouteStateCard, { RouteStateKind } from '@/components/system/RouteStateCard';
import type { TrustContract } from '@/lib/trust/trustContract';
import ToolWorkspaceTemplate from './ToolWorkspaceTemplate';

interface CompareTemplateProps {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle: string;
  rail?: ReactNode;
  trust?: TrustContract;
  priorityAction?: PriorityActionHeroProps;
  decisionContext?: ReactNode;
  summary: ReactNode;
  compareContent: ReactNode;
  footer?: ReactNode;
  routeState?: {
    kind: RouteStateKind;
    title: string;
    description: string;
    action?: ReactNode;
    secondaryAction?: ReactNode;
  };
  stickyAction?: ReactNode;
  stickyHelpText?: string;
}

export default function CompareTemplate({
  backHref,
  backLabel,
  title,
  subtitle,
  rail,
  trust,
  priorityAction,
  decisionContext,
  summary,
  compareContent,
  footer,
  routeState,
  stickyAction,
  stickyHelpText,
}: CompareTemplateProps) {
  const hasStickyAction = Boolean(stickyAction);

  return (
    <ToolWorkspaceTemplate
      backHref={backHref}
      backLabel={backLabel}
      eyebrow="Compare Workspace"
      title={title}
      subtitle={subtitle}
      rail={rail}
      trust={trust}
    >
      <div className={`space-y-4 ${hasStickyAction ? 'pb-[calc(9rem+env(safe-area-inset-bottom))]' : ''}`}>
        {priorityAction ? (
          <PriorityActionHero
            title={priorityAction.title}
            description={priorityAction.description}
            primaryAction={priorityAction.primaryAction}
            supportingAction={priorityAction.supportingAction}
            impactLabel={priorityAction.impactLabel}
            confidenceLabel={priorityAction.confidenceLabel}
            eyebrow={priorityAction.eyebrow || 'Compare Decision'}
          />
        ) : decisionContext ? (
          <article className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.09em] text-brand-700">Decision Context</p>
            {decisionContext}
          </article>
        ) : null}
        {summary}
        {routeState ? (
          <RouteStateCard
            state={routeState.kind}
            title={routeState.title}
            description={routeState.description}
            action={routeState.action}
            secondaryAction={routeState.secondaryAction}
          />
        ) : (
          compareContent
        )}
        {footer}
      </div>
      {stickyAction ? (
        <MobileStickyActionBar
          action={stickyAction}
          helpText={stickyHelpText}
          reserveSize="floatingAction"
        />
      ) : null}
    </ToolWorkspaceTemplate>
  );
}
