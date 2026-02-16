// apps/frontend/src/components/orchestration/DecisionTraceModal.tsx

import React, { useMemo } from 'react';
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

import { getRuleMeta, formatRuleDetails } from './decisionTraceLabels';

type Props = {
  open: boolean;
  onClose: () => void;
  steps: DecisionTraceStepDTO[];
  showInternalDetails?: boolean;

  onMarkCompleted?: () => void;
  onUndo?: () => void;
  onSnooze?: () => void;
  onViewTask?: () => void;
};

function hasConfidenceImpact(steps: DecisionTraceStepDTO[]) {
  return steps.some((s) => typeof s.confidenceImpact === 'number' && Number.isFinite(s.confidenceImpact));
}

function impactToPoints(impact?: number | null) {
  if (impact === undefined || impact === null) return null;
  const n = Number(impact);
  if (!Number.isFinite(n)) return null;
  // confidenceImpact is -1.0 → +1.0. Convert to a friendly +/- points scale.
  return Math.round(n * 100);
}

function deltaBadge(points: number | null) {
  if (points === null) {
    return (
      <span className="text-xs text-muted-foreground px-2 py-0.5 rounded border bg-white">
        —
      </span>
    );
  }

  if (points === 0) {
    return (
      <span className="text-xs text-muted-foreground px-2 py-0.5 rounded border bg-white">
        0
      </span>
    );
  }

  const isUp = points > 0;
  const label = `${isUp ? '▲' : '▼'} ${isUp ? '+' : ''}${points}`;
  const cls = isUp
    ? 'text-xs text-green-700 px-2 py-0.5 rounded border bg-white'
    : 'text-xs text-red-700 px-2 py-0.5 rounded border bg-white';

  return <span className={cls}>{label}</span>;
}

function topDrivers(steps: DecisionTraceStepDTO[]) {
  // Only consider steps with impacts
  const impacted = steps
    .map((s) => ({ step: s, pts: impactToPoints(s.confidenceImpact) }))
    .filter((x) => x.pts !== null) as { step: DecisionTraceStepDTO; pts: number }[];

  const up = [...impacted].filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 2);
  const down = [...impacted].filter((x) => x.pts < 0).sort((a, b) => a.pts - b.pts).slice(0, 2);

  return { up, down };
}

export const DecisionTraceModal: React.FC<Props> = ({
  open,
  onClose,
  steps,
  showInternalDetails = false,
  onMarkCompleted,
  onUndo,
  onSnooze,
  onViewTask,
}) => {
  const showImpact = useMemo(() => hasConfidenceImpact(steps), [steps]);
  const drivers = useMemo(() => (showImpact ? topDrivers(steps) : null), [steps, showImpact]);

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>How this recommendation was decided</DialogTitle>
        </DialogHeader>

        {/* ================= Confidence Drivers (optional) ================= */}
        {showImpact && drivers && (drivers.up.length > 0 || drivers.down.length > 0) && (
          <div className="rounded-md border bg-gray-50 p-3 text-sm space-y-2">
            <div className="font-medium text-gray-900">Confidence drivers</div>

            {drivers.up.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-800">What increased confidence</div>
                <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700">
                  {drivers.up.map(({ step, pts }, idx) => {
                    const meta = getRuleMeta(step.rule);
                    return (
                      <li key={`up-${idx}`}>
                        <span className="font-medium text-gray-900">{meta.label}</span>{' '}
                        <span className="text-muted-foreground">({`+${pts}`})</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {drivers.down.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-800">What reduced confidence</div>
                <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700">
                  {drivers.down.map(({ step, pts }, idx) => {
                    const meta = getRuleMeta(step.rule);
                    return (
                      <li key={`down-${idx}`}>
                        <span className="font-medium text-gray-900">{meta.label}</span>{' '}
                        <span className="text-muted-foreground">({pts})</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ================= Trace Body ================= */}
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {steps.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No decision details are available for this recommendation.
            </div>
          )}

          {steps.map((step, idx) => {
            const meta = getRuleMeta(step.rule);
            const pts = impactToPoints(step.confidenceImpact);

            return (
              <div
                key={`trace-step-${idx}`}
                className="rounded-md border p-3 text-sm bg-white"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-gray-900">
                    {meta.label}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Confidence delta badge */}
                    {showImpact && deltaBadge(pts)}

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
                </div>

                {/* Curated short detail */}
                {step.details && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatRuleDetails(step.details)}
                  </div>
                )}

                {/* Internal details */}
                {showInternalDetails && step.details && (
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
            );
          })}
        </div>

        {/* ================= Footer ================= */}
        <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
          <div className="flex flex-wrap gap-2">
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

          <div className="flex flex-wrap gap-2">
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
