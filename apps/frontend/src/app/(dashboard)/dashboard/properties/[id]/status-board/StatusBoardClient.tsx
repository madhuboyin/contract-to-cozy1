"use client";

import { Fragment, useState, useMemo, type ElementType } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getStatusBoard,
  recomputeStatuses,
  patchItemStatus,
  StatusBoardItemDTO,
  StatusBoardCondition,
  StatusBoardRecommendation,
  ListBoardParams,
  PatchStatusPayload,
  WarrantyBadge,
} from "./statusBoardApi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Pin,
  EyeOff,
  Eye,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  ExternalLink,
  Shield,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Home,
  Cpu,
  Building,
  Box,
} from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import InventoryItemDrawer from '../../../components/inventory/InventoryItemDrawer';
import { getInventoryItem, listInventoryRooms } from '../../../inventory/inventoryApi';
import { InventoryItem, InventoryRoom } from '@/types';

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const CONDITION_COLORS: Record<StatusBoardCondition, string> = {
  GOOD:
    "border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-100 text-emerald-800 dark:border-emerald-900/80 dark:from-emerald-950/40 dark:to-green-950/30 dark:text-emerald-300",
  MONITOR:
    "border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-100 text-amber-800 dark:border-amber-900/80 dark:from-amber-950/40 dark:to-yellow-950/30 dark:text-amber-300",
  ACTION_NEEDED:
    "border-red-200 bg-gradient-to-r from-rose-50 via-red-50 to-orange-100 text-red-800 dark:border-red-900/80 dark:from-rose-950/40 dark:via-red-950/40 dark:to-orange-950/30 dark:text-red-300",
};

const CONDITION_LABELS: Record<StatusBoardCondition, string> = {
  GOOD: "Good",
  MONITOR: "Monitor",
  ACTION_NEEDED: "Action Needed",
};

const CONDITION_ROW_BORDER: Record<StatusBoardCondition, string> = {
  ACTION_NEEDED: "border-l-[3px] border-l-rose-500",
  MONITOR: "border-l-[3px] border-l-amber-400",
  GOOD: "border-l-[3px] border-l-emerald-400",
};

const CONDITION_ROW_BG: Record<StatusBoardCondition, string> = {
  ACTION_NEEDED: "bg-rose-50/20 dark:bg-rose-950/10",
  MONITOR: "bg-amber-50/20 dark:bg-amber-950/10",
  GOOD: "",
};

const RECOMMENDATION_LABELS: Record<StatusBoardRecommendation, string> = {
  OK: "OK",
  REPAIR: "Repair",
  REPLACE_SOON: "Replace Soon",
};

const RECOMMENDATION_COLORS: Record<StatusBoardRecommendation, string> = {
  OK: "bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 border-slate-300 dark:from-slate-900/70 dark:to-slate-800/80 dark:text-slate-200 dark:border-slate-700",
  REPAIR: "bg-gradient-to-r from-amber-50 to-yellow-100 text-amber-800 border-amber-300 dark:from-amber-950/40 dark:to-yellow-950/30 dark:text-amber-300 dark:border-amber-800",
  REPLACE_SOON:
    "bg-gradient-to-r from-rose-50 via-red-50 to-orange-100 text-red-800 border-red-300 dark:from-rose-950/40 dark:via-red-950/40 dark:to-orange-950/30 dark:text-red-300 dark:border-red-800",
};

const WARRANTY_COLORS: Record<WarrantyBadge, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  expiring_soon: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  expired: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  none: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const WARRANTY_LABELS: Record<WarrantyBadge, string> = {
  active: "Active",
  expiring_soon: "Expiring",
  expired: "Expired",
  none: "None",
};

const HEADER_CELL_CLASS =
  "h-12 px-3 text-[13px] font-semibold tracking-wide text-slate-700 dark:text-slate-200";

const GLASS_PANEL_CLASS =
  "rounded-[26px] border border-white/60 bg-white/50 shadow-[0_18px_48px_-28px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-950/40";

const GLASS_CARD_CLASS =
  "border-white/70 bg-white/55 shadow-[0_16px_32px_-22px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-950/40";

const TABLE_SHELL_CLASS =
  "overflow-hidden rounded-[26px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(248,250,252,0.52))] shadow-[0_20px_44px_-34px_rgba(15,23,42,0.7)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.62),rgba(2,6,23,0.45))]";

const DETAIL_BENTO_TILE_CLASS =
  "rounded-2xl border border-white/75 bg-gradient-to-br from-white/80 to-slate-50/60 p-4 shadow-[0_10px_20px_-16px_rgba(15,23,42,0.55)] backdrop-blur-sm dark:border-slate-700/70 dark:from-slate-900/55 dark:to-slate-900/35";

const LINK_ACTION_BUTTON_CLASS =
  "border-teal-200 text-teal-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-teal-50 hover:text-teal-800 hover:shadow-[0_10px_24px_-16px_rgba(13,148,136,0.7)] dark:border-teal-900/70 dark:text-teal-300 dark:hover:bg-teal-950/40";

