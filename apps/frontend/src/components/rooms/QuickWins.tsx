'use client';

import React from 'react';
import { ArrowRight, Lightbulb, Sparkles } from 'lucide-react';

type QuickWin = {
  title: string;
  detail?: string;
};

type QuickWinsProps = {
  quickWins: QuickWin[];
  onAddItem: () => void;
  onOpenChecklist: () => void;
};

export default function QuickWins({ quickWins, onAddItem, onOpenChecklist }: QuickWinsProps) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Quick wins</h2>
          <p className="mt-1 text-sm text-gray-500">Small actions that can improve this room fast.</p>
        </div>

        <button
          type="button"
          onClick={onOpenChecklist}
          className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900"
        >
          <Lightbulb className="h-3.5 w-3.5" />
          Open checklist
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {quickWins.length > 0 ? (
          quickWins.map((win, index) => (
            <div
              key={`${win.title}-${index}`}
              className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 transition-colors hover:bg-gray-50"
            >
              <p className="text-sm font-semibold text-gray-800">{win.title}</p>
              {win.detail ? <p className="mt-1 text-xs leading-relaxed text-gray-500">{win.detail}</p> : null}
            </div>
          ))
        ) : (
          <div
            className="group col-span-full flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-gray-200 p-8 text-center transition-all duration-200 hover:border-teal-300 hover:bg-teal-50/30"
            onClick={onAddItem}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onAddItem();
              }
            }}
          >
            <div className="mb-3 rounded-full bg-gray-100 p-3 transition-colors duration-200 group-hover:bg-teal-100">
              <Sparkles className="h-6 w-6 text-gray-400 transition-colors group-hover:text-teal-600" />
            </div>
            <p className="text-sm font-semibold text-gray-700 transition-colors group-hover:text-teal-700">Unlock quick wins</p>
            <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-gray-400">
              Add items with values to get personalized saving suggestions
            </p>
            <span className="mt-3 flex items-center gap-1 text-xs font-semibold text-teal-600 transition-colors group-hover:text-teal-700">
              Add your first item
              <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
