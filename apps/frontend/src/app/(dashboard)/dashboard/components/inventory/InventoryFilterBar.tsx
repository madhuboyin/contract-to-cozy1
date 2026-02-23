'use client';

import React from 'react';
import { Search, X } from 'lucide-react';
import type { InventoryItemCategory, InventoryRoom } from '@/types';

type SmartFilterId = 'gaps' | 'no-value' | 'recalls';

const CATEGORY_OPTIONS: Array<{ value: InventoryItemCategory | null; label: string }> = [
  { value: null, label: 'All categories' },
  { value: 'APPLIANCE', label: 'Appliance' },
  { value: 'HVAC', label: 'HVAC' },
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'ROOF_EXTERIOR', label: 'Roof/Exterior' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'SMART_HOME', label: 'Smart Home' },
  { value: 'FURNITURE', label: 'Furniture' },
  { value: 'ELECTRONICS', label: 'Electronics' },
  { value: 'OTHER', label: 'Other' },
];

type InventoryFilterBarProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  roomFilter: string | null;
  onRoomFilterChange: (value: string | null) => void;
  categoryFilter: InventoryItemCategory | null;
  onCategoryFilterChange: (value: InventoryItemCategory | null) => void;
  docsFilter: 'any' | 'with-docs' | 'no-docs';
  onDocsFilterChange: (value: 'any' | 'with-docs' | 'no-docs') => void;
  recallFilter: 'any' | 'with-recalls' | 'no-recalls';
  onRecallFilterChange: (value: 'any' | 'with-recalls' | 'no-recalls') => void;
  activeSmartFilter: SmartFilterId | null;
  onToggleSmartFilter: (value: SmartFilterId) => void;
  rooms: InventoryRoom[];
  gapCount: number;
  missingValueCount: number;
  recallCount: number;
  activeFilterCount: number;
  onClearAllFilters: () => void;
};

function FilterDropdown(props: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
}) {
  return (
    <select
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      aria-label={props.ariaLabel}
      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-teal-400 focus:ring-1 focus:ring-teal-300"
    >
      {props.options.map((option) => (
        <option key={`${props.ariaLabel}-${option.value}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export default function InventoryFilterBar({
  searchQuery,
  onSearchQueryChange,
  roomFilter,
  onRoomFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  docsFilter,
  onDocsFilterChange,
  recallFilter,
  onRecallFilterChange,
  activeSmartFilter,
  onToggleSmartFilter,
  rooms,
  gapCount,
  missingValueCount,
  recallCount,
  activeFilterCount,
  onClearAllFilters,
}: InventoryFilterBarProps) {
  const smartFilters = [
    gapCount > 0
      ? {
          id: 'gaps' as const,
          label: `${gapCount} coverage gap${gapCount !== 1 ? 's' : ''}`,
          color: 'bg-red-100 border-red-200 text-red-700',
          activeColor: 'bg-red-200 border-red-300 text-red-800',
        }
      : null,
    missingValueCount > 0
      ? {
          id: 'no-value' as const,
          label: `${missingValueCount} missing value${missingValueCount !== 1 ? 's' : ''}`,
          color: 'bg-amber-100 border-amber-200 text-amber-700',
          activeColor: 'bg-amber-200 border-amber-300 text-amber-800',
        }
      : null,
    recallCount > 0
      ? {
          id: 'recalls' as const,
          label: `${recallCount} safety recall${recallCount !== 1 ? 's' : ''}`,
          color: 'bg-orange-100 border-orange-200 text-orange-700',
          activeColor: 'bg-orange-200 border-orange-300 text-orange-800',
        }
      : null,
  ].filter(Boolean) as Array<{
    id: SmartFilterId;
    label: string;
    color: string;
    activeColor: string;
  }>;

  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-black/5 bg-white/80 p-3 backdrop-blur-sm">
      <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, brand, model, serial..."
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm outline-none transition-colors focus:border-teal-400 focus:ring-1 focus:ring-teal-300"
          />

          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
          <FilterDropdown
            value={roomFilter ?? 'all'}
            onChange={(value) => onRoomFilterChange(value === 'all' ? null : value)}
            options={[{ value: 'all', label: 'All Rooms' }, ...rooms.map((room) => ({ value: room.id, label: room.name }))]}
            ariaLabel="Room filter"
          />

          <FilterDropdown
            value={categoryFilter ?? 'all'}
            onChange={(value) => onCategoryFilterChange(value === 'all' ? null : (value as InventoryItemCategory))}
            options={CATEGORY_OPTIONS.map((option) => ({ value: option.value ?? 'all', label: option.label }))}
            ariaLabel="Category filter"
          />

          <FilterDropdown
            value={docsFilter}
            onChange={(value) => onDocsFilterChange(value as 'any' | 'with-docs' | 'no-docs')}
            options={[
              { value: 'any', label: 'Docs: Any' },
              { value: 'with-docs', label: 'Docs: With docs' },
              { value: 'no-docs', label: 'Docs: No docs' },
            ]}
            ariaLabel="Docs filter"
          />

          <FilterDropdown
            value={recallFilter}
            onChange={(value) => onRecallFilterChange(value as 'any' | 'with-recalls' | 'no-recalls')}
            options={[
              { value: 'any', label: 'Recalls: Any' },
              { value: 'with-recalls', label: 'Recalls: Has recalls' },
              { value: 'no-recalls', label: 'Recalls: No recalls' },
            ]}
            ariaLabel="Recall filter"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {smartFilters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => onToggleSmartFilter(filter.id)}
            className={[
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              activeSmartFilter === filter.id ? filter.activeColor : filter.color,
            ].join(' ')}
          >
            <span>{filter.label}</span>
            {activeSmartFilter === filter.id ? <X className="h-3 w-3" /> : null}
          </button>
        ))}

        {smartFilters.length > 0 ? <div className="h-4 w-px bg-gray-200" /> : null}

        <button
          type="button"
          onClick={() => onRoomFilterChange(null)}
          className={[
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            roomFilter === null
              ? 'border-teal-600 bg-teal-600 text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
          ].join(' ')}
        >
          All
        </button>

        {rooms.map((room) => (
          <button
            key={room.id}
            type="button"
            onClick={() => onRoomFilterChange(room.id)}
            className={[
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              roomFilter === room.id
                ? 'border-teal-600 bg-teal-600 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
            ].join(' ')}
          >
            {room.name}
          </button>
        ))}

        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={onClearAllFilters}
            className="ml-auto flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-gray-600"
          >
            <X className="h-3 w-3" />
            Clear all ({activeFilterCount})
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type { SmartFilterId };
