'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { OnboardingStatusDTO } from '@/lib/api/onboardingApi';

type Props = {
  step: OnboardingStatusDTO['steps'][number];
  onMarkComplete: () => void;
  isMarking: boolean;
};

export default function Step5Insights({ step, onMarkComplete, isMarking }: Props) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>{step.title}</CardTitle>
        <CardDescription>{step.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Open insights and generate your first report snapshot. If reports are not generated yet, mark this step after reviewing insights.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={step.href}>
            <Button>{step.ctaLabel}</Button>
          </Link>
          <Button type="button" variant="outline" onClick={onMarkComplete} disabled={isMarking}>
            {isMarking ? 'Saving…' : 'Generate insights'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
