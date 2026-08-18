'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ClipboardCheck, Printer, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { BuyerInspectionModuleRecommendation, BuyerInspectionSpecialistScope } from '@/types';

const STANDARD_CHECKLIST = [
  {
    title: 'Structure, foundation and water',
    items: [
      'Ask about visible movement, cracking, moisture, drainage and inaccessible areas.',
      'Confirm whether the basement, crawl space, attic and foundation were accessible.',
      'Ask which water-entry signs need prompt follow-up or continued monitoring.',
    ],
  },
  {
    title: 'Roof, exterior and site',
    items: [
      'Review the roof covering, flashing, gutters, downspouts, siding, grading and exterior openings.',
      'Ask what could not be inspected safely and whether a roof or other specialist is appropriate.',
      'Look for drainage paths, standing water and vegetation touching the home.',
    ],
  },
  {
    title: 'Electrical, plumbing and safety',
    items: [
      'Ask about the electrical panel, visible wiring, outlets, grounding and safety devices.',
      'Review visible supply, drain and waste piping, fixtures, water pressure and signs of leakage.',
      'Confirm smoke alarms, carbon-monoxide alarms, stairs, railings and other visible safety concerns.',
    ],
  },
  {
    title: 'Heating, cooling and major systems',
    items: [
      'Ask the approximate age and observed condition of heating, cooling and water-heating equipment.',
      'Confirm which systems were operated and which could not be tested.',
      'Ask which components may need specialist evaluation, service records or near-term budgeting.',
    ],
  },
  {
    title: 'Interior, windows and built-ins',
    items: [
      'Review walls, ceilings, floors, windows, doors and visible signs of moisture or movement.',
      'Ask which included appliances and built-in components were tested.',
      'Record any room or area the inspector could not access.',
    ],
  },
  {
    title: 'Before the inspector leaves',
    items: [
      'Ask which findings are urgent, which can wait and which need another professional.',
      'Ask for the three most important maintenance or repair priorities.',
      'Confirm when the report will arrive and whom to contact with follow-up questions.',
    ],
  },
] as const;

const MODULE_LABELS: Record<string, string> = {
  'buyer.inspection.dwelling-responsibility': 'Shared areas and association responsibilities',
  'buyer.inspection.foundation-spaces': 'Basement, crawl space and foundation',
  'buyer.inspection.pool-spa': 'Pool or spa',
  'buyer.inspection.site-drainage': 'Drainage and water movement',
  'buyer.inspection.home-age': 'Home age and major systems',
  'buyer.inspection.confirmed-systems': 'Known systems in this home',
  'buyer.inspection.exposure-context': 'Location-specific considerations',
};

const MODULE_DESCRIPTIONS: Record<string, string> = {
  'buyer.inspection.dwelling-responsibility': 'Ask which roof, exterior, utility or shared areas are covered by the inspection and which are handled by an association.',
  'buyer.inspection.foundation-spaces': 'Make sure accessible basement, crawl-space, moisture, drainage and foundation conditions are discussed.',
  'buyer.inspection.pool-spa': 'Ask about the structure, equipment, electrical safety, barriers, leaks and available maintenance records.',
  'buyer.inspection.site-drainage': 'Look at grading, downspouts, standing water and visible signs that water may move toward the home.',
  'buyer.inspection.home-age': 'Use the build year to focus questions about maintenance history, earlier updates and the remaining life of major systems.',
  'buyer.inspection.confirmed-systems': 'Confirm that the known roof, electrical, heating, cooling, water-heating and other major systems are covered.',
  'buyer.inspection.exposure-context': 'Discuss the location conditions recorded for this property and whether they change the inspection or document review.',
};

const SPECIALIST_LABELS: Record<BuyerInspectionSpecialistScope, string> = {
  RADON: 'radon testing',
  SEWER_SEPTIC: 'sewer or septic',
  WELL_WATER: 'well water',
  PEST: 'pest',
  CHIMNEY: 'chimney',
  ROOF: 'roof',
  STRUCTURAL: 'structural',
  ELECTRICAL: 'electrical',
  HVAC: 'heating and cooling',
  POOL_SPA: 'pool or spa',
  OIL_TANK: 'oil tank',
  MOLD: 'mold',
  ENVIRONMENTAL: 'environmental',
  OTHER: 'specialist',
};

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not added';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

