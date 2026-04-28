import { cn } from "@/lib/utils";

/**
 * Summary data interface
 */
export interface StatusBoardSummary {
  good: number;
  monitor: number;
  actionNeeded: number;
  total: number;
}

/**
 * Props for KPIPills component
 */
export interface KPIPillsProps {
  /** Summary counts by condition */
  summary: StatusBoardSummary;
  /** Currently active condition filter */
  activeFilter: string;
  /** Callback when a pill is clicked */
  onFilterChange: (condition: string) => void;
}

/**
 * KPI Pills component displaying summary counts by condition.
 * 
 * Features:
 * - Compact inline pills (takes less vertical space than cards)
 * - Colored dot indicators matching condition colors
 * - Clickable to filter by condition
 * - Visual state indicates active filter
 * - Hover effects for interactivity
 * 
 * @example
 * <KPIPills
 *   summary={{ good: 9, monitor: 2, actionNeeded: 5, total: 18 }}
 *   activeFilter="ACTION_NEEDED"
 *   onFilterChange={(condition) => setConditionFilter(condition)}
 * />
 */
export function KPIPills({ summary, activeFilter, onFilterChange }: KPIPillsProps) {
  return (
    <nav className="mb-6 flex flex-wrap gap-3" aria-label="Filter by condition">
      {/* Good pill */}
      <button
        onClick={() => onFilterChange("GOOD")}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2",
          activeFilter === "GOOD" && "ring-2 ring-emerald-400 ring-offset-1"
        )}
        aria-pressed={activeFilter === "GOOD"}
        aria-label={`Filter by good condition, ${summary.good} items`}
      >
        <div className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true"></div>
        <span className="text-sm font-medium text-gray-700">{summary.good} Good</span>
      </button>

      {/* Monitor pill */}
      <button
        onClick={() => onFilterChange("MONITOR")}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2",
          activeFilter === "MONITOR" && "ring-2 ring-amber-400 ring-offset-1"
        )}
        aria-pressed={activeFilter === "MONITOR"}
        aria-label={`Filter by monitor condition, ${summary.monitor} items`}
      >
        <div className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true"></div>
        <span className="text-sm font-medium text-gray-700">{summary.monitor} Monitor</span>
      </button>

      {/* Action Needed pill */}
      <button
        onClick={() => onFilterChange("ACTION_NEEDED")}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2",
          activeFilter === "ACTION_NEEDED" && "ring-2 ring-rose-400 ring-offset-1"
        )}
        aria-pressed={activeFilter === "ACTION_NEEDED"}
        aria-label={`Filter by action needed condition, ${summary.actionNeeded} items`}
      >
        <div className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true"></div>
        <span className="text-sm font-medium text-gray-700">{summary.actionNeeded} Action Needed</span>
      </button>

      {/* Total pill (neutral, not clickable) */}
      <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm" aria-label={`Total: ${summary.total} items`}>
        <span className="text-sm text-gray-500">{summary.total} Total Items</span>
      </div>
    </nav>
  );
}
