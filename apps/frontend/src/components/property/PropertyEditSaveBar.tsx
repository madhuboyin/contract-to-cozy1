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
    <div className="sticky bottom-0 z-30 border-t border-border bg-background/95 px-4 py-2.5 backdrop-blur-sm md:hidden">
      <p className="mb-2 text-center text-xs text-muted-foreground">Takes a second. You can edit anytime.</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 min-h-[44px] min-w-[44px] px-3"
          onClick={onCancel}
          disabled={isSaving}
        >
          <X className="mr-1.5 h-4 w-4" />
          Cancel
        </Button>
        <Button
          type="button"
          className="h-11 min-h-[48px] flex-1"
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
