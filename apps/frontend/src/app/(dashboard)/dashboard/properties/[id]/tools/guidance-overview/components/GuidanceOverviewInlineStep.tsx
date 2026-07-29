'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { completeGuidanceStep, type GuidanceStepDTO } from '@/lib/api/guidanceApi';

type StepOption = {
  label: string;
  description?: string;
  producedData?: Record<string, unknown>;
};

type StepChecklistItem = {
  key: string;
  label: string;
  description?: string;
};

type StepNoteField = {
  label: string;
  placeholder: string;
  hint?: string;
};

type GuidanceOverviewInlineStepProps = {
  propertyId: string;
  step: GuidanceStepDTO;
  onComplete?: (nextStepKey: string | null) => void;
  nextStepKey?: string | null;
  /** B8: extra context shown below the subtitle for steps that carry signal detail */
  signalContext?: string | null;
};

function getInlineStepConfig(step: GuidanceStepDTO): {
  title: string;
  subtitle: string;
  checklist?: StepChecklistItem[];
  noteField?: StepNoteField;
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
        checklist: [
          {
            key: 'service_finished',
            label: 'The cleaning visit is finished',
            description: 'The provider completed the service window for this job.',
          },
          {
            key: 'quality_checked',
            label: 'You checked the result',
            description: 'You reviewed the work and do not need additional cleanup right now.',
          },
        ],
        noteField: {
          label: 'Service note',
          placeholder: 'Add any quick notes about the service quality, missed areas, or follow-up needed.',
          hint: 'Optional, but helpful if you may revisit this service later.',
        },
        options: [
          {
            label: 'Confirm service completed',
            description: 'Save that the cleaning visit is done and the result has been checked.',
          },
        ],
      };
    case 'prepare_property_access':
      return {
        title: 'Confirm the property is ready for inspection',
        subtitle: 'Capture what is ready so the inspector can actually complete the visit without delays.',
        checklist: [
          {
            key: 'access_window_confirmed',
            label: 'Inspection window is confirmed',
            description: 'You know the expected visit timing or appointment window.',
          },
          {
            key: 'entry_instructions_ready',
            label: 'Entry instructions are ready',
            description: 'Keys, codes, lockbox details, or who will be on site are figured out.',
          },
          {
            key: 'focus_areas_noted',
            label: 'Priority concerns are noted',
            description: 'You know which systems, rooms, or repairs you want the inspector to focus on.',
          },
          {
            key: 'obstacles_cleared',
            label: 'Access obstacles are cleared',
            description: 'Pets, storage, blocked panels, or other obstacles should not prevent the inspection.',
          },
        ],
        noteField: {
          label: 'Access or scope note',
          placeholder: 'Add any special entry instructions, areas of concern, or timing constraints for the visit.',
          hint: 'Optional, but useful if multiple people are coordinating the inspection.',
        },
        options: [
          {
            label: 'Access plan is ready',
            description: 'Save the inspection access plan and move to the next guided step.',
          },
        ],
      };
    case 'act_on_inspection_findings':
      return {
        title: 'Turn the inspection findings into a real follow-up plan',
        subtitle: 'Use this once you have decided what needs action now versus what can wait.',
        checklist: [
          {
            key: 'urgent_items_identified',
            label: 'Urgent or safety items are identified',
            description: 'You know which findings need immediate attention first.',
          },
          {
            key: 'next_actions_defined',
            label: 'Next actions are defined',
            description: 'You know whether each major item needs a quote, repair, replacement, or monitoring plan.',
          },
          {
            key: 'owner_assigned',
            label: 'An owner is assigned',
            description: 'You know who will schedule, pay for, or monitor the follow-up work.',
          },
        ],
        noteField: {
          label: 'Follow-up plan note',
          placeholder: 'Add the key repair, negotiation, maintenance, or reinspection actions you decided on.',
          hint: 'This can be a short summary of what happens next.',
        },
        options: [
          {
            label: 'Follow-up plan created',
            description: 'Save that the inspection findings now have a concrete next-step plan.',
          },
          {
            label: 'Monitoring plan captured',
            description: 'Use this when the findings do not need immediate work but you documented what to watch.',
            producedData: {
              inspectionFollowupMode: 'monitor',
            },
          },
        ],
      };
    case 'review_compliance_requirement':
      return {
        title: 'Clarify the compliance requirement before moving forward',
        subtitle: 'Use this to capture whether you understand the deadline, documentation, and support needed.',
        checklist: [
          {
            key: 'deadline_understood',
            label: 'Deadline or renewal timing is understood',
            description: 'You know when this needs to be handled or renewed.',
          },
          {
            key: 'consequence_understood',
            label: 'Consequence of inaction is understood',
            description: 'You know what happens if this is missed, delayed, or ignored.',
          },
          {
            key: 'documentation_understood',
            label: 'Required proof or documents are clear',
            description: 'You know what records, forms, or uploads will likely be needed.',
          },
          {
            key: 'help_needed_assessed',
            label: 'You know whether outside help is needed',
            description: 'You decided whether you can handle this yourself or need a provider/professional.',
          },
        ],
        noteField: {
          label: 'Compliance note',
          placeholder: 'Add any deadline, document, or provider detail you want to keep with this requirement.',
          hint: 'Optional, but useful when the requirement has a specific due date or proof format.',
        },
        options: [
          {
            label: 'Requirement is clear',
            description: 'Save that the compliance requirement has been reviewed and you know what comes next.',
          },
        ],
      };
    case 'track_resolution':
      return {
        title: 'Record the current resolution status',
        subtitle: 'Choose the status that best reflects what happened after the guided repair or follow-up.',
        checklist: [
          {
            key: 'work_verified',
            label: 'The result was verified',
            description: 'You confirmed the repair, service, or resolution outcome rather than only scheduling it.',
          },
        ],
        noteField: {
          label: 'Resolution note',
          placeholder: 'Add what was completed, what is still pending, or what should be monitored next.',
          hint: 'Optional, especially useful if the repair is only partially complete.',
        },
        options: [
          {
            label: 'Repair completed and verified',
            description: 'The work is done and you confirmed the issue is resolved.',
            producedData: {
              resolutionStatus: 'completed_and_verified',
            },
          },
          {
            label: 'Temporary fix in place',
            description: 'Use this when immediate risk is reduced but permanent work is still pending.',
            producedData: {
              resolutionStatus: 'temporary_fix',
            },
          },
          {
            label: 'Monitoring instead of repairing',
            description: 'Use this when you chose to track the issue rather than complete work now.',
            producedData: {
              resolutionStatus: 'monitoring',
            },
          },
        ],
      };
    // B4: DEFAULT_TEMPLATE review_signal step previously returned null → blank CTA area
    case 'review_signal':
      return {
        title: 'Decide how you want to handle this guidance signal',
        subtitle: 'Use this quick decision to capture whether the signal needs immediate action, follow-up soon, or monitoring.',
        checklist: [
          {
            key: 'signal_context_read',
            label: 'You reviewed the context',
            description: 'You looked at the signal details and understand what triggered it.',
          },
        ],
        noteField: {
          label: 'Signal note',
          placeholder: 'Add any quick takeaway, risk, or reason you are handling this now versus later.',
          hint: 'Optional, especially useful if the signal feels ambiguous.',
        },
        options: [
          {
            label: 'Needs attention now',
            description: 'Use this when you want to move into the next guided step right away.',
            producedData: {
              signalDisposition: 'act_now',
            },
          },
          {
            label: 'Plan this soon',
            description: 'Use this when the signal matters but is not urgent today.',
            producedData: {
              signalDisposition: 'plan_soon',
            },
          },
          {
            label: 'Monitor for now',
            description: 'Use this when you reviewed the signal and decided to keep watching it.',
            producedData: {
              signalDisposition: 'monitor',
            },
          },
        ],
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
  signalContext,
}: GuidanceOverviewInlineStepProps) {
  const [savingLabel, setSavingLabel] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedChecklist, setSelectedChecklist] = React.useState<Record<string, boolean>>({});
  const [note, setNote] = React.useState('');

  const config = getInlineStepConfig(step);

  React.useEffect(() => {
    if (!config) {
      setSelectedChecklist({});
      setNote('');
      return;
    }
    const existingSelections =
      step.producedData && typeof step.producedData === 'object'
        ? step.producedData
        : null;
    const checklistSelections = Object.fromEntries(
      (config.checklist ?? []).map((item) => [
        item.key,
        Boolean(existingSelections?.[item.key]),
      ])
    );
    const existingNote =
      typeof existingSelections?.inlineNote === 'string' ? existingSelections.inlineNote : '';
    setSelectedChecklist(checklistSelections);
    setNote(existingNote);
  }, [step.id, step.stepKey, step.producedData]);

  if (!config) return null;

  async function handleComplete(option: StepOption) {
    try {
      setSavingLabel(option.label);
      setError(null);
      const checkedItems = Object.entries(selectedChecklist)
        .filter(([, isChecked]) => isChecked)
        .map(([key]) => key);
      await completeGuidanceStep(propertyId, step.id, {
        proofType: 'guided_overview_checkpoint',
        proofId: `${step.stepKey}:${option.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        actionLabel: option.label,
        completedFrom: 'guidance_overview_inline_step',
        completedAt: new Date().toISOString(),
        inlineChecklistKeys: checkedItems,
        inlineChecklistCount: checkedItems.length,
        inlineNote: note.trim() || null,
        ...selectedChecklist,
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
        {/* B8: surface signal/step context for compliance and signal-review steps */}
        {signalContext ? (
          <p className="mt-2 text-sm text-slate-700 border-t border-slate-200 pt-2">{signalContext}</p>
        ) : null}
      </div>

      {config.checklist?.length ? (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Guided checklist</p>
          <div className="space-y-3">
            {config.checklist.map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-slate-300"
              >
                <Checkbox
                  checked={Boolean(selectedChecklist[item.key])}
                  onCheckedChange={(checked) =>
                    setSelectedChecklist((current) => ({
                      ...current,
                      [item.key]: checked === true,
                    }))
                  }
                  className="mt-0.5"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium text-slate-900">{item.label}</span>
                  {item.description ? (
                    <span className="block text-sm text-slate-600">{item.description}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {config.noteField ? (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
          <Label htmlFor={`${step.id}-inline-note`} className="text-sm font-semibold text-slate-900">
            {config.noteField.label}
          </Label>
          <Textarea
            id={`${step.id}-inline-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={config.noteField.placeholder}
            className="min-h-[110px]"
          />
          {config.noteField.hint ? (
            <p className="text-sm text-slate-500">{config.noteField.hint}</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        {config.options.map((option) => {
          const isSaving = savingLabel === option.label;
          return (
            <div key={option.label} className="rounded-2xl border border-slate-200 bg-white p-3">
              <Button
                className="min-h-[44px] w-full"
                disabled={Boolean(savingLabel)}
                onClick={() => void handleComplete(option)}
              >
                {isSaving ? 'Saving…' : option.label}
              </Button>
              {option.description ? (
                <p className="mt-2 text-sm text-slate-600">{option.description}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="text-sm text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}
