"use client";

import { Loader2, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PropertyEditSaveBarProps {
  isSaving: boolean;
  completionPct: number;
  onSave: () => void;
  onCancel: () => void;
}

function getSaveBarCopy(completionPercent: number): string {
  if (completionPercent === 100) {
    return "Profile complete · Your maintenance plan is fully personalized.";
  }
  if (completionPercent >= 90) {
    return `Profile ${completionPercent}% complete · Almost there — one more step.`;
  }
  if (completionPercent >= 70) {
    return `Profile ${completionPercent}% complete · Better data = better recommendations.`;
  }
  return `Profile ${completionPercent}% complete · Keep going to unlock your full plan.`;
}

export default function PropertyEditSaveBar({ isSaving, completionPct, onSave, onCancel }: PropertyEditSaveBarProps) {
  const copy = getSaveBarCopy(completionPct);
  return (
    <div className="sticky bottom-0 z-30 border-t border-black/10 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/90 md:hidden">
      <p className="mb-2 text-center text-xs text-gray-700 dark:text-slate-300">{copy}</p>
      <div className="flex items-center gap-2 max-[640px]:flex-col">
        <Button
          type="button"
          variant="outline"
          className="h-12 min-h-[48px] min-w-[44px] border-black/10 px-3 text-gray-700 hover:bg-black/[0.02] dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.03] max-[640px]:w-full"
          onClick={onCancel}
          disabled={isSaving}
        >
          <X className="mr-1.5 h-4 w-4" />
          Cancel
        </Button>
        <Button
          type="button"
          className="h-12 min-h-[48px] flex-1 shadow-sm max-[640px]:w-full"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
