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

export default function Step3Inventory({ step, onMarkComplete, isMarking }: Props) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>{step.title}</CardTitle>
        <CardDescription>{step.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Add at least one item to inventory. You can also use AI scan to speed up appliance capture.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={step.href}>
            <Button>{step.ctaLabel}</Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            onClick={onMarkComplete}
            disabled={!step.complete || isMarking}
          >
            {isMarking ? 'Saving…' : 'Mark complete'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
