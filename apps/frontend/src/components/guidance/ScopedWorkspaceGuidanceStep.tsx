'use client';

import Link from 'next/link';
import { ExternalLink, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  buildJourneyTitle,
  formatIssueTypeLabel,
  resolveGuidanceStepHref,
} from '@/features/guidance/utils/guidanceDisplay';
import type {
  GuidanceJourneyDTO,
  GuidanceNextStepResult,
  GuidanceStepDTO,
} from '@/lib/api/guidanceApi';

type ScopedWorkspaceGuidanceStepProps = {
  propertyId: string;
  journey: GuidanceJourneyDTO;
  step: GuidanceStepDTO;
  next: GuidanceNextStepResult | null;
  backHref: string;
};

type WorkspaceBridgeConfig = {
  actionLabel: string;
  summary: string;
  bullets: string[];
};

const WORKSPACE_BRIDGE_CONFIG: Record<string, WorkspaceBridgeConfig> = {
  'quote-comparison': {
    actionLabel: 'Open quote comparison',
    summary: 'Compare provider options side by side before you decide which quote to accept.',
    bullets: [
      'Bring competing quotes into one view to compare scope, timing, and price.',
      'Keep this journey attached while you review and decide.',
      'Return here once you are ready to move to final pricing or booking.',
    ],
  },
  'price-finalization': {
    actionLabel: 'Open price finalization',
    summary: 'Lock in the final quoted price and confirm the terms you are comfortable accepting.',
    bullets: [
      'Review the accepted amount and vendor details in one place.',
      'Capture the final terms before moving forward to booking.',
      'Keep the guidance journey linked so the next step stays accurate.',
    ],
  },
  'coverage-options': {
    actionLabel: 'Open coverage options',
    summary: 'Review policy and warranty options that can reduce future uncovered costs.',
    bullets: [
      'See which protection paths best match the current issue.',
      'Use the scoped guidance context to stay focused on this property need.',
      'Return here once you decide whether more coverage is worth pursuing.',
    ],
  },
  documents: {
    actionLabel: 'Open documents workspace',
    summary: 'Update the records and supporting documents tied to this step so the journey can move forward cleanly.',
    bullets: [
      'Upload or review the documents needed for this decision.',
      'Keep the current journey attached while you add records.',
      'Return here after the document step is complete.',
    ],
  },
  'home-event-radar': {
    actionLabel: 'Open home event radar',
    summary: 'Review the live event signal behind this step and understand why the home needs attention now.',
    bullets: [
      'See the current event context driving this recommendation.',
      'Use the property-scoped signal details before taking action.',
      'Return here once you have reviewed the event and are ready to continue.',
    ],
  },
  incidents: {
    actionLabel: 'Open incidents',
    summary: 'Review the live incident behind this step and understand why the home needs attention now.',
    bullets: [
      'See the active incident driving this recommendation.',
      'Use the property-scoped incident details before taking action.',
      'Return here once you have reviewed the incident and are ready to continue.',
    ],
  },
  maintenance: {
    actionLabel: 'Open maintenance workspace',
    summary: 'Work through the maintenance actions connected to this guidance step without losing journey continuity.',
    bullets: [
      'Review the checklist or tasks relevant to this issue.',
      'Use the current journey context to stay focused on the right maintenance action.',
      'Return here when the task is complete or you are ready to book help.',
    ],
  },
  'inspection-report': {
    actionLabel: 'Open inspection report',
    summary: 'Review the inspection findings in detail so you can judge urgency and decide on next steps confidently.',
    bullets: [
      'Use the original report details to understand the flagged issue.',
      'Keep the journey attached while you assess what matters most.',
      'Return here after reviewing the report to continue the guided path.',
    ],
  },
  'true-cost': {
    actionLabel: 'Open true cost analysis',
    summary: 'Estimate the full out-of-pocket impact before deciding whether to act now, wait, or change course.',
    bullets: [
      'Review total ownership or remediation cost in context.',
      'Use the result to support the decision step that follows.',
      'Return here when you are ready to continue the journey.',
    ],
  },
  'do-nothing-simulator': {
    actionLabel: 'Open cost of delay analysis',
    summary: 'Model the downside of waiting so you can compare action now versus delay with real context.',
    bullets: [
      'See how the cost changes over time if you do nothing.',
      'Use the journey-linked scenario instead of starting from scratch.',
      'Return here after reviewing the model to continue.',
    ],
  },
  'home-savings': {
    actionLabel: 'Open home savings',
    summary: 'Identify savings opportunities that can offset the cost of this issue or planned improvement.',
    bullets: [
      'Review recurring savings that can fund the next step.',
      'Keep this journey attached while you evaluate the tradeoffs.',
      'Return here once you know whether savings change the decision.',
    ],
  },
  'capital-timeline': {
    actionLabel: 'Open capital timeline',
    summary: 'Place this project on the broader home spending timeline so it fits with the rest of your planned work.',
    bullets: [
      'See where this work fits alongside other future expenses.',
      'Use the current journey context to keep the timeline scoped correctly.',
      'Return here after reviewing the schedule implications.',
    ],
  },
};

export function ScopedWorkspaceGuidanceStep({
  propertyId,
  journey,
  step,
  next,
  backHref,
}: ScopedWorkspaceGuidanceStepProps) {
  const workspaceHref =
    resolveGuidanceStepHref({
      propertyId,
      journey,
      step,
      next,
      mode: 'standalone',
    }) ?? backHref;

  const config = WORKSPACE_BRIDGE_CONFIG[step.toolKey ?? ''] ?? {
    actionLabel: 'Open scoped workspace',
    summary:
      'Continue this guidance step in the linked workspace while keeping the journey context attached.',
    bullets: [
      'Open the dedicated workspace for this step.',
      'Keep the journey linked while you review or act.',
      'Return here when you are ready to continue.',
    ],
  };

  const assetName = journey.inventoryItem?.name?.trim() || buildJourneyTitle(journey);
  const issueLabel = formatIssueTypeLabel(journey.issueType) ?? 'Current guided issue';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-emerald-50 p-2 text-emerald-700">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="space-y-2">
          <p className="mb-0 text-base font-semibold text-slate-900">{step.label}</p>
          <p className="mb-0 text-sm text-slate-600">{config.summary}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
          {assetName}
        </span>
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
          {issueLabel}
        </span>
        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          Journey context preserved
        </span>
      </div>

      <ul className="mt-4 space-y-2 pl-5 text-sm text-slate-600">
        {config.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button asChild className="rounded-xl">
          <Link href={workspaceHref}>
            {config.actionLabel}
            <ExternalLink className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href={backHref}>Back to journey</Link>
        </Button>
      </div>
    </div>
  );
}

export default ScopedWorkspaceGuidanceStep;
