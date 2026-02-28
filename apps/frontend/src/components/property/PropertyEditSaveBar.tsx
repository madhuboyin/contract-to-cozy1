"use client";

import { Loader2, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PropertyEditSaveBarProps {
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export default function PropertyEditSaveBar({ isSaving, onSave, onCancel }: PropertyEditSaveBarProps) {
  return (
    <div className="sticky bottom-0 z-30 border-t border-black/10 bg-white/95 px-4 py-2.5 shadow-[0_-4px_14px_rgba(0,0,0,0.06)] backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/90 md:hidden">
      <p className="mb-2 text-center text-xs text-gray-600 dark:text-slate-400">Takes a second. You can edit anytime.</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 min-h-[44px] min-w-[44px] border-black/10 px-3 text-gray-700 hover:bg-black/[0.02] dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.03]"
          onClick={onCancel}
          disabled={isSaving}
        >
          <X className="mr-1.5 h-4 w-4" />
          Cancel
        </Button>
        <Button
          type="button"
          className="h-11 min-h-[48px] flex-1 shadow-sm"
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
