'use client';

import { useState, type ReactNode } from 'react';
import { CheckCircle2, ChevronDown, Circle, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function BuyerWorkspaceGuidance({
  eyebrow,
  title,
  description,
  status,
  steps,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  steps: Array<{ label: string; complete?: boolean; detail?: string }>;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.17em] text-teal-700"><Sparkles className="h-4 w-4" />{eyebrow}</p>
          <h4 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{title}</h4>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <Badge variant="secondary" className="bg-white text-slate-700">{status}</Badge>
      </div>
      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={`${index}-${step.label}`} className="rounded-xl border border-white bg-white/80 p-3 text-sm shadow-sm">
            <div className="flex items-start gap-2">
              {step.complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
              <div><p className="font-medium text-slate-900">{step.label}</p>{step.detail && <p className="mt-1 text-xs leading-5 text-slate-500">{step.detail}</p>}</div>
            </div>
          </li>
        ))}
      </ol>
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}

export function BuyerWorkspaceDetails({
  summary,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
}: {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setLocalOpen(next);
    onOpenChange?.(next);
  };
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="font-medium text-slate-900">Recorded details</p><p className="mt-1 text-sm text-slate-500">{summary}</p></div>
        <Button type="button" variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide recorded details' : 'View or edit details'}<ChevronDown className={`ml-2 h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} /></Button>
      </div>
      {open && <div className="border-t border-slate-100 bg-slate-50/50 p-4">{children}</div>}
    </section>
  );
}
