// apps/frontend/src/app/(dashboard)/dashboard/components/claims/ClaimQuickActions.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { ClaimDTO, ClaimStatus, ClaimType } from '@/types/claims.types';
import { regenerateChecklist } from '@/app/(dashboard)/dashboard/properties/[id]/claims/claimsApi';
import { toast } from '@/components/ui/use-toast';

const STATUS_OPTIONS: ClaimStatus[] = [
  'DRAFT',
  'IN_PROGRESS',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'DENIED',
  'CLOSED',
];

const TYPE_OPTIONS: ClaimType[] = [
  'WATER_DAMAGE',
  'FIRE_SMOKE',
  'STORM_WIND_HAIL',
  'THEFT_VANDALISM',
  'LIABILITY',
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'APPLIANCE',
  'OTHER',
];

function buildResetSummary(claim: ClaimDTO, nextType: ClaimType) {
  const doneCount =
    (claim.checklistItems ?? []).filter((i) => i.status === 'DONE').length || 0;
  const totalCount = (claim.checklistItems ?? []).length || 0;

  return {
    doneCount,
    totalCount,
    fromType: claim.type,
    toType: nextType,
  };
}

export default function ClaimQuickActions({
  claim,
  busy,
  onPatch,
  onSubmitBlocked,
}: {
  claim: ClaimDTO;
  busy: boolean;
  onPatch: (patch: any) => Promise<void>;
  onSubmitBlocked?: (blocking: any[]) => void;
}) {
  const [status, setStatus] = useState<ClaimStatus>(claim.status);
  const [type, setType] = useState<ClaimType>(claim.type);
  const [providerName, setProviderName] = useState(claim.providerName ?? '');
  const [claimNumber, setClaimNumber] = useState(claim.claimNumber ?? '');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  // NEW: submit confirmation modal
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitBlockedCount, setSubmitBlockedCount] = useState<number>(0);

  // ✅ Keep local form state in sync when claim prop changes (e.g., after refresh)
  useEffect(() => {
    setStatus(claim.status);
    setType(claim.type);
    setProviderName(claim.providerName ?? '');
    setClaimNumber(claim.claimNumber ?? '');

    // when claim updates, clear any previous submit-block state
    setSubmitBlockedCount(0);
  }, [claim.id, claim.status, claim.type, claim.providerName, claim.claimNumber]);

  const dirty = useMemo(() => {
    return (
      status !== claim.status ||
      providerName !== (claim.providerName ?? '') ||
      claimNumber !== (claim.claimNumber ?? '')
    );
  }, [status, providerName, claimNumber, claim.status, claim.providerName, claim.claimNumber]);

  const typeDirty = type !== claim.type;

  const isSubmittingTransition =
    status === 'SUBMITTED' && claim.status !== 'SUBMITTED';

  const patchToSave = useMemo(() => {
    return {
      status,
      providerName: providerName || null,
      claimNumber: claimNumber || null,
    };
  }, [status, providerName, claimNumber]);

  async function doPatch(patch: any) {
    try {
      await onPatch(patch);
      // success => close submit confirm if open
      setSubmitConfirmOpen(false);
      setSubmitBlockedCount(0);
    } catch (e: any) {
      const payload = e?.payload;
      if (e?.status === 409 && payload?.code === 'CLAIM_SUBMIT_BLOCKED') {
        const blocking = payload?.blocking ?? [];
        const first = blocking[0];

        // Notify parent so ClaimChecklist can highlight items
        onSubmitBlocked?.(blocking);

        // Keep modal open, show blocked count inside it
        setSubmitBlockedCount(blocking.length);

        toast({
          title: 'Cannot submit yet',
          description: first
            ? `Blocked by: ${first.title} (${first.missingDocs ? `missing ${first.missingDocs} doc(s)` : 'status incomplete'})`
            : 'Checklist requirements are incomplete.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Save failed',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
      throw e;
    }
  }

  async function save() {
    // If user is transitioning to SUBMITTED, force confirmation
    if (isSubmittingTransition) {
      setSubmitConfirmOpen(true);
      return;
    }

    await doPatch(patchToSave);
  }

  async function confirmSubmit() {
    setSubmitBusy(true);
    try {
      await doPatch(patchToSave);
    } finally {
      setSubmitBusy(false);
    }
  }

  function resetForm() {
    setStatus(claim.status);
    setType(claim.type);
    setProviderName(claim.providerName ?? '');
    setClaimNumber(claim.claimNumber ?? '');
    setSubmitBlockedCount(0);
  }

  async function confirmTypeChangeAndRegenerate() {
    setRegenBusy(true);
    try {
      await regenerateChecklist(claim.propertyId, claim.id, {
        type,
        replaceExisting: true,
      });

      await onPatch({});
    } finally {
      setRegenBusy(false);
      setConfirmOpen(false);
    }
  }

  const resetSummary = useMemo(() => buildResetSummary(claim, type), [claim, type]);

  return (
    <>
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-col sm:flex-wrap sm:flex-row sm:items-end gap-3">
          <div className="w-full sm:min-w-[200px] sm:w-auto">
            <div className="text-xs font-semibold text-gray-700">Status</div>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as ClaimStatus)}
              disabled={busy || regenBusy || submitBusy}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-gray-500">
              SUBMITTED sets <code>submittedAt</code>, CLOSED sets <code>closedAt</code>.
            </div>
          </div>

          <div className="w-full sm:min-w-[220px] sm:w-auto">
            <div className="text-xs font-semibold text-gray-700">Type</div>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as ClaimType)}
              disabled={busy || regenBusy || submitBusy}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-gray-500">
              Changing type requires checklist regeneration (to avoid mixing templates).
            </div>
          </div>

          <div className="w-full sm:min-w-[220px] sm:w-auto flex-1">
            <div className="text-xs font-semibold text-gray-700">Provider</div>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              disabled={busy || regenBusy || submitBusy}
              placeholder="e.g., State Farm"
            />
          </div>

          <div className="w-full sm:min-w-[180px] sm:w-auto">
            <div className="text-xs font-semibold text-gray-700">Claim #</div>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={claimNumber}
              onChange={(e) => setClaimNumber(e.target.value)}
              disabled={busy || regenBusy || submitBusy}
              placeholder="Optional"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:ml-auto gap-2 w-full sm:w-auto">
            {typeDirty ? (
              <button
                className="rounded-lg border px-3 py-2.5 sm:py-2 text-sm min-h-[44px] hover:bg-gray-50"
                onClick={() => setConfirmOpen(true)}
                disabled={busy || regenBusy || submitBusy}
                title="This will reset checklist progress using the selected type template."
              >
                Change type + regenerate
              </button>
            ) : null}

            <button
              className="rounded-lg border px-3 py-2.5 sm:py-2 text-sm min-h-[44px] hover:bg-gray-50"
              onClick={resetForm}
              disabled={busy || regenBusy || submitBusy || (!dirty && !typeDirty)}
            >
              Reset
            </button>

            <button
              className="rounded-lg bg-emerald-700 px-3 py-2.5 sm:py-2 text-sm min-h-[44px] text-white hover:bg-emerald-800"
              onClick={save}
              disabled={busy || regenBusy || submitBusy || !dirty}
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Existing: Type regen confirm */}
      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  Regenerate checklist?
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  You’re changing the claim type from{' '}
                  <span className="font-semibold">{resetSummary.fromType}</span> to{' '}
                  <span className="font-semibold">{resetSummary.toType}</span>.
                </div>
              </div>
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border px-3 py-2 text-sm min-h-[44px] hover:bg-gray-50"
                disabled={regenBusy}
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-lg border bg-amber-50 p-3 text-sm text-amber-900">
              This will <span className="font-semibold">delete existing checklist items</span>{' '}
              and create a new template.
              {resetSummary.totalCount > 0 ? (
                <div className="mt-1">
                  Current progress:{' '}
                  <span className="font-semibold">
                    {resetSummary.doneCount}/{resetSummary.totalCount} done
                  </span>{' '}
                  (will be reset).
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border px-3 py-2.5 sm:py-2 text-sm min-h-[44px] hover:bg-gray-50"
                onClick={() => setConfirmOpen(false)}
                disabled={regenBusy}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-emerald-700 px-3 py-2.5 sm:py-2 text-sm min-h-[44px] text-white hover:bg-emerald-800"
                onClick={confirmTypeChangeAndRegenerate}
                disabled={regenBusy}
              >
                {regenBusy ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* NEW: Submit confirm */}
      {submitConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">Submit claim?</div>
                <div className="mt-1 text-sm text-gray-600">
                  You’re about to move this claim to{' '}
                  <span className="font-semibold">SUBMITTED</span>.
                </div>
              </div>
              <button
                onClick={() => setSubmitConfirmOpen(false)}
                className="rounded-lg border px-3 py-2 text-sm min-h-[44px] hover:bg-gray-50"
                disabled={submitBusy}
              >
                Close
              </button>
            </div>

            {submitBlockedCount > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-semibold">Cannot submit yet</div>
                <div className="mt-1 text-xs text-amber-800">
                  {submitBlockedCount} blocking requirement(s). Fix items marked with ⚠ in the checklist, then try again.
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border bg-gray-50 p-3 text-sm text-gray-700">
                <div className="font-semibold">Confirm submission</div>
                <div className="mt-1 text-xs text-gray-600">
                  Submission gating will run. If anything is missing, we’ll tell you what to fix.
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border px-3 py-2.5 sm:py-2 text-sm min-h-[44px] hover:bg-gray-50"
                onClick={() => setSubmitConfirmOpen(false)}
                disabled={submitBusy}
              >
                Cancel
              </button>
              <button
                className={[
                  'rounded-lg px-3 py-2.5 sm:py-2 text-sm min-h-[44px] text-white',
                  submitBlockedCount > 0
                    ? 'bg-emerald-200 cursor-not-allowed'
                    : 'bg-emerald-700 hover:bg-emerald-800',
                ].join(' ')}
                onClick={confirmSubmit}
                disabled={submitBusy || submitBlockedCount > 0}
              >
                {submitBusy ? 'Submitting…' : 'Confirm submit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