interface BuyerInspectionGuideProps {
  address: string;
  scheduledAt?: string | null;
  decisionDeadline?: string | null;
  modules: BuyerInspectionModuleRecommendation[];
  unresolvedModules: BuyerInspectionModuleRecommendation[];
  printHref?: string;
  presentation?: 'embedded' | 'print';
}

export function BuyerInspectionGuide({
  address,
  scheduledAt,
  decisionDeadline,
  modules,
  unresolvedModules,
  printHref,
  presentation = 'embedded',
}: BuyerInspectionGuideProps) {
  const [showChecklist, setShowChecklist] = useState(presentation === 'print');
  const specialistSuggestions = [...new Set(modules.flatMap((module) => module.specialistScopes))];
  const correctionPath = unresolvedModules.flatMap((module) => module.correctionPaths)[0];

  return (
    <section className={`buyer-inspection-print space-y-5 bg-white ${presentation === 'print' ? 'p-0' : 'rounded-2xl border border-teal-200 p-5 sm:p-6'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">
            <ClipboardCheck className="h-4 w-4" /> Your inspection-day guide
          </div>
          <h3 className="mt-2 text-2xl font-semibold text-slate-950">What to review for this home</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Bring these questions to your inspection. The list combines whole-home essentials with the details you have shared about this property.
          </p>
        </div>
        {presentation === 'embedded' ? <div className="buyer-inspection-print-hide flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setShowChecklist((value) => !value)}>
            {showChecklist ? 'Hide full checklist' : 'View full checklist'}
          </Button>
          {printHref ? (
            <Button asChild type="button"><Link href={printHref} target="_blank"><Printer className="mr-2 h-4 w-4" />Print checklist</Link></Button>
          ) : null}
        </div> : null}
      </div>

      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
        <div><p className="text-xs uppercase tracking-wide text-slate-500">Property</p><p className="mt-1 font-medium text-slate-900">{address}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-slate-500">Inspection</p><p className="mt-1 font-medium text-slate-900">{formatDate(scheduledAt)}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-slate-500">Last day to raise inspection concerns</p><p className="mt-1 font-medium text-slate-900">{formatDate(decisionDeadline)}</p></div>
      </div>

      {modules.length > 0 && <div className="buyer-inspection-print-section rounded-xl border border-violet-200 bg-violet-50/50 p-4">
        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-700" /><p className="font-semibold text-slate-950">Extra attention for this property</p></div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {modules.map((module) => <div key={module.moduleKey} className="rounded-lg border border-violet-100 bg-white p-3">
            <p className="font-medium text-slate-900">{MODULE_LABELS[module.moduleKey] ?? module.title}</p>
            <p className="mt-1 text-sm leading-5 text-slate-600">{MODULE_DESCRIPTIONS[module.moduleKey] ?? module.description}</p>
            {module.questions.map((question) => <p key={question} className="mt-2 text-sm text-slate-800">☐ {question}</p>)}
          </div>)}
        </div>
        {specialistSuggestions.length > 0 && <p className="mt-3 text-sm text-slate-700">
          <strong>Ask whether specialized review is appropriate:</strong> {specialistSuggestions.map((scope) => SPECIALIST_LABELS[scope]).join(', ')}.
        </p>}
      </div>}

      <div className={`${showChecklist ? 'grid' : 'hidden'} buyer-inspection-print-show gap-4 md:grid-cols-2`}>
        {STANDARD_CHECKLIST.map((section) => <div key={section.title} className="buyer-inspection-print-section rounded-xl border border-slate-200 p-4">
          <h4 className="font-semibold text-slate-950">{section.title}</h4>
          <div className="mt-3 space-y-2">{section.items.map((item) => <p key={item} className="text-sm leading-5 text-slate-700">☐ {item}</p>)}</div>
        </div>)}
      </div>

      {!showChecklist && presentation === 'embedded' && <p className="buyer-inspection-print-hide text-sm text-slate-500">The full printable checklist contains {STANDARD_CHECKLIST.reduce((total, section) => total + section.items.length, 0)} whole-home review prompts.</p>}

      {correctionPath && <div className="buyer-inspection-print-hide flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm">
        <div><p className="font-medium text-slate-900">Want a more specific checklist?</p><p className="text-slate-500">Add any home details you know. Unknown details will never block the inspection guide.</p></div>
        <Button asChild type="button" variant="outline"><Link href={correctionPath}>Add home details</Link></Button>
      </div>}

      <p className="text-xs leading-5 text-slate-500">
        This guide helps you prepare questions; it does not replace a licensed inspection or confirm the condition, safety or code compliance of the property.
      </p>
    </section>
  );
}
