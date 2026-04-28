import { type ElementType } from "react";
import { AlertTriangle, Pin, Wrench, Home, Cpu, Shield, Building, Box } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusBoardItemDTO, StatusBoardCondition, WarrantyBadge, PatchStatusPayload } from "../statusBoardApi";
import { Badge } from "@/components/ui/badge";

/**
 * Props for StatusCard component
 */
export interface StatusCardProps {
  /** Status board item data */
  item: StatusBoardItemDTO;
  /** Whether this card is currently expanded */
  isExpanded: boolean;
  /** Callback to toggle card expansion */
  onToggleExpand: () => void;
  /** Callback to toggle pin status */
  onTogglePin: () => void;
  /** Callback to toggle hide status */
  onToggleHide: () => void;
  /** Callback to view item details */
  onViewItem: () => void;
  /** Callback to save status override */
  onSaveOverride: (payload: PatchStatusPayload) => void;
}

/**
 * Condition labels mapping
 */
const CONDITION_LABELS: Record<StatusBoardCondition, string> = {
  GOOD: "Good",
  MONITOR: "Monitor",
  ACTION_NEEDED: "Action needed",
};

/**
 * Warranty labels mapping
 */
const WARRANTY_LABELS: Record<WarrantyBadge, string> = {
  active: "Active",
  expiring_soon: "Expiring",
  expired: "Expired",
  none: "None",
};

/**
 * Status card component displaying a single maintenance item.
 * 
 * Features:
 * - Colored left border indicating condition status
 * - Category icon and item name
 * - Key metrics (age, warranty)
 * - Condition badge with icon
 * - Primary action button
 * - Pin indicator for pinned items
 * - Hover effects (elevation, translation)
 * 
 * @example
 * <StatusCard
 *   item={item}
 *   isExpanded={expandedId === item.id}
 *   onToggleExpand={() => setExpandedId(item.id)}
 *   onTogglePin={() => handleTogglePin(item)}
 *   onToggleHide={() => handleToggleHide(item)}
 *   onViewItem={() => handleViewItem(item)}
 *   onSaveOverride={(payload) => handleSaveOverride(item.id, payload)}
 * />
 */
export function StatusCard({
  item,
  isExpanded,
  onToggleExpand,
  onTogglePin,
  onViewItem,
}: StatusCardProps) {
  const categoryVisual = getCategoryVisual(item.category);
  const CategoryIcon = categoryVisual.Icon;
  const primaryActionLabel = getPrimaryActionLabel(item);

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6",
        "shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-1 cursor-pointer",
        "focus-within:outline-none focus-within:ring-2 focus-within:ring-teal-500 focus-within:ring-offset-2"
      )}
      onClick={onToggleExpand}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleExpand();
        }
      }}
      tabIndex={0}
      role="button"
      aria-expanded={isExpanded}
      aria-label={`${formatDisplayName(item.displayName)} - ${CONDITION_LABELS[item.condition]} condition. Press Enter to ${isExpanded ? "collapse" : "expand"} details.`}
    >
      {/* Status indicator - left border */}
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-1",
          item.condition === "ACTION_NEEDED"
            ? "bg-rose-500"
            : item.condition === "MONITOR"
            ? "bg-amber-500"
            : "bg-emerald-500"
        )}
      />

      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
            <CategoryIcon className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{formatDisplayName(item.displayName)}</h3>
            <p className="text-sm text-gray-500">{humanizeActionType(item.category)}</p>
          </div>
        </div>
        {item.isPinned && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className="text-amber-500 hover:text-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 rounded p-1"
            aria-label={`Unpin ${formatDisplayName(item.displayName)}`}
          >
            <Pin className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Key metrics */}
      <div className="mb-4 flex items-center gap-4 text-sm">
        <div>
          <span className="text-gray-500">Age:</span>
          <span className="ml-1 font-medium text-gray-900">{formatAgeDisplay(item.ageYears)}</span>
        </div>
        <div>
          <span className="text-gray-500">Warranty:</span>
          <span className="ml-1 font-medium text-gray-900">{WARRANTY_LABELS[item.warrantyStatus]}</span>
        </div>
      </div>

      {/* Status badge */}
      <div className="mb-4">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
            item.condition === "ACTION_NEEDED"
              ? "bg-rose-100 text-rose-700"
              : item.condition === "MONITOR"
              ? "bg-amber-100 text-amber-700"
              : "bg-emerald-100 text-emerald-700"
          )}
        >
          {item.condition === "ACTION_NEEDED" && <AlertTriangle className="h-3.5 w-3.5" />}
          {CONDITION_LABELS[item.condition]}
        </span>
      </div>

      {/* Action */}
      <button
        className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        onClick={(e) => {
          e.stopPropagation();
          onViewItem();
        }}
        aria-label={`${primaryActionLabel || "View details"} for ${formatDisplayName(item.displayName)}`}
      >
        {primaryActionLabel || "View Details"}
      </button>
    </article>
  );
}

/**
 * Get category visual (icon and tone class)
 */
function getCategoryVisual(category: string): { Icon: ElementType; toneClass: string } {
  switch (category) {
    case "APPLIANCE":
      return { Icon: Wrench, toneClass: "from-cyan-50 to-sky-100 text-sky-700" };
    case "FURNITURE":
      return { Icon: Home, toneClass: "from-indigo-50 to-violet-100 text-indigo-700" };
    case "ELECTRONICS":
      return { Icon: Cpu, toneClass: "from-purple-50 to-fuchsia-100 text-purple-700" };
    case "SAFETY":
      return { Icon: Shield, toneClass: "from-red-50 to-orange-100 text-red-700" };
    case "STRUCTURE":
      return { Icon: Building, toneClass: "from-amber-50 to-yellow-100 text-amber-700" };
    case "SYSTEMS":
      return { Icon: Wrench, toneClass: "from-teal-50 to-emerald-100 text-teal-700" };
    default:
      return { Icon: Box, toneClass: "from-slate-50 to-slate-100 text-slate-700" };
  }
}

/**
 * Get primary action label for item
 */
function getPrimaryActionLabel(item: StatusBoardItemDTO): string | null {
  if (item.recommendation === "REPLACE_SOON" && item.deepLinks.replaceRepair) return "Replace or Repair";
  if (item.deepLinks.maintenance && item.pendingMaintenance > 0) return "Open Maintenance";
  if (item.inventoryItemId) return "View Item";
  if (item.deepLinks.viewRoom) return "View Room";
  return null;
}

/**
 * Format display name helper
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

/**
 * Format age display helper
 */
function formatAgeDisplay(ageYears: number | null): string {
  if (ageYears == null) return "—";
  if (ageYears < 1) return "<1 yr";
  return `${Math.round(ageYears)} yrs`;
}

/**
 * Humanize action type helper
 */
function humanizeActionType(category: string): string {
  return category
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
