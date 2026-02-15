'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { OnboardingStatusDTO } from '@/lib/api/onboardingApi';

type Props = {
  propertyId: string;
  status: OnboardingStatusDTO;
};

export default function SetupChecklistPanel({ propertyId, status }: Props) {
  if (status.status === 'COMPLETED') {
    return null;
  }

  const completed = status.steps.filter((step) => step.complete).length;
  const remaining = status.steps.filter((step) => !step.complete);

  return (
    <Card className="rounded-2xl border-blue-200 bg-blue-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Complete setup ({completed}/5)</CardTitle>
        <CardDescription>
          Finish setup to unlock full automation and property insights.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/properties/${propertyId}/onboarding`}>
            <Button size="sm">
              Resume setup
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>

        <div className="space-y-2">
          {remaining.map((step) => (
            <div
              key={step.step}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-blue-100 bg-white p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">Step {step.step}: {step.title}</p>
                <p className="text-xs text-gray-600">{step.description}</p>
              </div>
              <Link href={step.href} className="shrink-0">
                <Button variant="outline" size="sm">
                  {step.ctaLabel}
                </Button>
              </Link>
            </div>
          ))}
        </div>

        {remaining.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            All setup steps are complete.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
