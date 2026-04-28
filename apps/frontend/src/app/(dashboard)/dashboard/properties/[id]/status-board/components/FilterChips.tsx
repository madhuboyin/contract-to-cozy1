import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Active filter interface
 */
export interface ActiveFilter {
  /** Unique key for the filter */
  key: string;
  /** Display label */
  label: string;
  /** Filter type (condition or category) */
  type: "condition" | "category";
  /** Filter value */
  value: string;
}

/**
 * Props for FilterChips component
 */
export interface FilterChipsProps {
  /** Array of active filters */
  activeFilters: ActiveFilter[];
  /** Callback when a filter is removed */
  onRemoveFilter: (key: string) => void;
}

/**
 * Filter chips component displaying active filters with remove buttons.
 * 
 * Features:
 * - Shows active filters as removable chips
 * - Color coding: condition colors for condition filters, neutral for category
 * - X button to remove each filter
 * - Hidden when no filters are active
 * - Horizontal wrap layout for multiple filters
 * 
 * @example
 * <FilterChips
 *   activeFilters={[
 *     { key: "condition", label: "Action Needed", type: "condition", value: "ACTION_NEEDED" },
 *     { key: "category", label: "Appliances", type: "category", value: "APPLIANCE" }
 *   ]}
 *   onRemoveFilter={(key) => handleRemoveFilter(key)}
 * />
 */
export function FilterChips({ activeFilters, onRemoveFilter }: FilterChipsProps) {
  // Hide component when no filters are active
  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {activeFilters.map((filter) => (
        <div
          key={filter.key}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium",
            // Condition filters: use condition-specific colors
            filter.type === "condition" && filter.value === "ACTION_NEEDED" && "bg-rose-100 text-rose-700",
            filter.type === "condition" && filter.value === "MONITOR" && "bg-amber-100 text-amber-700",
            filter.type === "condition" && filter.value === "GOOD" && "bg-emerald-100 text-emerald-700",
            // Category filters: use neutral gray
            filter.type === "category" && "bg-gray-100 text-gray-700"
          )}
        >
          {filter.label}
          <button
            onClick={() => onRemoveFilter(filter.key)}
            className="hover:bg-black/10 rounded-full p-0.5 transition-colors"
            aria-label={`Remove ${filter.label} filter`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
