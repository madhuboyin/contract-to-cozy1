'use client';

import { ReactNode } from 'react';
import ToolWorkspaceTemplate from './ToolWorkspaceTemplate';

interface CompareTemplateProps {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle: string;
  rail?: ReactNode;
  trust?: {
    confidenceLabel: string;
    freshnessLabel: string;
    sourceLabel: string;
    rationale?: string | null;
  };
  decisionContext?: ReactNode;
  summary: ReactNode;
  compareContent: ReactNode;
  footer?: ReactNode;
}

export default function CompareTemplate({
  backHref,
  backLabel,
  title,
  subtitle,
  rail,
  trust,
  decisionContext,
  summary,
  compareContent,
  footer,
}: CompareTemplateProps) {
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
      <div className="space-y-4">
        {decisionContext ? (
          <article className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.09em] text-brand-700">Decision Context</p>
            {decisionContext}
          </article>
        ) : null}
        {summary}
        {compareContent}
        {footer}
      </div>
    </ToolWorkspaceTemplate>
  );
}
