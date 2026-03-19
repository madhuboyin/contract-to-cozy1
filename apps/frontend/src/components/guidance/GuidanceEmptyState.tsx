'use client';

import { Card, CardContent } from '@/components/ui/card';

type GuidanceEmptyStateProps = {
  title?: string;
  description?: string;
};

export function GuidanceEmptyState({
  title = 'No active guidance right now',
  description = 'We will surface deterministic next steps as soon as actionable signals are available.',
}: GuidanceEmptyStateProps) {
  return (
    <Card>
      <CardContent className="py-6">
        <p className="mb-1 text-sm font-medium text-foreground">{title}</p>
        <p className="mb-0 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
