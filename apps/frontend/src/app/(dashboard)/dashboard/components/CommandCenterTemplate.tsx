'use client';

import { ReactNode, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import PriorityActionHero, { PriorityActionHeroProps } from '@/components/system/PriorityActionHero';

interface CommandCenterTemplateProps {
  primaryAction: ReactNode;
  supportingAction?: ReactNode;
  priorityAction?: PriorityActionHeroProps;
  confidenceLabel: string;
  freshnessLabel: string;
  sourceLabel: string;
  rationale?: string | null;
  secondaryModules?: ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}

export default function CommandCenterTemplate({
  primaryAction,
  supportingAction,
  priorityAction,
  confidenceLabel,
  freshnessLabel,
  sourceLabel,
  rationale,
  secondaryModules,
  defaultExpanded = false,
  className,
}: CommandCenterTemplateProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasSecondaryModules = Boolean(secondaryModules);

  return (
    <section className={cn('space-y-3', className)}>
      <div>
        {priorityAction ? (
          <PriorityActionHero
            title={priorityAction.title}
            description={priorityAction.description}
            primaryAction={priorityAction.primaryAction}
            supportingAction={priorityAction.supportingAction}
            impactLabel={priorityAction.impactLabel}
            confidenceLabel={priorityAction.confidenceLabel}
            eyebrow={priorityAction.eyebrow || 'Next Best Action'}
          />
        ) : (
          primaryAction
        )}
      </div>

      {supportingAction ? <div>{supportingAction}</div> : null}

      {hasSecondaryModules ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex w-full items-center justify-center gap-1 py-2 text-sm text-gray-400 transition-colors hover:text-gray-600"
          >
            <span>{expanded ? 'Show less' : 'Show more'}</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', expanded ? 'rotate-180' : '')} />
          </button>
          {expanded ? <div className="mt-4 space-y-6">{secondaryModules}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
