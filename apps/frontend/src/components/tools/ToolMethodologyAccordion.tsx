'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MethodologyStep {
  number: number;
  title: string;
  description: string;
}

export interface MethodologyColumn {
  heading: string;
  items: string[];
}

export interface ToolMethodologyAccordionProps {
  whatItDoes: string;
  steps: MethodologyStep[];
  columns?: [MethodologyColumn, MethodologyColumn];
  anchorId?: string;
}

export function ToolMethodologyAccordion({
  whatItDoes,
  steps,
  columns,
  anchorId = 'methodology',
}: ToolMethodologyAccordionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      id={anchorId}
      className="overflow-hidden rounded-xl border border-gray-200 bg-white"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50"
        aria-expanded={open}
      >
        <div>
          <p className="text-sm font-semibold text-gray-800">Methodology - how this tool works</p>
          <p className="mt-0.5 text-xs text-gray-500">{whatItDoes}</p>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="space-y-6 border-t border-gray-100 px-5 py-5">
          <div>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              How it works
            </p>
            <ol className="space-y-4">
              {steps.map((step) => (
                <li key={step.number} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-teal-200 bg-teal-50 text-xs font-semibold text-teal-700">
                    {step.number}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{step.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-gray-500">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {columns && (
            <div className="grid grid-cols-1 gap-5 border-t border-gray-100 pt-1 sm:grid-cols-2">
              {columns.map((col) => (
                <div key={col.heading}>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    {col.heading}
                  </p>
                  <ul className="space-y-2">
                    {col.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
