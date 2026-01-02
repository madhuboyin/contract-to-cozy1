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
import { Clock } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  steps: DecisionTraceStepDTO[];

  onMarkCompleted?: () => void;
  onUndo?: () => void;
  onSnooze?: () => void;
  onViewTask?: () => void;
};

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
                }}
              >
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

            {/* 🔑 View Task button when suppressed by PropertyMaintenanceTask */}
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

/* ------------------------------------------------------------------
   Helpers — Humanize rule names and details
------------------------------------------------------------------- */

function humanizeRule(rule: string): string {
  const labels: Record<string, string> = {
    // Core actionable rules
    RISK_ACTIONABLE: 'This issue requires attention',
    CHECKLIST_ACTIONABLE: 'Maintenance task requires action',
    
    // Age and system evaluation
    AGE_EVALUATION: 'System age evaluated',
    RISK_INFER_ASSET_KEY: 'System identified',
    
    // Coverage checks
    COVERAGE_CHECK: 'Coverage evaluation',
    COVERAGE_MATCHING: 'Coverage matching',
    COVERAGE_AWARE_CTA: 'Coverage affects recommendation',
    
    // Suppression checks
    SUPPRESSION_CHECK: 'Checking if already handled',
    TASK_ALREADY_SCHEDULED: 'Task already scheduled',
    TASK_EXISTS: 'Task exists',
    CHECKLIST_TRACKED: 'Already in checklist',
    CHECKLIST_ITEM_TRACKED: 'Tracked in maintenance schedule',
    CHECKLIST_SUPPRESSION: 'Already tracked in checklist',
    CHECKLIST_SUPPRESSION_AUTHORITATIVE: 'Already tracked in checklist',
    BOOKING_SUPPRESSION: 'Booking check',
    SUPPRESSION_FINAL: 'Final suppression decision',
    
    // User actions
    USER_COMPLETED: 'User action recorded',
    USER_MARKED_COMPLETE: 'You marked as completed',
    USER_SNOOZED: 'You snoozed this',
    
    // Action state
    ACTION_REQUIRED: 'Action is required',
    SNOOZED: 'Currently snoozed',
  };

  return labels[rule] || rule.replace(/_/g, ' ');
}

function humanizeDetails(step: DecisionTraceStepDTO): string | null {
  if (!step.details) return null;

  // Age evaluation details
  if (step.rule === 'AGE_EVALUATION') {
    if (step.details.message) {
      return step.details.message as string;
    }
    if (step.details.remainingLife !== undefined) {
      const remaining = step.details.remainingLife as number;
      const percentUsed = step.details.percentUsed as number;
      return remaining <= 0
        ? `System has exceeded expected lifespan (${percentUsed}% used)`
        : `System has ${remaining} years remaining (${percentUsed}% used)`;
    }
  }

  // Coverage check details
  if (step.rule === 'COVERAGE_CHECK' || step.rule === 'COVERAGE_MATCHING') {
    if (step.details.message) {
      return step.details.message as string;
    }
    const hasCoverage = step.details.hasCoverage;
    if (hasCoverage === false) {
      return 'No active coverage found for this issue';
    }
    if (hasCoverage === true) {
      const type = step.details.coverageType || step.details.type;
      return type ? `Covered by ${type}` : 'Active coverage found';
    }
  }

  // Task already scheduled
  if (step.rule === 'TASK_ALREADY_SCHEDULED' || step.rule === 'TASK_EXISTS') {
    if (step.details.message) {
      return step.details.message as string;
    }
    if (step.details.taskTitle) {
      return `Already scheduled: "${step.details.taskTitle}"`;
    }
    return 'This action is already covered by a maintenance task';
  }

  // Checklist tracked
  if (step.rule === 'CHECKLIST_TRACKED' || step.rule === 'CHECKLIST_ITEM_TRACKED') {
    if (step.details.message) {
      return step.details.message as string;
    }
    if (step.details.itemTitle || step.details.title) {
      const title = step.details.itemTitle || step.details.title;
      return `Tracked in your maintenance schedule as "${title}"`;
    }
    return 'Tracked in your maintenance schedule';
  }

  // User completed
  if (step.rule === 'USER_COMPLETED' || step.rule === 'USER_MARKED_COMPLETE') {
    if (step.details.message) {
      return step.details.message as string;
    }
    return 'You marked this as complete';
  }

  // Snoozed
  if (step.rule === 'SNOOZED' || step.rule === 'USER_SNOOZED') {
    if (step.details.message) {
      return step.details.message as string;
    }
    
    const daysRemaining = step.details.daysRemaining;
    const snoozeUntil = step.details.snoozedUntil || step.details.snoozeUntil;
    const reason = step.details.reason || step.details.snoozeReason;
    
    let message = '';
    
    if (daysRemaining !== undefined) {
      message = `Snoozed for ${daysRemaining} more ${daysRemaining === 1 ? 'day' : 'days'}`;
    } else if (snoozeUntil) {
      const date = new Date(snoozeUntil).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      message = `Snoozed until ${date}`;
    } else {
      message = 'Currently snoozed';
    }
    
    if (reason) {
      message += `. Reason: ${reason}`;
    }
    
    return message;
  }

  // Action required
  if (step.rule === 'ACTION_REQUIRED') {
    if (step.details.message) {
      return step.details.message as string;
    }
    return 'This item requires scheduling or attention';
  }

  // Booking suppression
  if (step.rule === 'BOOKING_SUPPRESSION') {
    return step.outcome === 'APPLIED'
      ? 'Related work is already scheduled'
      : 'No related work is currently scheduled';
  }

  // Default: show generic message if details exist
  if (step.details.message) {
    return step.details.message as string;
  }

  return 'Additional context was evaluated';
}