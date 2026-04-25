'use client';

import { ReactNode, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MobileStickyActionBar } from '@/components/mobile/dashboard/MobilePrimitives';
import { cn } from '@/lib/utils';
import PriorityActionHero, { PriorityActionHeroProps } from '@/components/system/PriorityActionHero';
import type { TrustContract } from '@/lib/trust/trustContract';
import ToolWorkspaceTemplate from './ToolWorkspaceTemplate';

interface ReportTemplateProps {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle: string;
  trust?: TrustContract;
  rail?: ReactNode;
  priorityAction?: PriorityActionHeroProps;
  decisionMode: ReactNode;
  reportContent: ReactNode;
  reportSummary?: ReactNode;
  defaultReportExpanded?: boolean;
  stickyAction?: ReactNode;
  stickyHelpText?: string;
}

export default function ReportTemplate({
  backHref,
  backLabel,
  title,
  subtitle,
  trust,
  rail,
  priorityAction,
  decisionMode,
  reportContent,
  reportSummary,
  defaultReportExpanded = false,
  stickyAction,
  stickyHelpText,
}: ReportTemplateProps) {
  const [reportExpanded, setReportExpanded] = useState(defaultReportExpanded);

  return (
    <ToolWorkspaceTemplate
      backHref={backHref}
      backLabel={backLabel}
      eyebrow="Report Workspace"
      title={title}
      subtitle={subtitle}
      rail={rail}
      trust={trust}
    >
      <section className={cn('space-y-4', stickyAction ? 'pb-[calc(9rem+env(safe-area-inset-bottom))]' : '')}>
        <article className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
          {priorityAction ? (
            <PriorityActionHero
              title={priorityAction.title}
              description={priorityAction.description}
              primaryAction={priorityAction.primaryAction}
              supportingAction={priorityAction.supportingAction}
              impactLabel={priorityAction.impactLabel}
              confidenceLabel={priorityAction.confidenceLabel}
              eyebrow={priorityAction.eyebrow || 'Decision Mode'}
            />
          ) : (
            <>
              <p className="mb-1 text-xs font-semibold tracking-normal text-brand-700">Decision Mode</p>
              {decisionMode}
            </>
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="mb-0 text-xs font-semibold tracking-normal text-slate-500">
                Full Report
              </p>
              {reportSummary ? (
                <div className="mt-1 text-sm text-slate-600">{reportSummary}</div>
              ) : null}
            </div>
            <Button
              variant="ghost"
              type="button"
              className="min-h-[44px]"
              onClick={() => setReportExpanded((previous) => !previous)}
            >
              {reportExpanded ? 'Show less' : 'Show more'}
              <ChevronDown
                className={cn('ml-2 h-4 w-4 transition-transform', reportExpanded ? 'rotate-180' : '')}
              />
            </Button>
          </div>
          {reportExpanded ? <div className="mt-4">{reportContent}</div> : null}
        </article>
      </section>
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
