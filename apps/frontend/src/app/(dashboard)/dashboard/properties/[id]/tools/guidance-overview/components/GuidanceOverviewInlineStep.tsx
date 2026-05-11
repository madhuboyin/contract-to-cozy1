'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { completeGuidanceStep, type GuidanceStepDTO } from '@/lib/api/guidanceApi';

type StepOption = {
  label: string;
  producedData?: Record<string, unknown>;
};

type GuidanceOverviewInlineStepProps = {
  propertyId: string;
  step: GuidanceStepDTO;
  onComplete?: (nextStepKey: string | null) => void;
  nextStepKey?: string | null;
};

function getInlineStepConfig(step: GuidanceStepDTO): {
  title: string;
  subtitle: string;
  options: StepOption[];
} | null {
  switch (step.stepKey) {
    case 'select_cleaning_type':
      return {
        title: 'Choose the cleaning service type',
        subtitle: 'Record the cleaning type so the next quote and booking steps stay scoped correctly.',
        options: [
          {
            label: 'Standard recurring clean',
            producedData: {
              selectedCleaningType: 'standard_clean',
              selectedCleaningTypeLabel: 'Standard recurring clean',
            },
          },
          {
            label: 'One-time deep clean',
            producedData: {
              selectedCleaningType: 'deep_clean',
              selectedCleaningTypeLabel: 'One-time deep clean',
            },
          },
          {
            label: 'Move-in / move-out clean',
            producedData: {
              selectedCleaningType: 'move_clean',
              selectedCleaningTypeLabel: 'Move-in / move-out clean',
            },
          },
          {
            label: 'Post-construction clean-up',
            producedData: {
              selectedCleaningType: 'post_construction',
              selectedCleaningTypeLabel: 'Post-construction clean-up',
            },
          },
        ],
      };
    case 'confirm_cleaning_complete':
      return {
        title: 'Confirm the cleaning service is complete',
        subtitle: 'Mark the service complete once the provider has finished the job.',
        options: [{ label: 'Confirm service completed' }],
      };
    case 'prepare_property_access':
      return {
        title: 'Confirm the property is ready for inspection',
        subtitle: 'Use this once access details, entry instructions, and the inspection window are set.',
        options: [{ label: 'Property access prepared' }],
      };
    case 'act_on_inspection_findings':
      return {
        title: 'Record that inspection findings are being handled',
        subtitle: 'Use this after you have reviewed the report and created the needed follow-up actions.',
        options: [{ label: 'Findings reviewed and follow-up planned' }],
      };
    case 'review_compliance_requirement':
      return {
        title: 'Acknowledge the compliance requirement',
        subtitle: 'Record that you reviewed the requirement, timing, and consequence before moving to the next step.',
        options: [{ label: 'Requirement reviewed' }],
      };
    case 'track_resolution':
      return {
        title: 'Confirm the repair is complete',
        subtitle: 'Use this once the inspection-related repair has been finished and verified.',
        options: [{ label: 'Repair completed' }],
      };
    default:
      return null;
  }
}

export function GuidanceOverviewInlineStep({
  propertyId,
  step,
  onComplete,
  nextStepKey,
}: GuidanceOverviewInlineStepProps) {
  const [savingLabel, setSavingLabel] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const config = getInlineStepConfig(step);
  if (!config) return null;

  async function handleComplete(option: StepOption) {
    try {
      setSavingLabel(option.label);
      setError(null);
      await completeGuidanceStep(propertyId, step.id, {
        proofType: 'guided_overview_checkpoint',
        proofId: `${step.stepKey}:${option.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        actionLabel: option.label,
        completedFrom: 'guidance_overview_inline_step',
        completedAt: new Date().toISOString(),
        ...option.producedData,
      });
      onComplete?.(nextStepKey ?? null);
    } catch (err) {
      console.error('[GuidanceOverviewInlineStep] completion failed', err);
      setError('We could not save that step yet. Please try again.');
    } finally {
      setSavingLabel(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <p className="text-sm font-semibold text-slate-900">{config.title}</p>
        <p className="mt-1 text-sm text-slate-600">{config.subtitle}</p>
      </div>

      <div className="space-y-2">
        {config.options.map((option) => {
          const isSaving = savingLabel === option.label;
          return (
            <Button
              key={option.label}
              className="min-h-[44px] w-full"
              disabled={Boolean(savingLabel)}
              onClick={() => void handleComplete(option)}
            >
              {isSaving ? 'Saving…' : option.label}
            </Button>
          );
        })}
      </div>

      {error ? (
        <p className="text-sm text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}
