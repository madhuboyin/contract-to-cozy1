'use client';

import { Card, CardContent } from '@/components/ui/card';

type GuidanceEmptyStateProps = {
  title?: string;
  description?: string;
};

export function GuidanceEmptyState({
  title = "You're all caught up",
  description = "No action items right now. We'll flag your next home task as soon as something needs attention.",
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
