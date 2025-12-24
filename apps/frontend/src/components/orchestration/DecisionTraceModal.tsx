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

  /**
   * Optional action resolution
   */
  onMarkCompleted?: () => void;
};

export const DecisionTraceModal: React.FC<Props> = ({
  open,
  onClose,
  steps,
  onMarkCompleted,
}) => {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>How this recommendation was decided</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className="rounded-md border p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold">{step.rule}</div>
                <span
                  className={`text-xs font-medium ${
                    step.outcome === 'APPLIED'
                      ? 'text-green-700'
                      : 'text-gray-500'
                  }`}
                >
                  {step.outcome}
                </span>
              </div>

              {step.details && (
                <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                  {JSON.stringify(step.details, null, 2)}
                </pre>
              )}
            </div>
          ))}

          {steps.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No decision details available.
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between gap-2">
          {onMarkCompleted && (
            <Button
              variant="outline"
              onClick={() => {
                onMarkCompleted();
                onClose();
              }}
            >
              Mark as completed
            </Button>
          )}

          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
