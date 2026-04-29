'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type GuidanceWarningBannerProps = {
  title?: string;
  message: string;
  details?: string[];
  actionLabel?: string;
  actionHref?: string;
  className?: string;
};

export function GuidanceWarningBanner({
  title = 'Action blocked',
  message,
  details,
  actionLabel,
  actionHref,
  className,
}: GuidanceWarningBannerProps) {
  const safeMessage = message?.trim() ? message.trim() : 'Complete the recommended prior step before proceeding.';
  const visibleDetails = (details ?? []).map((item) => item.trim()).filter(Boolean);

  return (
    <Alert className={className}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p className="mb-0 text-sm">{safeMessage}</p>
        {visibleDetails.length > 0 ? (
          <ul className="mb-0 list-disc space-y-1 pl-5 text-sm">
            {visibleDetails.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {actionHref && actionLabel ? (
          <Link href={actionHref} className="text-sm font-medium text-brand-primary hover:underline">
            {actionLabel}
          </Link>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
