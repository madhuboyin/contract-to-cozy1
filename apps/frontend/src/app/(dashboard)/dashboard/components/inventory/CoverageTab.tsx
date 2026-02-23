'use client';

import React, { useMemo } from 'react';
import { AlertTriangle, Monitor, Package, Shield, Wrench, Zap } from 'lucide-react';
import type { InventoryItem, InventoryRoom } from '@/types';
import { centsToDollars, formatCurrency } from '@/lib/utils/format';

type CoverageTabProps = {
  items: InventoryItem[];
  rooms: InventoryRoom[];
  onOpenCoverage: (item: InventoryItem) => void;
  onOpenActions: () => void;
};

function getCoverageStatus(item: InventoryItem): 'uncovered' | 'partial' | 'covered' {
  const hasWarranty = Boolean(item.warrantyId);
  const hasInsurance = Boolean(item.insurancePolicyId);
  if (!hasWarranty && !hasInsurance) return 'uncovered';
  if (!hasWarranty || !hasInsurance) return 'partial';
  return 'covered';
}

function categoryIcon(category?: string) {
  const normalized = String(category || '').toUpperCase();
  if (normalized === 'APPLIANCE') return Wrench;
  if (normalized === 'ELECTRONICS') return Monitor;
  if (normalized === 'SAFETY') return Shield;
  if (normalized === 'ELECTRICAL') return Zap;
  return Package;
}

export default function CoverageTab({ items, rooms, onOpenCoverage, onOpenActions }: CoverageTabProps) {
  const valuedItems = useMemo(
    () => items.filter((item) => Number(centsToDollars(item.replacementCostCents) || 0) > 0),
    [items],
  );

  const breakdown = useMemo(() => {
    let fullyCoveredValue = 0;
    let partiallyCoveredValue = 0;
    let uncoveredValue = 0;

    for (const item of valuedItems) {
      const value = Number(centsToDollars(item.replacementCostCents) || 0);
      const status = getCoverageStatus(item);
      if (status === 'covered') fullyCoveredValue += value;
      else if (status === 'partial') partiallyCoveredValue += value;
      else uncoveredValue += value;
    }

    const total = fullyCoveredValue + partiallyCoveredValue + uncoveredValue;
    const coveredPercent = total > 0 ? ((fullyCoveredValue + partiallyCoveredValue * 0.65) / total) * 100 : 0;

    return {
      fullyCoveredValue,
      partiallyCoveredValue,
      uncoveredValue,
      total,
      coveredPercent,
    };
  }, [valuedItems]);

  const coverageByRoom = useMemo(() => {
    return rooms.map((room) => {
      const roomItems = valuedItems.filter((item) => item.roomId === room.id);
      const totalValue = roomItems.reduce((sum, item) => sum + Number(centsToDollars(item.replacementCostCents) || 0), 0);
      const coveredValue = roomItems.reduce((sum, item) => {
        const value = Number(centsToDollars(item.replacementCostCents) || 0);
        const status = getCoverageStatus(item);
        if (status === 'covered') return sum + value;
        if (status === 'partial') return sum + value * 0.65;
        return sum;
      }, 0);

      return {
        id: room.id,
        name: room.name,
        coverageRate: totalValue > 0 ? Math.round((coveredValue / totalValue) * 100) : 0,
      };
    });
  }, [rooms, valuedItems]);

  const gapItems = useMemo(
    () => items.filter((item) => getCoverageStatus(item) !== 'covered'),
    [items],
  );

  const donutStyle = useMemo(() => {
    const total = Math.max(1, breakdown.total);
    const full = (breakdown.fullyCoveredValue / total) * 100;
    const partial = (breakdown.partiallyCoveredValue / total) * 100;
    const uncovered = (breakdown.uncoveredValue / total) * 100;
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
                <span className="text-[10px] text-gray-400">covered</span>
              </div>
            </div>

            <div className="space-y-2.5">
              {[
                { label: 'Fully covered', value: breakdown.fullyCoveredValue, dot: 'bg-emerald-500', textColor: 'text-emerald-700' },
                { label: 'Partially covered', value: breakdown.partiallyCoveredValue, dot: 'bg-amber-400', textColor: 'text-amber-700' },
                { label: 'Uncovered', value: breakdown.uncoveredValue, dot: 'bg-red-400', textColor: 'text-red-700' },
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
                      room.coverageRate === 100
                        ? 'text-emerald-600'
                        : room.coverageRate >= 50
                          ? 'text-amber-500'
                          : 'text-red-500'
                    }`}
                  >
                    {room.coverageRate}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      room.coverageRate === 100
                        ? 'bg-emerald-500'
                        : room.coverageRate >= 50
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                    }`}
                    style={{ width: `${room.coverageRate}%` }}
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

            <button type="button" onClick={onOpenActions} className="text-xs text-teal-600 transition-colors hover:underline">
              {'View in Actions ->'}
            </button>
          </div>

          <div className="space-y-2">
            {gapItems.map((item) => {
              const Icon = categoryIcon(item.category);
              const replacementValue = centsToDollars(item.replacementCostCents);

              return (
                <div key={item.id} className="flex flex-col gap-2 border-b border-gray-100 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-sm text-gray-700">{item.name}</span>
                    <span className="text-[10px] text-gray-400">{item.room?.name || 'Unassigned'}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-800">{formatCurrency(replacementValue)}</span>
                    <button
                      type="button"
                      onClick={() => onOpenCoverage(item)}
                      className="rounded-lg bg-teal-600 px-3 py-1 text-xs text-white transition-colors hover:bg-teal-700"
                    >
                      Get coverage
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
