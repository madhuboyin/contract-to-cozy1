"use client";

import { useReducedMotion } from "framer-motion";
import { HelpCircle } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PropertyEditHeaderNudgeProps {
  completionCount: number;
  completionTotal: number;
  completionPct: number;
  nextBestStepText: string | null;
  className?: string;
}

export default function PropertyEditHeaderNudge({
  completionCount,
  completionTotal,
  completionPct,
  nextBestStepText,
  className,
}: PropertyEditHeaderNudgeProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={["rounded-lg border border-black/5 bg-white p-3 dark:border-white/10 dark:bg-slate-950/30", className].filter(Boolean).join(" ")}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Update home details</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400">A few updates help us give better reminders and tips.</p>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 self-start rounded-full border border-black/10 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300"
                aria-label="Details completeness info"
              >
                Details completeness {completionPct}%
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              The more details you add, the better your reminders and home tips.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="mt-2">
        <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
          <span>{completionCount} of {completionTotal} done</span>
          <span>{completionPct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-primary"
            style={{
              width: `${completionPct}%`,
              transition: reduceMotion ? "none" : "width 150ms ease",
            }}
          />
        </div>
        {nextBestStepText ? (
          <p className="mt-2 text-xs text-gray-600 dark:text-slate-400">Next: {nextBestStepText} (takes ~10 seconds)</p>
        ) : (
          <p className="mt-2 text-xs text-gray-600 dark:text-slate-400">You can still edit anytime.</p>
        )}
      </div>
    </div>
  );
}
