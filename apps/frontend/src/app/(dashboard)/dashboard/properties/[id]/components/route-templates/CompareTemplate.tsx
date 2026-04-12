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
        {summary}
        {compareContent}
        {footer}
      </div>
    </ToolWorkspaceTemplate>
  );
}
