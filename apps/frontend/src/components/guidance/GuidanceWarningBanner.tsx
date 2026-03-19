'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type GuidanceWarningBannerProps = {
  title?: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
  className?: string;
};

export function GuidanceWarningBanner({
  title = 'Action blocked',
  message,
  actionLabel,
  actionHref,
  className,
}: GuidanceWarningBannerProps) {
  return (
    <Alert className={className}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p className="mb-0 text-sm">{message}</p>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className="text-sm font-medium text-brand-primary hover:underline">
            {actionLabel}
          </Link>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
