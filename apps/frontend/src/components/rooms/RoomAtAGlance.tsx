'use client';

import React, { useMemo } from 'react';

type RoomAtAGlanceProps = {
  itemCount: number;
  gapCount: number;
  docCount: number;
  valueCount: number;
  onEditProfile: () => void;
  onManageItems: () => void;
};

export default function RoomAtAGlance({
  itemCount,
  gapCount,
  docCount,
  valueCount,
  onEditProfile,
  onManageItems,
}: RoomAtAGlanceProps) {
  const completenessPercent = useMemo(() => {
    const hasItems = itemCount > 0;
    const hasDocuments = docCount > 0;
    const hasValues = valueCount > 0;

    const score = (hasItems ? 33 : 0) + (hasDocuments ? 33 : 0) + (hasValues ? 34 : 0);
    return Math.max(0, Math.min(100, score));
  }, [docCount, itemCount, valueCount]);

  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">At a glance</h3>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          {
            label: 'Gaps',
            value: gapCount,
            color: gapCount > 0 ? 'text-red-600' : 'text-emerald-600',
          },
          {
            label: 'Docs',
            value: docCount,
            color: docCount === 0 ? 'text-amber-500' : 'text-emerald-600',
          },
          {
            label: 'Items',
            value: itemCount,
            color: 'text-gray-800',
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg bg-gray-50 p-2.5 text-center">
            <p className={`text-xl font-display font-bold ${stat.color}`}>{stat.value}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-gray-500">Room completeness</span>
          <span className="font-semibold text-gray-700">{completenessPercent}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-teal-500 transition-all duration-700"
            style={{ width: `${completenessPercent}%` }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onEditProfile}
        className="mb-2 w-full rounded-lg border border-gray-200 py-2 text-center text-sm text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900"
      >
        Edit profile + checklist
      </button>
      <button
        type="button"
        onClick={onManageItems}
        className="w-full rounded-lg bg-teal-600 py-2 text-center text-sm text-white transition-colors hover:bg-teal-700"
      >
        Add / manage items
      </button>
    </aside>
  );
}
