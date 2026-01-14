// apps/frontend/src/components/orchestration/DecisionTraceModal.tsx
'use client';

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
import { Clock } from 'lucide-react';

import { DecisionTraceItem } from './DecisionTraceItem';

type Props = {
  open: boolean;
  onClose: () => void;
  steps: DecisionTraceStepDTO[];

  onMarkCompleted?: () => void;
  onUndo?: () => void;
  onSnooze?: () => void;
  onViewTask?: () => void;
};

/**
 * If you want to keep raw details during test phase,
 * gate it behind a local dev-only flag.
 */
const SHOW_INTERNAL_DETAILS =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_SHOW_TRACE_INTERNALS === 'true';

export const DecisionTraceModal: React.FC<Props> = ({
  open,
  onClose,
  steps,
  onMarkCompleted,
  onUndo,
  onSnooze,
  onViewTask,
}) => {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>How this recommendation was decided</DialogTitle>
        </DialogHeader>

        {/* ================= Trace Body ================= */}
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {steps.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No decision details are available for this recommendation.
            </div>
          ) : (
            steps.map((step, idx) => (
              <div
                key={`trace-step-${idx}`}
                className="rounded-md border p-3 text-sm bg-white space-y-2"
              >
                {/* Canonical renderer (labels + details come from decisionTraceLabels.ts) */}
                <DecisionTraceItem type="RULE" step={step} />

                {/* Dev/test-only raw payload dump */}
                {SHOW_INTERNAL_DETAILS && step.details && (
                  <details>
                    <summary className="cursor-pointer text-xs text-blue-600 hover:underline">
                      View internal details
                    </summary>
                    <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                      {JSON.stringify(step.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))
          )}
        </div>

        {/* ================= Footer ================= */}
        <DialogFooter className="flex justify-between gap-2">
          <div className="flex gap-2">
            {onSnooze && (
              <Button variant="outline" onClick={onSnooze}>
                <Clock className="mr-2 h-4 w-4" />
                Snooze
              </Button>
            )}

            {onMarkCompleted && (
              <Button
                onClick={() => {
                  onClose();
                  onMarkCompleted();
                }}
              >
                Mark as completed
              </Button>
            )}

            {onViewTask && (
              <Button
                onClick={() => {
                  onViewTask();
                  onClose();
                }}
              >
                View Task in Maintenance
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {onUndo && (
              <Button variant="outline" onClick={onUndo}>
                Undo Completion
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
