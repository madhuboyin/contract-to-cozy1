'use client';

import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OnboardingStep, OnboardingStatusDTO } from '@/lib/api/onboardingApi';

type TimelineStep = OnboardingStatusDTO['steps'][number];

type DesktopOnboardingTimelineProps = {
  steps: TimelineStep[];
  activeStep: OnboardingStep;
  onStepSelect: (step: OnboardingStep) => void;
  isLoading?: boolean;
};

const STEP_EVENT_DETAILS: Record<OnboardingStep, string[]> = {
  1: ['Property details', 'Address + location', 'Home profile'],
  2: ['Room list', 'Core rooms covered', 'Room structure'],
  3: ['Inventory baseline', 'First key items', 'Home systems'],
  4: ['Protection setup', 'Alerts or tasks', 'Risk readiness'],
  5: ['Insights review', 'Snapshot + risk', 'Next-step guidance'],
};

function getStepState(step: TimelineStep, activeStep: OnboardingStep): 'complete' | 'active' | 'upcoming' {
  if (step.complete) return 'complete';
  if (step.step === activeStep) return 'active';
  return 'upcoming';
}

export default function DesktopOnboardingTimeline({
  steps,
  activeStep,
  onStepSelect,
  isLoading = false,
}: DesktopOnboardingTimelineProps) {
  return (
    <aside className="hidden md:block md:sticky md:top-6 md:self-start">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold tracking-normal text-slate-500">
          Setup timeline
        </p>
        <ol className="space-y-0">
          {steps.map((step, index) => {
            const state = getStepState(step, activeStep);
            const isLast = index === steps.length - 1;
            const isActive = state === 'active';
            const isComplete = state === 'complete';
            const stepDetails = STEP_EVENT_DETAILS[step.step] || [];

            return (
              <li key={step.step} className="relative pb-4 last:pb-0">
                {!isLast ? (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute left-[13px] top-[28px] bottom-0 w-px',
                      isComplete ? 'bg-emerald-200' : 'bg-slate-200'
                    )}
                  />
                ) : null}

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => onStepSelect(step.step)}
                  className={cn(
                    'group relative w-full rounded-xl border px-3 py-2.5 pl-10 text-left transition',
                    isActive
                      ? 'border-violet-200 bg-violet-50/40'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50',
                    isLoading && 'cursor-not-allowed opacity-70'
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'absolute left-2.5 top-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full border',
                      isComplete
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : isActive
                          ? 'border-violet-500 bg-white text-violet-600'
                          : 'border-slate-300 bg-white text-slate-400'
                    )}
                  >
                    {isComplete ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : isActive ? (
                      <Circle className="h-2.5 w-2.5 fill-current stroke-none" />
                    ) : null}
                  </span>

                  <div className="flex items-center justify-between gap-2">
                    <p className={cn('text-xs font-semibold tracking-normal', isActive ? 'text-violet-700' : 'text-slate-500')}>
                      Step {step.step}
                    </p>
                    {isComplete ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold tracking-normal text-emerald-700">
                        Done
                      </span>
                    ) : null}
                  </div>

                  <p className={cn('mt-0.5 text-sm', isActive ? 'font-semibold text-slate-900' : 'font-medium text-slate-700')}>
                    {step.title}
                  </p>

                  {isActive ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-slate-600">{step.description}</p>
                      <div className="space-y-0.5 pt-1">
                        {stepDetails.map((detail) => (
                          <p key={detail} className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-300" />
                            {detail}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
