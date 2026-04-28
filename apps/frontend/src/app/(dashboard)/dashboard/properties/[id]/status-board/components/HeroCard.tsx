import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { StatusBoardItemDTO } from "../statusBoardApi";

/**
 * Props for HeroCard component
 */
export interface HeroCardProps {
  /** Priority item requiring immediate attention, or null if none */
  priorityItem: StatusBoardItemDTO | null;
  /** Count of items needing install dates for accurate predictions */
  pendingInstallDateCount: number;
  /** Callback when action button is clicked */
  onAction: () => void;
}

/**
 * Hero card component that displays the highest priority action or status message.
 * 
 * Displays one of three states:
 * 1. Priority action (urgent item needing attention) - Rose/Orange gradient
 * 2. Pending install dates (items need dates for predictions) - Rose/Orange gradient
 * 3. All stable (no urgent actions) - Emerald/Teal gradient
 * 
 * @example
 * <HeroCard
 *   priorityItem={priorityActionItem}
 *   pendingInstallDateCount={5}
 *   onAction={handlePriorityAction}
 * />
 */
export function HeroCard({ priorityItem, pendingInstallDateCount, onAction }: HeroCardProps) {
  // State 3: All stable (no priority item, no pending install dates)
  if (!priorityItem && pendingInstallDateCount === 0) {
    return (
      <section className="mb-8 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-white shadow-xl" aria-labelledby="hero-title">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-medium">All Stable</span>
        </div>
        <h2 id="hero-title" className="text-3xl font-bold">No urgent actions detected</h2>
        <p className="mt-2 text-lg text-white/90">
          Everything is currently in a stable window. Review monitor items for preventative upkeep.
        </p>
      </section>
    );
  }

  // State 1 & 2: Priority action or pending install dates (urgent gradient)
  const title = priorityItem
    ? `${formatDisplayName(priorityItem.displayName)} needs attention`
    : "Add missing install dates to improve confidence";

  const description = priorityItem
    ? "Focus this item first to reduce near-term risk and keep cascading replacement costs contained."
    : `${pendingInstallDateCount} item${pendingInstallDateCount === 1 ? "" : "s"} still need install dates for stronger lifecycle predictions.`;

  const actionLabel = priorityItem
    ? `Review ${formatDisplayName(priorityItem.displayName)}`
    : "Add Install Dates";

  return (
    <section
      className="mb-8 rounded-3xl bg-gradient-to-br from-rose-500 to-orange-600 p-8 text-white shadow-xl"
      aria-labelledby="hero-title"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-sm font-medium backdrop-blur-sm">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Priority Action
          </div>
          <h2 id="hero-title" className="mt-4 text-3xl font-bold">{title}</h2>
          <p className="mt-2 text-lg text-white/90">{description}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={onAction}
              className="rounded-xl bg-white px-6 py-3 font-semibold text-rose-600 shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-rose-600"
              aria-label={actionLabel}
            >
              {actionLabel}
            </button>
          </div>
        </div>
        {priorityItem && (
          <div className="ml-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm" aria-label={`Item age: ${Math.round(priorityItem.ageYears || 0)} years`}>
            <span className="text-4xl font-bold">{Math.round(priorityItem.ageYears || 0)}</span>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Format display name helper (copied from parent component)
 * TODO: Extract to shared utils
 */
function formatDisplayName(raw: string): string {
  if (!raw) return raw;
  if (raw !== raw.toUpperCase()) return raw;
  
  const ASSET_NAME_MAP: Record<string, string> = {
    "HVAC FURNACE": "HVAC Furnace",
    "HVAC AC": "HVAC Air Conditioner",
    "HVAC HEAT PUMP": "HVAC Heat Pump",
    "WATER HEATER TANK": "Water Heater (Tank)",
    "WATER HEATER TANKLESS": "Water Heater (Tankless)",
    "SAFETY SMOKE CO DETECTORS": "Smoke & CO Detectors",
    "ELECTRICAL PANEL": "Electrical Panel",
    "SUMP PUMP": "Sump Pump",
    "WATER SOFTENER": "Water Softener",
  };
  
  const mapped = ASSET_NAME_MAP[raw.trim()];
  if (mapped) return mapped;
  
  return raw
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
