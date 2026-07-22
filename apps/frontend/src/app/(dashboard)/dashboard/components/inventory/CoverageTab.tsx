'use client';

import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import type { InventoryItem, InventoryRoom } from '@/types';
import { getInventoryItemIcon, resolveIcon } from '@/lib/icons';
import { centsToDollars, formatCurrency } from '@/lib/utils/format';

type CoverageTabProps = {
  items: InventoryItem[];
  rooms: InventoryRoom[];
  onOpenCoverage: (item: InventoryItem) => void;
  onOpenActions: (count: number) => void;
};

function getCoverageStatus(item: InventoryItem): 'missing' | 'incomplete' | 'confirmed' | 'excluded' {
  if (item.coverageState === 'NOT_REQUIRED' || item.coverageState === 'MANAGED_ELSEWHERE') return 'excluded';
  if (item.coverageState === 'CONFIRMED') return 'confirmed';
  if (item.coverageState === 'MISSING') return 'missing';
  if (item.coverageState === 'INCOMPLETE') return 'incomplete';
  if (item.coverageNotRequired) return 'excluded';

  const hasWarranty = Boolean(item.warrantyId);
  const hasInsurance = Boolean(item.insurancePolicyId);
  if (!hasWarranty && !hasInsurance) return 'incomplete';
  return 'confirmed';
}

export default function CoverageTab({ items, rooms, onOpenCoverage, onOpenActions }: CoverageTabProps) {
  const searchParams = useSearchParams();
  const valuedItems = useMemo(
    () => items.filter((item) => getCoverageStatus(item) !== 'excluded'
      && Number(centsToDollars(item.effectiveReplacementCostCents ?? item.replacementCostCents) || 0) > 0),
    [items],
  );

  const breakdown = useMemo(() => {
    let confirmedValue = 0;
    let incompleteValue = 0;
    let missingValue = 0;

    for (const item of valuedItems) {
      const value = Number(centsToDollars(item.effectiveReplacementCostCents ?? item.replacementCostCents) || 0);
      const status = getCoverageStatus(item);
      if (status === 'confirmed') confirmedValue += value;
      else if (status === 'incomplete') incompleteValue += value;
      else if (status === 'missing') missingValue += value;
    }

    const assessableTotal = confirmedValue + missingValue;
    const coveredPercent = assessableTotal > 0 ? (confirmedValue / assessableTotal) * 100 : 0;

    return {
      confirmedValue,
      incompleteValue,
      missingValue,
      total: confirmedValue + incompleteValue + missingValue,
      coveredPercent,
    };
  }, [valuedItems]);

  const coverageByRoom = useMemo(() => {
    const locations = [
      ...rooms.map((room) => ({ id: room.id, name: room.name, match: (item: InventoryItem) => item.roomId === room.id })),
      { id: 'whole-home', name: 'Whole home', match: (item: InventoryItem) => !item.roomId && item.recordGroup === 'SYSTEMS_STRUCTURE' },
    ];
    return locations.map((room) => {
      const locationItems = valuedItems.filter(room.match);
      const roomItems = locationItems
        .filter((item) => ['confirmed', 'missing'].includes(getCoverageStatus(item)));
      const totalValue = roomItems.reduce((sum, item) => sum + Number(centsToDollars(item.effectiveReplacementCostCents ?? item.replacementCostCents) || 0), 0);
      const coveredValue = roomItems.reduce((sum, item) => {
        const value = Number(centsToDollars(item.effectiveReplacementCostCents ?? item.replacementCostCents) || 0);
        const status = getCoverageStatus(item);
        if (status === 'confirmed') return sum + value;
        return sum;
      }, 0);

      return {
        id: room.id,
        name: room.name,
        coverageRate: totalValue > 0 ? Math.round((coveredValue / totalValue) * 100) : null,
        itemCount: locationItems.length,
      };
    }).filter((location) => location.itemCount > 0);
  }, [rooms, valuedItems]);

  const gapItems = useMemo(
    () => items.filter((item) => item.coverageState === 'MISSING' && item.coverageActionable === true),
    [items],
  );

  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (!highlightId) return;

    const timeoutId = window.setTimeout(() => {
      const element = document.querySelector(`[data-item-id="${highlightId}"]`);
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchParams]);

  const donutStyle = useMemo(() => {
    const total = Math.max(1, breakdown.total);
    const full = (breakdown.confirmedValue / total) * 100;
    const partial = (breakdown.incompleteValue / total) * 100;
    const uncovered = (breakdown.missingValue / total) * 100;
    return {
      background: `conic-gradient(#10b981 0% ${full}%, #f59e0b ${full}% ${full + partial}%, #ef4444 ${full + partial}% ${full + partial + uncovered}%)`,
    };
  }, [breakdown]);

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
                      room.coverageRate === null
                        ? 'text-amber-600'
                        : room.coverageRate === 100
                        ? 'text-emerald-600'
                        : room.coverageRate >= 50
                          ? 'text-amber-500'
                          : 'text-red-500'
                    }`}
                  >
                    {room.coverageRate === null ? 'Incomplete' : `${room.coverageRate}%`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      room.coverageRate === null
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
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
