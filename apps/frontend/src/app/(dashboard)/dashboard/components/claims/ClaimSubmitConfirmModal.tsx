// apps/frontend/src/app/(dashboard)/dashboard/components/claims/ClaimSubmitConfirmModal.tsx
'use client';

import React from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;

  claimStatus: string;
  checklistCompletionPct?: number | null;
  blockingCount: number;
};

export default function ClaimSubmitConfirmModal({
  open,
  onClose,
  onConfirm,
  loading,
  claimStatus,
  checklistCompletionPct,
  blockingCount,
}: Props) {
  if (!open) return null;

  const isBlocked = blockingCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Submit claim?</div>
            <div className="mt-1 text-sm opacity-80">
              This will lock the checklist and mark the claim as <b>SUBMITTED</b>.
            </div>
          </div>
          <button
            className="rounded px-2 py-1 text-sm opacity-70 hover:bg-black/5"
            onClick={onClose}
            disabled={loading}
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="opacity-70">Current status</span>
            <span className="font-medium">{claimStatus}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="opacity-70">Checklist completion</span>
            <span className="font-medium">
              {Math.round(Number(checklistCompletionPct ?? 0))}%
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="opacity-70">Blocking items</span>
            <span className={isBlocked ? "font-semibold" : "font-medium"}>
              {blockingCount}
            </span>
          </div>

          {isBlocked ? (
            <div className="mt-3 rounded bg-black/5 p-3 text-sm">
              <div className="font-medium">Cannot submit yet</div>
              <div className="mt-1 opacity-80">
                Resolve the blocking checklist requirements first. Open the checklist items marked with ⚠.
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded bg-black/5 p-3 text-sm">
              <div className="font-medium">Ready to submit</div>
              <div className="mt-1 opacity-80">
                You can still upload additional documents after submitting, but checklist requirements are enforced.
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>

          <button
            className={`rounded px-3 py-2 text-sm text-white ${
              isBlocked ? "bg-black/30 cursor-not-allowed" : "bg-black"
            }`}
            onClick={onConfirm}
            disabled={loading || isBlocked}
          >
            {loading ? "Submitting…" : "Confirm submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
