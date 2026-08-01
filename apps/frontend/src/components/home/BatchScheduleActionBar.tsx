'use client';

import { useState } from 'react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

/**
 * Item #22 (Slice 8: "batch scheduling for low-risk routine work"). Fixed to
 * one action — bulk-accept the selected CANDIDATE/LOW_CONSEQUENCE items,
 * optionally with a shared due date applied to all of them — matching the
 * backend's batch-transition endpoint, which is not a generic
 * batch-transition-to-anything API. Eligibility (which rows even show a
 * checkbox to select) is decided by the caller (HomeOperationsTabs.tsx);
 * this component only acts on whatever ids it's handed. The server
 * re-enforces LOW_CONSEQUENCE/CANDIDATE eligibility per item regardless.
 */
export function BatchScheduleActionBar({
  propertyId,
  selectedIds,
  onClear,
  onComplete,
}: {
  propertyId: string;
  selectedIds: Set<string>;
  onClear: () => void;
  onComplete: () => Promise<unknown>;
}) {
  const [dueDate, setDueDate] = useState('');
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  if (selectedIds.size === 0) return null;

  const handleAccept = async () => {
    setPending(true);
    try {
      const res = await api.batchTransitionWorkItems(
        propertyId,
        [...selectedIds],
        dueDate ? new Date(dueDate).toISOString() : undefined,
      );
      if (!res.success || !res.data) throw new Error(res.message || 'Unable to batch-accept these items.');

      const results = res.data.results;
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.length - succeeded;
      if (failed === 0) {
        toast({ title: `Accepted ${succeeded} item${succeeded === 1 ? '' : 's'}` });
      } else {
        toast({
          title: `${succeeded} of ${results.length} accepted`,
          description: `${failed} item${failed === 1 ? '' : 's'} were no longer eligible and were skipped.`,
          variant: succeeded === 0 ? 'destructive' : undefined,
        });
      }
      setDueDate('');
      await onComplete();
    } catch (error) {
      toast({
        title: 'Unable to batch-accept these items',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 shadow-sm">
      <p className="text-sm font-semibold text-teal-900">
        {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'} selected
      </p>
      <div className="flex items-center gap-2">
        <label htmlFor="batch-due-date" className="text-sm text-teal-800">
          Schedule for
        </label>
        <Input
          id="batch-due-date"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          className="h-9 w-40 bg-white"
          disabled={pending}
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={pending}>
          Clear
        </Button>
        <Button type="button" size="sm" onClick={handleAccept} disabled={pending}>
          {pending ? 'Accepting…' : `Accept ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  );
}
