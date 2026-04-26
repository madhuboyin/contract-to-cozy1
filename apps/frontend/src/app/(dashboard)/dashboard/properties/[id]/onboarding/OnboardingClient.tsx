'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader, PageHeaderDescription, PageHeaderHeading } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  MobileCard,
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import type { OnboardingStep, OnboardingStatusDTO } from '@/lib/api/onboardingApi';
import {
  completeOnboardingStep,
  finishOnboarding,
  getOnboardingStatus,
  setOnboardingStep,
  skipOnboarding,
} from '@/lib/api/onboardingApi';
import { isOnboardingComplete } from '@/lib/property/onboardingStatus';
import Step1PropertyDetails from './steps/Step1PropertyDetails';
import Step2Rooms from './steps/Step2Rooms';
import Step3Inventory from './steps/Step3Inventory';
import Step4Protection from './steps/Step4Protection';
import Step5Insights from './steps/Step5Insights';
import DesktopOnboardingTimeline from './components/DesktopOnboardingTimeline';

type StepComponentProps = {
  step: OnboardingStatusDTO['steps'][number];
  onMarkComplete: () => void;
  isMarking: boolean;
};

const stepComponentMap: Record<OnboardingStep, (props: StepComponentProps) => JSX.Element> = {
  1: Step1PropertyDetails,
  2: Step2Rooms,
  3: Step3Inventory,
  4: Step4Protection,
  5: Step5Insights,
};

