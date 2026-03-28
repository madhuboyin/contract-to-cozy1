'use client';

import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GuidanceExecutionReadiness } from '@/lib/api/guidanceApi';

type GuidancePrimaryCtaProps = {
  label: string;
  stepNumber?: number | null;
  href?: string | null;
  executionReadiness: GuidanceExecutionReadiness;
  blockedReason?: string | null;
  missingStepLabel?: string | null;
  className?: string;
};

export function GuidancePrimaryCta({
  label,
  stepNumber,
  href,
  executionReadiness,
  blockedReason,
  missingStepLabel,
  className,
}: GuidancePrimaryCtaProps) {
  const safeLabel = label?.trim() ? label.trim() : 'Review Next Step';
  const safeStepNumber = typeof stepNumber === 'number' && Number.isFinite(stepNumber) ? stepNumber : null;
  const ctaLabel = safeStepNumber ? `Step ${safeStepNumber}: ${safeLabel}` : safeLabel;
  const isBlocked = executionReadiness === 'NOT_READY';

  if (!href || isBlocked) {
    const hintText = blockedReason
      ? blockedReason
      : missingStepLabel
        ? `First complete: ${missingStepLabel}`
        : executionReadiness === 'NEEDS_CONTEXT'
          ? 'Answer a few questions to unlock this step.'
          : null;

    return (
      <div className="space-y-1.5">
        <Button type="button" variant="secondary" className={className} disabled>
          <Lock className="mr-2 h-4 w-4" />
          {ctaLabel}
        </Button>
        {hintText ? (
          <p className="mb-0 text-xs text-muted-foreground">{hintText}</p>
        ) : null}
      </div>
    );
  }

  return (
    <Button asChild className={className}>
      <Link href={href}>
        {ctaLabel}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Link>
    </Button>
  );
}
