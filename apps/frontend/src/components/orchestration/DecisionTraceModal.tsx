// apps/frontend/src/components/orchestration/DecisionTraceModal.tsx

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DecisionTraceStepDTO } from '@/types';

type Props = {
  open: boolean;
  onClose: () => void;
  steps: DecisionTraceStepDTO[];

  onMarkCompleted?: () => void;
  onUndo?: () => void;
  onSnooze?: () => void;
};

export const DecisionTraceModal: React.FC<Props> = ({
  open,
  onClose,
  steps,
  onMarkCompleted,
  onUndo,
  onSnooze,
}) => {
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>How this recommendation was decided</DialogTitle>
        </DialogHeader>

        {/* ================= Trace Body ================= */}
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {steps.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No decision details are available for this recommendation.
            </div>
          )}

          {steps.map((step, idx) => (
            <div
              key={`trace-step-${idx}`}
              className="rounded-md border p-3 text-sm bg-white"
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-gray-900">
                  {humanizeRule(step.rule)}
                </div>

                <span
                  className={`text-xs font-medium ${
                    step.outcome === 'APPLIED'
                      ? 'text-green-700'
                      : 'text-gray-500'
                  }`}
                >
                  {step.outcome === 'APPLIED' ? 'Applied' : 'Skipped'}
                </span>
              </div>

              {humanizeDetails(step) && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {humanizeDetails(step)}
                </div>
              )}

              {step.details && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-blue-600 hover:underline">
                    View internal details
                  </summary>
                  <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                    {JSON.stringify(step.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>

        {/* ================= Footer ================= */}
        <DialogFooter className="flex justify-between gap-2">
          <div className="flex gap-2">
            {onSnooze && (
              <Button
                variant="outline"
                onClick={() => {
                  onSnooze();
                  onClose();
                }}
              >
                Snooze
              </Button>
            )}

            {onMarkCompleted && (
              <Button
                onClick={() => {
                  onMarkCompleted();
                  onClose();
                }}
              >
                Mark as completed
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {onUndo && (
              <Button variant="outline" onClick={onUndo}>
                Undo
              </Button>
            )}

            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------------------------------------------
   Helpers — same language as DecisionTracePanel
------------------------------------------------------------------- */

function humanizeRule(rule: string) {
  switch (rule) {
    case 'RISK_ACTIONABLE':
      return 'This issue requires attention';
    case 'USER_SNOOZED': 
      return 'You snoozed this recommendation';
    case 'RISK_INFER_ASSET_KEY':
      return 'We identified the part of your home involved';
    case 'COVERAGE_MATCHING':
      return 'We checked your warranties and insurance';
    case 'COVERAGE_AWARE_CTA':
      return 'Your coverage affected the recommendation';
    case 'BOOKING_SUPPRESSION':
      return 'We checked for existing scheduled work';
    case 'SUPPRESSION_FINAL':
      return 'Final decision made';
    case 'USER_MARKED_COMPLETE':
      return 'You marked this recommendation as completed';
    case 'CHECKLIST_SUPPRESSION':
    case 'CHECKLIST_SUPPRESSION_AUTHORITATIVE':
      return 'This is already tracked in your maintenance checklist';
    case 'CHECKLIST_ACTIONABLE':
      return 'This maintenance task needs attention';
    default:
      return rule.replace(/_/g, ' ');
  }
}

function humanizeDetails(step: DecisionTraceStepDTO) {
  if (!step.details) return null;

  if (step.rule === 'BOOKING_SUPPRESSION') {
    return step.outcome === 'APPLIED'
      ? 'Related work is already scheduled.'
      : 'No related work is currently scheduled.';
  }
  
  if (step.rule === 'USER_SNOOZED') {
    const snoozeUntil = step.details?.snoozeUntil 
      ? new Date(step.details.snoozeUntil).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : 'a future date';
    
    const reason = step.details?.reason;
    
    return `Snoozed until ${snoozeUntil}${reason ? `. Reason: ${reason}` : ''}`;
  }

  if (step.rule === 'COVERAGE_MATCHING') {
    return step.details?.type === 'NONE'
      ? 'No active coverage was found for this issue.'
      : 'Active coverage was found.';
  }

  // 🔑 NEW: Handle CHECKLIST_ITEM_TRACKED
  if (step.rule === 'CHECKLIST_ITEM_TRACKED') {
    return step.details?.title 
      ? `Tracked in your maintenance schedule as "${step.details.title}".`
      : 'Tracked in your maintenance schedule.';
  }

  return 'Additional context was evaluated.';
}