export default function OnboardingClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const propertyId = params.id;
  const [activeStep, setActiveStep] = useState<OnboardingStep>(1);

  const statusQuery = useQuery({
    queryKey: ['property-onboarding', propertyId],
    queryFn: () => getOnboardingStatus(propertyId),
    enabled: Boolean(propertyId),
  });

  const syncQueryData = (data: OnboardingStatusDTO) => {
    queryClient.setQueryData(['property-onboarding', propertyId], data);
    queryClient.invalidateQueries({ queryKey: ['property-onboarding', propertyId] });
    queryClient.invalidateQueries({ queryKey: ['property-bootstrap', propertyId] });
  };

  const setStepMutation = useMutation({
    mutationFn: (step: OnboardingStep) => setOnboardingStep(propertyId, step),
    onSuccess: (data) => {
      syncQueryData(data);
      setActiveStep(data.currentStep);
    },
  });

  const completeStepMutation = useMutation({
    mutationFn: (step: OnboardingStep) => completeOnboardingStep(propertyId, step),
    onSuccess: (data) => {
      syncQueryData(data);
      setActiveStep(data.recommendedNextStep);
    },
  });

  const skipMutation = useMutation({
    mutationFn: () => skipOnboarding(propertyId),
    onSuccess: (data) => {
      syncQueryData(data);
      router.replace(`/dashboard/properties/${propertyId}`);
    },
  });

  const finishMutation = useMutation({
    mutationFn: () => finishOnboarding(propertyId),
    onSuccess: (data) => {
      syncQueryData(data);
      router.replace(`/dashboard/properties/${propertyId}`);
    },
  });

  useEffect(() => {
    if (!statusQuery.data) return;
    setActiveStep(statusQuery.data.currentStep);
  }, [statusQuery.data]);

  const status = statusQuery.data;
  const steps = status?.steps ?? [];
  const completedCount = steps.filter((item) => item.complete).length;
  const activeStepData = steps.find((item) => item.step === activeStep);
  const ActiveStepComponent = activeStepData ? stepComponentMap[activeStepData.step] : null;

  const canGoBack = activeStep > 1;
  const canGoNext = activeStep < 5;

  const isStepMarking = completeStepMutation.isPending;

  const setAndPersistStep = (step: OnboardingStep) => {
    setActiveStep(step);
    setStepMutation.mutate(step);
  };

  const handleBack = () => {
    if (!canGoBack) return;
    const next = (activeStep - 1) as OnboardingStep;
    setAndPersistStep(next);
  };

  const handleNext = () => {
    if (!canGoNext) return;
    const next = (activeStep + 1) as OnboardingStep;
    setAndPersistStep(next);
  };

  const remaining = steps.filter((step) => !step.complete).length;

  if (statusQuery.isLoading) {
    return (
      <DashboardShell>
        <MobilePageContainer className="py-6 lg:max-w-7xl lg:px-8 lg:pb-10">
          <div className="h-48 rounded-2xl bg-gray-100 animate-pulse" />
        </MobilePageContainer>
      </DashboardShell>
    );
  }

  if (statusQuery.isError || !status) {
    return (
      <DashboardShell>
        <MobilePageContainer className="py-6 lg:max-w-7xl lg:px-8 lg:pb-10">
          <MobileCard className="space-y-3">
            <p className="text-sm text-red-600">Failed to load onboarding status.</p>
            <Button onClick={() => statusQuery.refetch()}>Retry</Button>
          </MobileCard>
        </MobilePageContainer>
      </DashboardShell>
    );
  }

  if (isOnboardingComplete(status)) {
    return (
      <DashboardShell>
        <MobilePageContainer className="py-6 lg:max-w-7xl lg:px-8 lg:pb-10">
          <MobileCard className="space-y-4">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-semibold">Setup completed</p>
            </div>
            <p className="text-sm text-gray-600">
              Your property setup is complete. You can revisit this checklist anytime.
            </p>
            <Link href={`/dashboard/properties/${propertyId}`}>
              <Button>Go to property dashboard</Button>
            </Link>
          </MobileCard>
        </MobilePageContainer>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="gap-4">
      <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
        <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
          <Link href={`/dashboard/properties/${propertyId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to property
          </Link>
        </Button>

        <div className="md:hidden">
          <MobilePageIntro
            eyebrow="Onboarding"
            title="Property Setup Checklist"
            subtitle="Complete five steps to unlock full insights and automation."
          />
        </div>

        <PageHeader className="hidden md:block gap-2">
          <PageHeaderHeading>Property setup checklist</PageHeaderHeading>
          <PageHeaderDescription>
            Complete these five steps to unlock full insights and automation for this property.
          </PageHeaderDescription>
        </PageHeader>

        <MobileFilterSurface className="rounded-2xl md:hidden">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>{completedCount}/5 completed</span>
            <StatusChip tone={remaining === 0 ? 'good' : 'elevated'}>{remaining} remaining</StatusChip>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${status.setupScore}%` }} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-fit px-2 text-xs"
            onClick={() => statusQuery.refetch()}
          >
            Refresh
          </Button>
        </MobileFilterSurface>

        <Card className="hidden md:block rounded-2xl">
          <CardContent className="p-4 sm:p-6 space-y-3">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>{completedCount}/5 completed</span>
              <div className="flex items-center gap-2">
                <span>{remaining} remaining</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => statusQuery.refetch()}
                >
                  Refresh
                </Button>
              </div>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${status.setupScore}%` }} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <DesktopOnboardingTimeline
            steps={steps}
            activeStep={activeStep}
            onStepSelect={setAndPersistStep}
            isLoading={setStepMutation.isPending}
          />

          <div className="space-y-4">
            <div className="md:hidden">
              <MobileFilterSurface>
                <div className="grid grid-cols-1 gap-1.5">
                  {steps.map((step) => (
                    <button
                      key={step.step}
                      type="button"
                      onClick={() => setAndPersistStep(step.step)}
                      className={`w-full text-left rounded-xl px-3 py-2 transition ${
                        activeStep === step.step
                          ? 'bg-blue-50 border border-blue-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">Step {step.step}: {step.title}</p>
                        {step.complete ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                      </div>
                    </button>
                  ))}
                </div>
              </MobileFilterSurface>
            </div>

            {ActiveStepComponent && activeStepData ? (
              <ActiveStepComponent
                step={activeStepData}
                onMarkComplete={() => completeStepMutation.mutate(activeStepData.step)}
                isMarking={isStepMarking}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleBack} disabled={!canGoBack || setStepMutation.isPending}>
                  Back
                </Button>
                <Button variant="outline" onClick={handleNext} disabled={!canGoNext || setStepMutation.isPending}>
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => skipMutation.mutate()} disabled={skipMutation.isPending}>
                  {skipMutation.isPending ? 'Skipping…' : 'Skip for now'}
                </Button>
                <Button onClick={() => finishMutation.mutate()} disabled={completedCount < 5 || finishMutation.isPending}>
                  {finishMutation.isPending ? 'Finishing…' : 'Finish setup'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </MobilePageContainer>
    </DashboardShell>
  );
}
