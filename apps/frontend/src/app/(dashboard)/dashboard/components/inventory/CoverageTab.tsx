'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, HelpCircle, MoreHorizontal } from 'lucide-react';
import type { InventoryItem, InventoryRoom } from '@/types';
import { getInventoryItemIcon, resolveIcon } from '@/lib/icons';
import { centsToDollars, formatCurrency } from '@/lib/utils/format';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { HIGH_VALUE_WAIVE_THRESHOLD, computeCoverageBreakdown, computeRoomCoverage, donutGradient, isCoverageWaived, itemValueUsd } from './coverageBreakdown';

type CoverageTabProps = {
  items: InventoryItem[];
  rooms: InventoryRoom[];
  onOpenCoverage: (item: InventoryItem) => void;
  onOpenActions: (count: number) => void;
  // Marks an item as not needing coverage, or restores it. Omitted where the page cannot save (the menu is then hidden).
  onSetCoverageNotRequired?: (item: InventoryItem, notRequired: boolean) => Promise<void>;
};

export default function CoverageTab({ items, rooms, onOpenCoverage, onOpenActions, onSetCoverageNotRequired }: CoverageTabProps) {
  const searchParams = useSearchParams();
  const breakdown = useMemo(() => computeCoverageBreakdown(items), [items]);
  const coverageByRoom = useMemo(() => computeRoomCoverage(items, rooms), [items, rooms]);

  const waivedItems = useMemo(() => items.filter(isCoverageWaived), [items]);
  const [waiveTarget, setWaiveTarget] = useState<InventoryItem | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function setNotRequired(item: InventoryItem, notRequired: boolean) {
    if (!onSetCoverageNotRequired) return;
    setSavingItemId(item.id);
    setActionError(null);
    try {
      await onSetCoverageNotRequired(item, notRequired);
    } catch {
      setActionError(notRequired ? 'Could not mark that item as not needing coverage. Nothing was changed.' : 'Could not restore that item. Nothing was changed.');
    } finally {
      setSavingItemId(null);
    }
  }
  // A high-value item asks first, as it does in the item drawer.
  function requestWaive(item: InventoryItem) {
    if (itemValueUsd(item) >= HIGH_VALUE_WAIVE_THRESHOLD) setWaiveTarget(item);
    else void setNotRequired(item, true);
  }

  const gapItems = useMemo(
    () => items.filter((item) => item.coverageState === 'MISSING' && item.coverageActionable === true),
    [items],
  );

  const incompleteItems = useMemo(
    () => items.filter((item) => item.coverageState === 'INCOMPLETE'),
    [items],
  );

  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    const focus = searchParams.get('focus');
    if (!highlightId && focus !== 'incomplete') return;

    const timeoutId = window.setTimeout(() => {
      const selector = highlightId
        ? `[data-item-id="${highlightId}"]`
        : '[data-coverage-section="incomplete"]';
      const element = document.querySelector(selector);
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchParams]);

  const donutStyle = useMemo(() => ({ background: donutGradient(breakdown) }), [breakdown]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">Portfolio Coverage Breakdown</h3>

          <div className="flex items-center gap-6">
            <div className="relative h-32 w-32 flex-shrink-0">
              <div className="h-full w-full rounded-full" style={donutStyle} />
              <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white">
                <span className="text-sm font-semibold text-gray-700">{Math.round(breakdown.coveredPercent)}%</span>
                <span className="text-[11px] text-gray-400">covered</span>
              </div>
            </div>

            <div className="space-y-2.5">
              {[
                { label: 'Coverage confirmed', value: breakdown.confirmedValue, dot: 'bg-emerald-500', textColor: 'text-emerald-700' },
                { label: 'Information incomplete', value: breakdown.incompleteValue, dot: 'bg-amber-400', textColor: 'text-amber-700' },
                { label: 'Coverage missing', value: breakdown.missingValue, dot: 'bg-red-400', textColor: 'text-red-700' },
                ...(breakdown.waivedValue > 0 ? [{ label: 'Coverage waived', value: breakdown.waivedValue, dot: 'bg-gray-400', textColor: 'text-gray-600' }] : []),
              ].map((entry) => (
                <div key={entry.label} className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${entry.dot}`} />
                  <span className="flex-1 text-xs text-gray-600">{entry.label}</span>
                  <span className={`text-xs font-bold ${entry.textColor}`}>{formatCurrency(entry.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">Coverage by Room</h3>
          <div className="space-y-3">
            {coverageByRoom.map((room) => (
              <div key={room.id}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">{room.name}</span>
                  <span
                    className={`font-bold ${
                      room.allWaived
                        ? 'text-gray-400'
                        : room.coverageRate === null
                        ? 'text-amber-600'
                        : room.coverageRate === 100
                        ? 'text-emerald-600'
                        : room.coverageRate >= 50
                          ? 'text-amber-500'
                          : 'text-red-500'
                    }`}
                  >
                    {room.allWaived ? '—' : room.coverageRate === null ? 'Incomplete' : `${room.coverageRate}%`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      room.allWaived
                        ? 'bg-gray-300'
                        : room.coverageRate === null
                        ? 'bg-amber-300'
                        : room.coverageRate === 100
                        ? 'bg-emerald-500'
                        : room.coverageRate >= 50
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                    }`}
                    style={{ width: `${room.coverageRate ?? 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {incompleteItems.length > 0 ? (
        <div
          data-coverage-section="incomplete"
          className="rounded-xl border border-amber-200 bg-amber-50/40 p-5"
        >
          <div className="mb-1 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-800">
              Coverage information incomplete ({incompleteItems.length})
            </h3>
          </div>
          <p className="mb-4 text-xs leading-5 text-amber-800/80">
            Confirm the item, responsibility, lifecycle details, and any existing policy or warranty before we identify a coverage gap.
          </p>

          <div className="space-y-2">
            {incompleteItems.map((item) => {
              const Icon = resolveIcon(
                getInventoryItemIcon({
                  name: item.name,
                  type: (item as any).type ?? (item as any).itemType,
                  category: item.category,
                  subtype: (item as any).subtype,
                  kind: (item as any).kind,
                  label: (item as any).label ?? (item as any).displayName,
                  applianceType: (item as any).applianceType,
                  sourceHash: item.sourceHash,
                }),
                HelpCircle,
              );
              const location = item.room?.name
                || item.locationLabel
                || (item.recordGroup === 'SYSTEMS_STRUCTURE' ? 'Whole home' : 'Room needed');

              return (
                <div
                  key={item.id}
                  data-item-id={item.id}
                  className="flex flex-col gap-2 border-b border-amber-100 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-sm font-medium text-gray-800">{item.displayName || item.name}</span>
                    <span className="text-[11px] text-gray-500">{location}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenCoverage(item)}
                    className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-700"
                  >
                    Review information
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {gapItems.length > 0 ? (
        <div className="rounded-xl border border-red-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <h3 className="text-sm font-semibold text-red-700">Items needing coverage ({gapItems.length})</h3>
            </div>

            <button
              type="button"
              onClick={() => onOpenActions(gapItems.length)}
              className="text-xs text-teal-600 transition-colors hover:underline"
            >
              {'View in Actions ->'}
            </button>
          </div>

          <div className="space-y-2">
            {gapItems.map((item) => {
              const Icon = resolveIcon(
                getInventoryItemIcon({
                  name: item.name,
                  type: (item as any).type ?? (item as any).itemType,
                  category: item.category,
                  subtype: (item as any).subtype,
                  kind: (item as any).kind,
                  label: (item as any).label ?? (item as any).displayName,
                  applianceType: (item as any).applianceType,
                  sourceHash: item.sourceHash,
                }),
                HelpCircle,
              );
              const replacementValue = centsToDollars(item.effectiveReplacementCostCents ?? item.replacementCostCents);
              const isHighlighted = searchParams.get('highlight') === item.id;

              return (
                <div
                  key={item.id}
                  data-item-id={item.id}
                  className={`flex flex-col gap-2 border-b border-gray-100 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between ${
                    isHighlighted ? 'rounded-lg border-yellow-200 bg-yellow-50 px-3 -mx-3' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-sm text-gray-700">{item.displayName || item.name}</span>
                    <span className="text-[11px] text-gray-400">{item.room?.name || item.locationLabel || 'Room needed'}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-800">{formatCurrency(replacementValue)}</span>
                    <button
                      type="button"
                      onClick={() => onOpenCoverage(item)}
                      className="rounded-lg bg-teal-600 px-3 py-1 text-xs text-white transition-colors hover:bg-teal-700"
                    >
                      Review coverage
                    </button>
                    {onSetCoverageNotRequired ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`More options for ${item.displayName || item.name}`}
                            disabled={savingItemId === item.id}
                            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => onOpenCoverage(item)}>Get coverage</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => requestWaive(item)}>Mark as not needed</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {actionError ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</p> : null}

      {waivedItems.length > 0 ? (
        <details data-coverage-section="waived" className="rounded-xl border border-gray-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700">
            Coverage not required ({waivedItems.length} {waivedItems.length === 1 ? 'item' : 'items'})
          </summary>
          <p className="mt-2 text-xs leading-5 text-gray-500">These items are left out of your coverage percentage and the list above.</p>
          <div className="mt-3 space-y-2">
            {waivedItems.map((item) => (
              <div key={item.id} data-item-id={item.id} className="flex flex-col gap-2 border-b border-gray-100 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">{item.displayName || item.name}</span>
                  <span className="text-[11px] text-gray-400">{item.room?.name || item.locationLabel || 'Room needed'}</span>
                </div>
                <div className="flex items-center gap-3">
                  {itemValueUsd(item) > 0 ? <span className="text-sm font-semibold text-gray-600">{formatCurrency(itemValueUsd(item))}</span> : null}
                  {onSetCoverageNotRequired ? (
                    <button
                      type="button"
                      onClick={() => void setNotRequired(item, false)}
                      disabled={savingItemId === item.id}
                      className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Restore
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <Dialog open={Boolean(waiveTarget)} onOpenChange={(open) => { if (!open) setWaiveTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip coverage for this item?</DialogTitle>
            <DialogDescription>
              {waiveTarget ? `${waiveTarget.displayName || waiveTarget.name} is valued at ${formatCurrency(itemValueUsd(waiveTarget))}. Are you sure you don't need coverage?` : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" onClick={() => setWaiveTarget(null)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Go back</button>
            <button
              type="button"
              onClick={() => { const target = waiveTarget; setWaiveTarget(null); if (target) void setNotRequired(target, true); }}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800"
            >
              Confirm
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
