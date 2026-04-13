'use client';

import { ReactNode, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ToolWorkspaceTemplate from './ToolWorkspaceTemplate';

interface ReportTemplateProps {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle: string;
  trust?: {
    confidenceLabel: string;
    freshnessLabel: string;
    sourceLabel: string;
    rationale?: string | null;
  };
  rail?: ReactNode;
  decisionMode: ReactNode;
  reportContent: ReactNode;
  reportSummary?: ReactNode;
  defaultReportExpanded?: boolean;
}

export default function ReportTemplate({
  backHref,
  backLabel,
  title,
  subtitle,
  trust,
  rail,
  decisionMode,
  reportContent,
  reportSummary,
  defaultReportExpanded = false,
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
      <section className="space-y-4">
        <article className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.09em] text-brand-700">Decision Mode</p>
          {decisionMode}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="mb-0 text-xs font-semibold uppercase tracking-[0.09em] text-slate-500">
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
              {reportExpanded ? 'Hide Report Details' : 'View Report Details'}
              <ChevronDown
                className={cn('ml-2 h-4 w-4 transition-transform', reportExpanded ? 'rotate-180' : '')}
              />
            </Button>
          </div>
          {reportExpanded ? <div className="mt-4">{reportContent}</div> : null}
        </article>
      </section>
    </ToolWorkspaceTemplate>
  );
}