const INSTALL_DATE_MISSING_TOOLTIP =
  "Install date is empty. Add install date for accurate prediction.";

/** Normalise HOME_ASSET display names that arrive as ALL_CAPS from the backend. */
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

function formatDisplayName(raw: string): string {
  if (!raw) return raw;
  if (raw !== raw.toUpperCase()) return raw;
  const mapped = ASSET_NAME_MAP[raw.trim()];
  if (mapped) return mapped;
  return raw
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAgeDisplay(ageYears: number | null): string {
  if (ageYears == null) return "—";
  if (ageYears < 1) return "<1 yr";
  return `${Math.round(ageYears)} yrs`;
}

function getCategoryVisual(category: string): { Icon: ElementType; toneClass: string } {
  switch (category) {
    case "APPLIANCE":
      return { Icon: Wrench, toneClass: "from-cyan-50 to-sky-100 text-sky-700 dark:from-sky-950/40 dark:to-cyan-950/30 dark:text-sky-300" };
    case "FURNITURE":
      return { Icon: Home, toneClass: "from-indigo-50 to-violet-100 text-indigo-700 dark:from-indigo-950/40 dark:to-violet-950/30 dark:text-indigo-300" };
    case "ELECTRONICS":
      return { Icon: Cpu, toneClass: "from-purple-50 to-fuchsia-100 text-purple-700 dark:from-purple-950/40 dark:to-fuchsia-950/30 dark:text-purple-300" };
    case "SAFETY":
      return { Icon: Shield, toneClass: "from-red-50 to-orange-100 text-red-700 dark:from-red-950/40 dark:to-orange-950/30 dark:text-red-300" };
    case "STRUCTURE":
      return { Icon: Building, toneClass: "from-amber-50 to-yellow-100 text-amber-700 dark:from-amber-950/40 dark:to-yellow-950/30 dark:text-amber-300" };
    case "SYSTEMS":
      return { Icon: Wrench, toneClass: "from-teal-50 to-emerald-100 text-teal-700 dark:from-teal-950/40 dark:to-emerald-950/30 dark:text-teal-300" };
    default:
      return { Icon: Box, toneClass: "from-slate-50 to-slate-100 text-slate-700 dark:from-slate-900/70 dark:to-slate-800/80 dark:text-slate-300" };
  }
}

function getHealthScore(item: StatusBoardItemDTO): number {
  if (item.needsInstallDateForPrediction) return 55;
  if (item.condition === "ACTION_NEEDED") return 35;
  if (item.condition === "MONITOR") return 68;
  return 92;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StatusBoardClient() {
  const params = useParams();
  const queryClient = useQueryClient();
  const propertyId = params.id as string;

  // Filters
  const [search, setSearch] = useState("");
  const [conditionFilter, setConditionFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<string>("none");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Inventory item drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<InventoryItem | null>(null);
  const [drawerRooms, setDrawerRooms] = useState<InventoryRoom[]>([]);
  const [drawerLoading, setDrawerLoading] = useState<string | null>(null);

  const handleViewItem = useCallback(async (item: StatusBoardItemDTO) => {
    if (!item.inventoryItemId) return;
    setDrawerLoading(item.id);
    try {
      const [invItem, rooms] = await Promise.all([
        getInventoryItem(propertyId, item.inventoryItemId),
        listInventoryRooms(propertyId),
      ]);
      setDrawerItem(invItem);
      setDrawerRooms(rooms);
      setDrawerOpen(true);
    } catch (err) {
      console.error('Failed to load inventory item:', err);
    } finally {
      setDrawerLoading(null);
    }
  }, [propertyId]);

  const handleDrawerSaved = useCallback(() => {
    setDrawerOpen(false);
    setDrawerItem(null);
    queryClient.invalidateQueries({ queryKey: ["status-board", propertyId] });
  }, [propertyId, queryClient]);

  // Override form state
  const [overrideCondition, setOverrideCondition] = useState<string>("");
  const [overrideRecommendation, setOverrideRecommendation] = useState<string>("");
  const [overrideNotes, setOverrideNotes] = useState("");

  const queryParams: ListBoardParams = useMemo(
    () => ({
      q: search || undefined,
      groupBy: groupBy !== "none" ? (groupBy as ListBoardParams["groupBy"]) : undefined,
      condition: conditionFilter !== "all" ? (conditionFilter as StatusBoardCondition) : undefined,
      categoryKey: categoryFilter !== "all" ? categoryFilter : undefined,
      pinnedOnly: pinnedOnly || undefined,
      includeHidden: includeHidden || undefined,
      page,
      limit: 50,
    }),
    [search, groupBy, conditionFilter, categoryFilter, pinnedOnly, includeHidden, page]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["status-board", propertyId, queryParams],
    queryFn: () => getStatusBoard(propertyId, queryParams),
    staleTime: 5 * 60 * 1000,
  });

  const recomputeMutation = useMutation({
    mutationFn: () => recomputeStatuses(propertyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["status-board", propertyId] });
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ homeItemId, payload }: { homeItemId: string; payload: PatchStatusPayload }) =>
      patchItemStatus(propertyId, homeItemId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["status-board", propertyId] });
    },
  });

  // Extract unique categories for filter
  const categories = useMemo(() => {
    if (!data?.items) return [];
    const cats = new Set(data.items.map((i) => i.category));
    return Array.from(cats).sort();
  }, [data?.items]);

  function handleTogglePin(item: StatusBoardItemDTO) {
    patchMutation.mutate({ homeItemId: item.id, payload: { isPinned: !item.isPinned } });
  }

  function handleToggleHide(item: StatusBoardItemDTO) {
    patchMutation.mutate({ homeItemId: item.id, payload: { isHidden: !item.isHidden } });
  }

  function handleExpand(item: StatusBoardItemDTO) {
    if (expandedId === item.id) {
      setExpandedId(null);
    } else {
      setExpandedId(item.id);
      setOverrideCondition(item.overrideCondition ?? "");
      setOverrideRecommendation(item.overrideRecommendation ?? "");
      setOverrideNotes(item.overrideNotes ?? "");
    }
  }

  function handleSaveOverride(itemId: string) {
    const payload: PatchStatusPayload = {};
    if (overrideCondition) {
      payload.overrideCondition = overrideCondition as StatusBoardCondition;
    } else {
      payload.overrideCondition = null;
    }
    if (overrideRecommendation) {
      payload.overrideRecommendation = overrideRecommendation as StatusBoardRecommendation;
    } else {
      payload.overrideRecommendation = null;
    }
    if (overrideNotes) {
      payload.overrideNotes = overrideNotes;
    } else {
      payload.overrideNotes = null;
    }
    patchMutation.mutate({ homeItemId: itemId, payload });
  }

  function getReasonDisplayText(item: StatusBoardItemDTO, reason: { code: string; detail: string }) {
    if (reason.code === "MISSING_INSTALL_DATE") {
      return "Install date is empty. Add install date for accurate prediction.";
    }

    if (reason.code === "PAST_EOL") {
      const expectedLifeMatch = reason.detail.match(/(\d+)\s*yr/i);
      const expectedLife = expectedLifeMatch ? Number(expectedLifeMatch[1]) : null;
      const currentAge = item.ageYears != null ? Math.round(item.ageYears) : null;
      if (expectedLife && currentAge != null) {
        return `Expected lifespan: ${expectedLife} yrs • Current age: ${currentAge} yrs`;
      }
      return "Past expected life";
    }

    return reason.detail;
  }

  const summary = data?.summary;
  const items = data?.items ?? [];
  const pagination = data?.pagination;
  const groups = data?.groups;

  // Render grouped or flat
  const renderItems = (itemList: StatusBoardItemDTO[]) =>
    itemList.map((item) => (
      <Fragment key={item.id}>
        {(() => {
          const isUrgentItem = !item.needsInstallDateForPrediction && item.condition === "ACTION_NEEDED";
          const categoryVisual = getCategoryVisual(item.category);
          const CategoryIcon = categoryVisual.Icon;
          const healthScore = getHealthScore(item);
          return (
        <>
        <TableRow
          className={cn(
            "group cursor-pointer border-b border-white/60 bg-white/35 backdrop-blur-sm transition-colors duration-200",
            "hover:bg-white/70 dark:border-slate-700/70 dark:bg-slate-900/20 dark:hover:bg-slate-900/45",
            CONDITION_ROW_BORDER[item.condition],
            CONDITION_ROW_BG[item.condition],
            item.isPinned && "bg-amber-50/55 dark:bg-amber-900/15",
            expandedId === item.id && "bg-white/90 dark:bg-slate-800/70",
            isUrgentItem && "shadow-[inset_3px_0_0_0_rgba(239,68,68,0.35)]"
          )}
          onClick={() => handleExpand(item)}
        >
          <TableCell className="w-10 py-5 align-middle">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePin(item);
              }}
              className={`rounded-md p-2.5 sm:p-1.5 transition-colors hover:bg-slate-200/70 dark:hover:bg-slate-800 ${item.isPinned ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-300"}`}
            >
              <Pin className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
          </TableCell>
          <TableCell className="min-w-0 py-3 align-middle">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${categoryVisual.toneClass}`}>
                <CategoryIcon className="h-4 w-4" />
              </span>
              <div className="flex min-w-0 flex-row flex-wrap items-center gap-2">
                <span className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{formatDisplayName(item.displayName)}</span>
                {item.condition !== "GOOD" && item.computedReasons.length > 0 && (() => {
                  const topReason = item.computedReasons[0];
                  const isEol = topReason.code.includes("EOL") || topReason.code.includes("NEARING_EOL");
                  const isMissingDate = topReason.code === "MISSING_INSTALL_DATE";
                  return (
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        item.condition === "ACTION_NEEDED"
                          ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300"
                          : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300"
                      )}
                    >
                      {isEol ? (
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                      ) : isMissingDate ? (
                        <Info className="h-3 w-3 shrink-0" />
                      ) : (
                        <Clock className="h-3 w-3 shrink-0" />
                      )}
                      <span>{topReason.detail}</span>
                    </span>
                  );
                })()}
                <p className="mt-1 text-xs text-muted-foreground lg:hidden">
                  {item.category}
                  {item.ageYears != null ? ` • ${formatAgeDisplay(item.ageYears)}` : ""}
                </p>
              </div>
            </div>
          </TableCell>
          <TableCell className="hidden py-5 text-sm text-muted-foreground lg:table-cell">
            <span className="inline-flex items-center gap-1.5">
              <CategoryIcon className="h-3.5 w-3.5 text-slate-500" />
              {item.category}
            </span>
          </TableCell>
          <TableCell className="hidden py-5 text-sm md:table-cell">{formatAgeDisplay(item.ageYears)}</TableCell>
          <TableCell className="hidden py-5 lg:table-cell">
            <Badge variant="outline" className={`text-xs ${WARRANTY_COLORS[item.warrantyStatus]}`}>
              {WARRANTY_LABELS[item.warrantyStatus]}
            </Badge>
          </TableCell>
          <TableCell className="py-5">
            {item.needsInstallDateForPrediction ? (
              <span className="inline-flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="text-xs font-semibold bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                >
                  N/A
                </Badge>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex p-1.5 -m-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                      aria-label="Why condition is N/A"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{INSTALL_DATE_MISSING_TOOLTIP}</TooltipContent>
                </Tooltip>
              </span>
            ) : (
              <>
                <Badge
                  className={`whitespace-normal text-center text-xs leading-tight md:text-sm md:whitespace-nowrap font-semibold shadow-sm ${CONDITION_COLORS[item.condition]} ${
                    item.condition === "ACTION_NEEDED"
                      ? "ring-1 ring-red-300/70 dark:ring-red-800/70"
                      : ""
                  }`}
                >
                  {CONDITION_LABELS[item.condition]}
                </Badge>
                {item.overrideCondition && (
                  <span className="ml-1 text-[10px] text-muted-foreground">(override)</span>
                )}
              </>
            )}
          </TableCell>
          <TableCell className="py-5 text-sm font-medium text-slate-700 dark:text-slate-200">
            {item.needsInstallDateForPrediction ? (
              <span className="inline-flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="text-xs font-semibold bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                >
                  N/A
                </Badge>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex p-1.5 -m-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                      aria-label="Why action is N/A"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{INSTALL_DATE_MISSING_TOOLTIP}</TooltipContent>
                </Tooltip>
              </span>
            ) : (
              <Badge
                variant="outline"
                className={`whitespace-normal text-center text-xs leading-tight md:text-sm md:whitespace-nowrap font-semibold shadow-sm ${RECOMMENDATION_COLORS[item.recommendation]}`}
              >
                {RECOMMENDATION_LABELS[item.recommendation]}
              </Badge>
            )}
          </TableCell>
          <TableCell className="w-10 py-5 align-middle">
            <ChevronRight
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                expandedId === item.id ? "rotate-90" : ""
              }`}
            />
          </TableCell>
        </TableRow>

        {expandedId === item.id && (
          <TableRow>
            <TableCell colSpan={8} className="bg-transparent p-0">
              <div className="m-2 rounded-2xl border border-white/70 bg-[radial-gradient(circle_at_0%_0%,rgba(45,212,191,0.14),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.72),rgba(248,250,252,0.52))] p-5 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.7)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-[radial-gradient(circle_at_0%_0%,rgba(45,212,191,0.16),transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.62),rgba(2,6,23,0.45))]">
                <div className="space-y-5 border-l-2 border-teal-200/80 pl-4 dark:border-teal-800/80">
                {/* Details grid */}
                <div className="grid grid-cols-2 gap-3 text-sm xl:grid-cols-5">
                  <div
                    className={cn(
                      DETAIL_BENTO_TILE_CLASS,
                      "ring-1",
                      item.needsInstallDateForPrediction
                        ? "ring-amber-300/60 dark:ring-amber-700/40"
                        : "ring-teal-200/60 dark:ring-teal-800/40"
                    )}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                          <Clock className="h-3 w-3" />
                          Installed
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Installation date used for age prediction.</TooltipContent>
                    </Tooltip>
                    <p className="mt-1 font-medium">{item.installDate ? new Date(item.installDate).toLocaleDateString() : "—"}</p>
                  </div>
                  <div className={DETAIL_BENTO_TILE_CLASS}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                          <RefreshCw className="h-3 w-3" />
                          Last Computed
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Most recent prediction run timestamp.</TooltipContent>
                    </Tooltip>
                    <p className="mt-1 font-medium">{item.computedAt ? new Date(item.computedAt).toLocaleDateString() : "—"}</p>
                  </div>
                  <div className={DETAIL_BENTO_TILE_CLASS}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                          <Shield className="h-3 w-3" />
                          Warranty
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Current coverage state for this item.</TooltipContent>
                    </Tooltip>
                    <p className="mt-1 font-medium">
                      {item.warrantyExpiry ? `Expires ${new Date(item.warrantyExpiry).toLocaleDateString()}` : "None"}
                    </p>
                  </div>
                  <div className={DETAIL_BENTO_TILE_CLASS}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                          <Wrench className="h-3 w-3" />
                          Pending Tasks
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Open maintenance tasks linked to this item.</TooltipContent>
                    </Tooltip>
                    <p className="mt-1 font-medium">{item.pendingMaintenance}</p>
                  </div>
                  <div className={DETAIL_BENTO_TILE_CLASS}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                          <Home className="h-3 w-3" />
                          Room
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Room associated with this item.</TooltipContent>
                    </Tooltip>
                    <p className="mt-1 font-medium">{item.room?.name ?? "No Room"}</p>
                  </div>
                </div>

                {/* Computed reasons */}
                {item.computedReasons.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Computed Reasons</p>
                    <ul className="flex flex-wrap gap-2">
                      {item.computedReasons.map((r, i) => (
                        <li
                          key={i}
                          className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/75 px-3 py-1.5 text-xs text-slate-700 shadow-[0_8px_18px_-16px_rgba(15,23,42,0.65)] backdrop-blur-sm dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-200"
                        >
                          {r.code === "ALL_CLEAR" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          ) : r.code === "MISSING_INSTALL_DATE" ? (
                            <Info className="h-3.5 w-3.5 text-sky-500" />
                          ) : r.code.includes("EOL") || r.code.includes("OVERDUE") ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 text-amber-500" />
                          )}
                          {getReasonDisplayText(item, r)}
                          {r.code === "ALL_CLEAR" && (
                            <span className="ml-1 inline-flex items-center gap-1">
                              <span className="h-1.5 w-14 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                                <span
                                  className="block h-full bg-gradient-to-r from-emerald-500 to-lime-500"
                                  style={{ width: `${healthScore}%` }}
                                />
                              </span>
                              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                {healthScore}%
                              </span>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Actions
                </p>
                {/* Deep links */}
                <div className="flex flex-wrap gap-2 rounded-2xl border border-white/70 bg-white/50 p-3 backdrop-blur-sm overflow-hidden dark:border-slate-700/70 dark:bg-slate-900/40">
                  {item.inventoryItemId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className={LINK_ACTION_BUTTON_CLASS}
                      disabled={drawerLoading === item.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewItem(item);
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      {drawerLoading === item.id ? 'Loading...' : 'View Item'}
                    </Button>
                  )}
                  {item.deepLinks.viewRoom && (
                    <Link href={item.deepLinks.viewRoom}>
                      <Button variant="outline" size="sm" className={LINK_ACTION_BUTTON_CLASS}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Room
                      </Button>
                    </Link>
                  )}
                  {item.deepLinks.warranty && (
                    <Link href={item.deepLinks.warranty}>
                      <Button variant="outline" size="sm" className={LINK_ACTION_BUTTON_CLASS}>
                        <Shield className="h-3.5 w-3.5 mr-1" /> Warranty
                      </Button>
                    </Link>
                  )}
                  {item.recommendation === "REPLACE_SOON" && item.deepLinks.replaceRepair ? (
                    <Link href={item.deepLinks.replaceRepair}>
                      <Button variant="outline" size="sm" className={LINK_ACTION_BUTTON_CLASS}>
                        <Wrench className="h-3.5 w-3.5 mr-1" /> Replace or Repair
                      </Button>
                    </Link>
                  ) : item.recommendation === "REPLACE_SOON" ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled
                            className="pointer-events-none cursor-not-allowed border-slate-200 text-slate-400 opacity-60 dark:border-slate-800 dark:text-slate-500"
                          >
                            <Wrench className="h-3.5 w-3.5 mr-1" /> Replace or Repair
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Link your inventory item to enable Replace or Repair analysis
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  {item.deepLinks.maintenance && item.pendingMaintenance > 0 ? (
                    <Link href={item.deepLinks.maintenance}>
                      <Button variant="outline" size="sm" className={LINK_ACTION_BUTTON_CLASS}>
                        <Wrench className="h-3.5 w-3.5 mr-1" /> Maintenance
                      </Button>
                    </Link>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled
                            className="pointer-events-none cursor-not-allowed border-slate-200 text-slate-400 opacity-60 dark:border-slate-800 dark:text-slate-500"
                          >
                            <Wrench className="h-3.5 w-3.5 mr-1" /> Maintenance
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        No pending maintenance tasks for this item
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {item.deepLinks.riskAssessment && (
                    <Link href={item.deepLinks.riskAssessment}>
                      <Button variant="outline" size="sm" className={LINK_ACTION_BUTTON_CLASS}>
                        <Shield className="h-3.5 w-3.5 mr-1" /> Risk
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="transition-colors hover:bg-slate-200/70 dark:hover:bg-slate-800"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleHide(item);
                    }}
                  >
                    {item.isHidden ? <Eye className="h-3.5 w-3.5 mr-1" /> : <EyeOff className="h-3.5 w-3.5 mr-1" />}
                    {item.isHidden ? "Show" : "Hide"}
                  </Button>
                </div>

                {/* Override form */}
                <div className="space-y-3 rounded-2xl border border-white/70 bg-white/45 p-4 backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-900/35">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Adjust Status (Optional)</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex p-1.5 -m-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                          aria-label="Why override status"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Use this only when you need to override computed status.</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Condition</label>
                      <Select value={overrideCondition} onValueChange={setOverrideCondition}>
                        <SelectTrigger className="h-8 border-slate-300/80 bg-white/75 text-sm dark:border-slate-700/80 dark:bg-slate-900/60">
                          <SelectValue placeholder="Use computed" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clear">Use computed</SelectItem>
                          <SelectItem value="GOOD">Good</SelectItem>
                          <SelectItem value="MONITOR">Monitor</SelectItem>
                          <SelectItem value="ACTION_NEEDED">Action Needed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Recommendation</label>
                      <Select value={overrideRecommendation} onValueChange={setOverrideRecommendation}>
                        <SelectTrigger className="h-8 border-slate-300/80 bg-white/75 text-sm dark:border-slate-700/80 dark:bg-slate-900/60">
                          <SelectValue placeholder="Use computed" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clear">Use computed</SelectItem>
                          <SelectItem value="OK">OK</SelectItem>
                          <SelectItem value="REPAIR">Repair</SelectItem>
                          <SelectItem value="REPLACE_SOON">Replace Soon</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Notes</label>
                      <Textarea
                        value={overrideNotes}
                        onChange={(e) => setOverrideNotes(e.target.value)}
                        placeholder="Optional notes..."
                        className="min-h-[40px] resize-y border-slate-300/80 bg-white/75 text-sm dark:border-slate-700/80 dark:bg-slate-900/60"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-teal-600 text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-teal-700 hover:shadow-[0_10px_24px_-16px_rgba(13,148,136,0.8)] dark:bg-teal-600 dark:hover:bg-teal-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveOverride(item.id);
                    }}
                    disabled={patchMutation.isPending}
                  >
                    {patchMutation.isPending ? (
                      <>
                        <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Override"
                    )}
                  </Button>
                </div>
                </div>
              </div>
            </TableCell>
          </TableRow>
        )}
        </>
          );
        })()}
      </Fragment>
    ));

  return (
    <TooltipProvider delayDuration={120}>
      <div className="pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-6">
      <div className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-[radial-gradient(circle_at_12%_15%,rgba(251,191,36,0.14),transparent_42%),radial-gradient(circle_at_88%_12%,rgba(20,184,166,0.16),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.88))] p-4 shadow-[0_30px_60px_-40px_rgba(15,23,42,0.6)] dark:border-slate-700/80 dark:bg-[radial-gradient(circle_at_12%_15%,rgba(245,158,11,0.1),transparent_42%),radial-gradient(circle_at_88%_12%,rgba(20,184,166,0.12),transparent_38%),linear-gradient(180deg,rgba(2,6,23,0.88),rgba(2,6,23,0.78))] sm:p-5">
        <div className="relative z-10 space-y-3">
        {/* Header */}
        <div className={`p-3 sm:p-4 ${GLASS_PANEL_CLASS}`}>
          <div className="flex items-start justify-between gap-4 min-w-0">
            <div className="min-w-0">
              <h1 className="text-xl font-heading font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
                Home Status Board
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                All home items with computed condition statuses
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-slate-200/80 bg-white/70 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
              disabled={recomputeMutation.isPending}
              onClick={() => recomputeMutation.mutate()}
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", recomputeMutation.isPending && "animate-spin")} />
              {recomputeMutation.isPending ? "Recomputing..." : "Recompute"}
            </Button>
          </div>
        </div>

        {/* Summary strip */}
        {summary && (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => { setConditionFilter("all"); setPage(1); }}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all hover:shadow-sm",
                GLASS_CARD_CLASS,
                conditionFilter === "all" ? "ring-2 ring-slate-400 dark:ring-slate-500" : "",
              )}
            >
              <div className="flex items-center gap-3">
                <Box className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                <div className="text-left">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">All</p>
                  <p className="mt-0.5 text-xl font-bold leading-none text-slate-800 dark:text-slate-100">
                    {summary.total}
                  </p>
                </div>
              </div>
              {conditionFilter === "all" && (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 -rotate-90 text-slate-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => { setConditionFilter(conditionFilter === "GOOD" ? "all" : "GOOD"); setPage(1); }}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all hover:shadow-sm",
                "border-emerald-200/70 bg-emerald-50/80 dark:border-emerald-800/50 dark:bg-emerald-950/30",
                conditionFilter === "GOOD" ? "ring-2 ring-emerald-400 dark:ring-emerald-600" : "",
              )}
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 dark:text-emerald-400" />
                <div className="text-left">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-500 dark:text-emerald-400">Good</p>
                  <p className="mt-0.5 text-xl font-bold leading-none text-emerald-700 dark:text-emerald-300">
                    {summary.good}
                  </p>
                </div>
              </div>
              {conditionFilter === "GOOD" && (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 -rotate-90 text-emerald-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => { setConditionFilter(conditionFilter === "MONITOR" ? "all" : "MONITOR"); setPage(1); }}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all hover:shadow-sm",
                "border-amber-200/70 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/30",
                conditionFilter === "MONITOR" ? "ring-2 ring-amber-400 dark:ring-amber-600" : "",
              )}
            >
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                <div className="text-left">
                  <p className="text-[10px] uppercase tracking-wider text-amber-500 dark:text-amber-400">Monitor</p>
                  <p className="mt-0.5 text-xl font-bold leading-none text-amber-700 dark:text-amber-300">
                    {summary.monitor}
                  </p>
                </div>
              </div>
              {conditionFilter === "MONITOR" && (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 -rotate-90 text-amber-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (summary.actionNeeded === 0) return;
                setConditionFilter(conditionFilter === "ACTION_NEEDED" ? "all" : "ACTION_NEEDED");
                setPage(1);
              }}
              disabled={summary.actionNeeded === 0}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all",
                summary.actionNeeded > 0
                  ? "cursor-pointer border-rose-600 bg-rose-500 hover:bg-rose-600 hover:shadow-sm"
                  : "cursor-default border-emerald-200/70 bg-emerald-50/80",
                conditionFilter === "ACTION_NEEDED" && summary.actionNeeded > 0
                  ? "ring-2 ring-white/60"
                  : "",
              )}
            >
              <div className="flex items-center gap-3">
                {summary.actionNeeded > 0
                  ? <AlertTriangle className="h-4 w-4 shrink-0 text-white" />
                  : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                <div className="text-left">
                  <p
                    className={cn(
                      "text-[10px] uppercase tracking-wider",
                      summary.actionNeeded > 0 ? "text-white/80" : "text-emerald-500 dark:text-emerald-400",
                    )}
                  >
                    Action Needed
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-xl font-bold leading-none",
                      summary.actionNeeded > 0 ? "text-white" : "text-emerald-700 dark:text-emerald-300",
                    )}
                  >
                    {summary.actionNeeded > 0 ? summary.actionNeeded : "✓"}
                  </p>
                </div>
              </div>
              {conditionFilter === "ACTION_NEEDED" && summary.actionNeeded > 0 && (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 -rotate-90 text-white/70" />
              )}
            </button>
          </div>
        )}

      {/* Controls bar */}
      <div className={`flex flex-wrap items-center gap-2 p-2.5 ${GLASS_PANEL_CLASS}`}>
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-9 border-slate-300/80 bg-white/75 pl-9 shadow-sm focus-visible:ring-teal-200 dark:border-slate-700/80 dark:bg-slate-900/60"
          />
        </div>

        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-[140px] border-slate-300/80 bg-white/70 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/60">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="h-9 w-full sm:w-[130px] border-slate-300/80 bg-white/70 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/60">
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Grouping</SelectItem>
            <SelectItem value="condition">By Condition</SelectItem>
            <SelectItem value="category">By Category</SelectItem>
            <SelectItem value="room">By Room</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={pinnedOnly ? "default" : "outline"}
          size="sm"
          className={`h-9 transition-colors ${pinnedOnly ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200" : "border-slate-300/80 bg-white/60 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/40 dark:hover:bg-slate-900"}`}
          onClick={() => { setPinnedOnly(!pinnedOnly); setPage(1); }}
        >
          <Pin className="h-3.5 w-3.5 mr-1" /> Pinned
        </Button>

        <Button
          variant={includeHidden ? "default" : "outline"}
          size="sm"
          className={`h-9 transition-colors ${includeHidden ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200" : "border-slate-300/80 bg-white/60 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/40 dark:hover:bg-slate-900"}`}
          onClick={() => { setIncludeHidden(!includeHidden); setPage(1); }}
        >
          <EyeOff className="h-3.5 w-3.5 mr-1" /> Hidden
        </Button>
      </div>

      {summary && (
        <div className="flex flex-wrap gap-2 lg:hidden">
          {[
            { label: "All", value: "all", count: summary.total, color: "border-slate-200 text-slate-700 bg-white/80" },
            {
              label: "Action Needed",
              value: "ACTION_NEEDED",
              count: summary.actionNeeded,
              color: "border-rose-200 text-rose-700 bg-rose-50/80 dark:border-rose-800/60 dark:text-rose-300 dark:bg-rose-950/40",
            },
            {
              label: "Monitor",
              value: "MONITOR",
              count: summary.monitor,
              color: "border-amber-200 text-amber-700 bg-amber-50/80 dark:border-amber-800/60 dark:text-amber-300 dark:bg-amber-950/40",
            },
            {
              label: "Good",
              value: "GOOD",
              count: summary.good,
              color: "border-emerald-200 text-emerald-700 bg-emerald-50/80 dark:border-emerald-800/60 dark:text-emerald-300 dark:bg-emerald-950/40",
            },
          ].map(({ label, value, count, color }) => (
            <button
              key={value}
              type="button"
              onClick={() => { setConditionFilter(value); setPage(1); }}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                color,
                conditionFilter === value ? "ring-2 ring-current ring-offset-1" : ""
              )}
            >
              {label}
              <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-bold dark:bg-black/20">
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      {conditionFilter !== "all" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Showing:{" "}
            <strong className="text-slate-700 dark:text-slate-200">
              {conditionFilter === "ACTION_NEEDED"
                ? "Action Needed"
                : conditionFilter === "MONITOR"
                ? "Monitor"
                : "Good"}{" "}
              items
            </strong>
          </span>
          <button
            type="button"
            onClick={() => { setConditionFilter("all"); setPage(1); }}
            className="text-xs text-teal-600 hover:underline dark:text-teal-400"
          >
            Clear filter ✕
          </button>
        </div>
      )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className={`mt-4 py-12 text-center text-muted-foreground ${GLASS_PANEL_CLASS}`}>Loading status board...</div>
      ) : error ? (
        <div className={`mt-4 py-12 text-center text-red-500 ${GLASS_PANEL_CLASS}`}>Failed to load status board</div>
      ) : items.length === 0 ? (
        <div className={`mt-4 py-12 text-center text-muted-foreground ${GLASS_PANEL_CLASS}`}>
          No items found. Add inventory items or home systems to see them here.
        </div>
      ) : groups && groupBy !== "none" ? (
        // Grouped view
        <div className="mt-4 space-y-4">
          {Object.entries(groups).map(([groupName, groupItems]) => (
            <Collapsible key={groupName} open={true}>
              <CollapsibleTrigger asChild>
                <div className={`flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-3.5 sm:py-2.5 transition-colors hover:bg-white/70 dark:hover:bg-slate-900/60 ${GLASS_CARD_CLASS}`}>
                  <ChevronDown className="h-4 w-4" />
                  <h3 className="font-semibold">{groupName}</h3>
                  <Badge variant="outline" className="text-xs bg-white/70 dark:bg-slate-900/60">
                    {groupItems.length}
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className={`mt-2 ${TABLE_SHELL_CLASS}`}>
                  <Table className="table-auto">
                    <TableHeader>
                      <TableRow className="border-b border-white/70 bg-white/55 dark:border-slate-700/80 dark:bg-slate-900/55">
                        <TableHead className={`w-10 ${HEADER_CELL_CLASS}`} />
                        <TableHead className={HEADER_CELL_CLASS}>Name</TableHead>
                        <TableHead className={`hidden lg:table-cell ${HEADER_CELL_CLASS}`}>Category</TableHead>
                        <TableHead className={`hidden md:table-cell ${HEADER_CELL_CLASS}`}>Age</TableHead>
                        <TableHead className={`hidden lg:table-cell ${HEADER_CELL_CLASS}`}>Warranty</TableHead>
                        <TableHead className={HEADER_CELL_CLASS}>Condition</TableHead>
                        <TableHead className={HEADER_CELL_CLASS}>Action</TableHead>
                        <TableHead className={`w-10 ${HEADER_CELL_CLASS}`} />
                      </TableRow>
                    </TableHeader>
                    <TableBody>{renderItems(groupItems)}</TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      ) : (
        // Flat view
        <div className={`mt-4 ${TABLE_SHELL_CLASS}`}>
          <Table className="table-auto">
            <TableHeader>
              <TableRow className="border-b border-white/70 bg-white/55 dark:border-slate-700/80 dark:bg-slate-900/55">
                <TableHead className={`w-10 ${HEADER_CELL_CLASS}`} />
                <TableHead className={HEADER_CELL_CLASS}>Name</TableHead>
                <TableHead className={`hidden lg:table-cell ${HEADER_CELL_CLASS}`}>Category</TableHead>
                <TableHead className={`hidden md:table-cell ${HEADER_CELL_CLASS}`}>Age</TableHead>
                <TableHead className={`hidden lg:table-cell ${HEADER_CELL_CLASS}`}>Warranty</TableHead>
                <TableHead className={HEADER_CELL_CLASS}>Condition</TableHead>
                <TableHead className={HEADER_CELL_CLASS}>Action</TableHead>
                <TableHead className={`w-10 ${HEADER_CELL_CLASS}`} />
              </TableRow>
            </TableHeader>
            <TableBody>{renderItems(items)}</TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className={`mt-3 flex items-center justify-between p-3 ${GLASS_PANEL_CLASS}`}>
          <p className="text-sm text-muted-foreground dark:text-slate-300">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} items)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      </div>

      <InventoryItemDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerItem(null); }}
        propertyId={propertyId}
        rooms={drawerRooms}
        initialItem={drawerItem}
        onSaved={handleDrawerSaved}
      />
    </TooltipProvider>
  );
}
