'use client';

import React, { useState } from 'react';
import type { InventoryItem } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HIGH_VALUE_WAIVE_THRESHOLD, planBulkWaive } from './coverageBreakdown';

// One step instead of one card at a time: marks the filtered items that still need coverage details as not needing
// coverage. It confirms first, says how many and how much, and leaves high-value items for the one-at-a-time question.
export default function BulkCoverageBar({ items, onConfirm }: {
  items: InventoryItem[];
  // Resolves with how many were saved and how many failed; the parent reads the list again afterwards.
  onConfirm: (items: InventoryItem[]) => Promise<{ done: number; failed: number }>;
}) {
  const plan = planBulkWaive(items);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ done: number; failed: number } | null>(null);

  if (plan.eligible.length === 0 && !result) return null;

  async function confirm() {
    setBusy(true);
    try {
      setResult(await onConfirm(plan.eligible));
    } catch {
      setResult({ done: 0, failed: plan.eligible.length });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div data-bulk-coverage-bar className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
      {plan.eligible.length > 0 ? (
        <>
          <span>
            {plan.eligible.length} {plan.eligible.length === 1 ? 'item' : 'items'} shown still {plan.eligible.length === 1 ? 'needs' : 'need'} coverage details.
          </span>
          <button
            type="button"
            onClick={() => { setResult(null); setOpen(true); }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-100"
          >
            Mark all as not needed
          </button>
        </>
      ) : null}
      {result ? (
        <span role="status" className={result.failed ? 'text-red-700' : 'text-emerald-700'}>
          {result.failed === 0
            ? `Marked ${result.done} ${result.done === 1 ? 'item' : 'items'} as not needing coverage.`
            : `Marked ${result.done}, and ${result.failed} could not be saved. Nothing else was changed.`}
        </span>
      ) : null}

      <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {plan.eligible.length} {plan.eligible.length === 1 ? 'item' : 'items'} as not needing coverage?</DialogTitle>
            <DialogDescription>
              They total {formatCurrency(plan.eligibleValue)} and will be left out of your coverage percentage and the gaps list. You can restore any of them from the Coverage tab.
              {plan.heldBack.length > 0
                ? ` ${plan.heldBack.length} ${plan.heldBack.length === 1 ? 'item worth' : 'items worth'} ${formatCurrency(HIGH_VALUE_WAIVE_THRESHOLD)} or more ${plan.heldBack.length === 1 ? 'is' : 'are'} not included; review ${plan.heldBack.length === 1 ? 'it' : 'them'} one at a time.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Go back</button>
            <button type="button" disabled={busy} onClick={() => void confirm()} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800 disabled:opacity-50">
              {busy ? 'Saving…' : 'Confirm'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
