"use client";

import { Fragment, useState, useMemo, type ElementType } from "react";
import { useParams, useRouter } from "next/navigation";
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

import { Card, CardContent } from "@/components/ui/card";
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
  ArrowLeft,
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

const LINK_ACTION_BUTTON_CLASS =
  "border-teal-200 text-teal-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-teal-50 hover:text-teal-800 hover:shadow-[0_10px_24px_-16px_rgba(13,148,136,0.7)] dark:border-teal-900/70 dark:text-teal-300 dark:hover:bg-teal-950/40";

const INSTALL_DATE_MISSING_TOOLTIP =
  "Install date is empty. Add install date for accurate prediction.";

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
  const router = useRouter();
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
          className={`group cursor-pointer border-b border-slate-200/80 transition-all duration-300 hover:bg-slate-50/80 dark:border-slate-700/70 dark:hover:bg-slate-900/40 ${
            item.isPinned ? "bg-amber-50/60 dark:bg-amber-900/10" : ""
          } ${
            isUrgentItem
              ? "shadow-[inset_3px_0_0_0_rgba(239,68,68,0.35)] hover:shadow-[inset_3px_0_0_0_rgba(239,68,68,0.55),0_12px_28px_-20px_rgba(239,68,68,0.7)]"
              : ""
          }`}
          onClick={() => handleExpand(item)}
        >
          <TableCell className="w-10 py-5 align-middle">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePin(item);
              }}
              className={`rounded-md p-1.5 transition-colors hover:bg-slate-200/70 dark:hover:bg-slate-800 ${item.isPinned ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-300"}`}
            >
              <Pin className="h-4 w-4" />
            </button>
          </TableCell>
          <TableCell className="py-5 align-middle">
            <div className="flex items-center gap-3">
              <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${categoryVisual.toneClass}`}>
                <CategoryIcon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{item.displayName}</p>
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
                      className="inline-flex text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
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
                  className={`text-xs md:text-sm font-semibold shadow-sm ${CONDITION_COLORS[item.condition]} ${
                    item.condition === "ACTION_NEEDED"
                      ? "ring-1 ring-red-300/70 dark:ring-red-800/70 motion-safe:animate-pulse"
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
                      className="inline-flex text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
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
                className={`text-xs md:text-sm font-semibold shadow-sm ${RECOMMENDATION_COLORS[item.recommendation]}`}
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
            <TableCell colSpan={8} className="bg-slate-50/80 p-0 dark:bg-slate-900/40">
              <div className="animate-in fade-in-0 slide-in-from-top-1 border-l-2 border-teal-200/80 p-6 duration-300 space-y-5 dark:border-teal-800/80">
                {/* Details grid */}
                <div className="grid grid-cols-2 gap-3 text-sm xl:grid-cols-5">
                  <div className="rounded-xl border border-slate-200/80 bg-white/70 p-4 dark:border-slate-700/70 dark:bg-slate-950/30">
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
                  <div className="rounded-xl border border-slate-200/80 bg-white/70 p-4 dark:border-slate-700/70 dark:bg-slate-950/30">
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
                  <div className="rounded-xl border border-slate-200/80 bg-white/70 p-4 dark:border-slate-700/70 dark:bg-slate-950/30">
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
                  <div className="rounded-xl border border-slate-200/80 bg-white/70 p-4 dark:border-slate-700/70 dark:bg-slate-950/30">
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
                  <div className="rounded-xl border border-slate-200/80 bg-white/70 p-4 dark:border-slate-700/70 dark:bg-slate-950/30">
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
                          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-200"
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

                {/* Deep links */}
                <div className="flex flex-wrap gap-2">
                  {item.deepLinks.viewItem && (
                    <Link href={item.deepLinks.viewItem}>
                      <Button variant="outline" size="sm" className={LINK_ACTION_BUTTON_CLASS}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Item
                      </Button>
                    </Link>
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
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="cursor-not-allowed border-slate-200 text-slate-400 opacity-60 dark:border-slate-800 dark:text-slate-500"
                    >
                      <Wrench className="h-3.5 w-3.5 mr-1" /> Replace or Repair
                    </Button>
                  ) : null}
                  {item.deepLinks.maintenance && item.pendingMaintenance > 0 ? (
                    <Link href={item.deepLinks.maintenance}>
                      <Button variant="outline" size="sm" className={LINK_ACTION_BUTTON_CLASS}>
                        <Wrench className="h-3.5 w-3.5 mr-1" /> Maintenance
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="cursor-not-allowed border-slate-200 text-slate-400 opacity-60 dark:border-slate-800 dark:text-slate-500"
                    >
                      <Wrench className="h-3.5 w-3.5 mr-1" /> Maintenance
                    </Button>
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
                <div className="space-y-3 border-t border-dashed border-slate-300/80 pt-4 dark:border-slate-700/80">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Adjust Status (Optional)</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
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
                        <SelectTrigger className="h-8 text-sm">
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
                        <SelectTrigger className="h-8 text-sm">
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
                        className="min-h-[40px] text-sm resize-y"
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
      <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-heading font-bold">Home Status Board</h1>
          <p className="text-sm text-muted-foreground">
            All home items with computed condition statuses
          </p>
        </div>
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80">
            <CardContent className="p-5 text-center">
              <p className="text-3xl font-bold">{summary.total}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">Total Items</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 bg-gradient-to-b from-emerald-50/70 to-white dark:from-emerald-950/20 dark:to-transparent">
            <CardContent className="p-5 text-center">
              <p className="text-3xl font-bold text-green-600">{summary.good}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">Good</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 bg-gradient-to-b from-amber-50/70 to-white dark:from-amber-950/20 dark:to-transparent">
            <CardContent className="p-5 text-center">
              <p className="text-3xl font-bold text-amber-600">{summary.monitor}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">Monitor</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 bg-gradient-to-b from-rose-50/70 to-white dark:from-rose-950/20 dark:to-transparent">
            <CardContent className="p-5 text-center">
              <p className="text-3xl font-bold text-red-600">{summary.actionNeeded}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">Action Needed</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-300/80 bg-white/70 p-3 shadow-sm dark:border-slate-700/80 dark:bg-slate-950/40">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 h-9"
          />
        </div>

        <Select value={conditionFilter} onValueChange={(v) => { setConditionFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Condition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Conditions</SelectItem>
            <SelectItem value="GOOD">Good</SelectItem>
            <SelectItem value="MONITOR">Monitor</SelectItem>
            <SelectItem value="ACTION_NEEDED">Action Needed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px] h-9">
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
          <SelectTrigger className="w-[130px] h-9">
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
          className="h-9"
          onClick={() => { setPinnedOnly(!pinnedOnly); setPage(1); }}
        >
          <Pin className="h-3.5 w-3.5 mr-1" /> Pinned
        </Button>

        <Button
          variant={includeHidden ? "default" : "outline"}
          size="sm"
          className="h-9"
          onClick={() => { setIncludeHidden(!includeHidden); setPage(1); }}
        >
          <EyeOff className="h-3.5 w-3.5 mr-1" /> Hidden
        </Button>

        <Button
          variant="outline"
          size="sm"
          className={`h-9 transition-all ${recomputeMutation.isPending ? "bg-slate-100 dark:bg-slate-900/60" : "hover:-translate-y-0.5"}`}
          onClick={() => recomputeMutation.mutate()}
          disabled={recomputeMutation.isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${recomputeMutation.isPending ? "animate-spin" : ""}`} />
          {recomputeMutation.isPending ? "Recomputing..." : "Recompute"}
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading status board...</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">Failed to load status board</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No items found. Add inventory items or home systems to see them here.
        </div>
      ) : groups && groupBy !== "none" ? (
        // Grouped view
        <div className="space-y-4">
          {Object.entries(groups).map(([groupName, groupItems]) => (
            <Collapsible key={groupName} open={true}>
              <CollapsibleTrigger asChild>
                <div className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50">
                  <ChevronDown className="h-4 w-4" />
                  <h3 className="font-medium">{groupName}</h3>
                  <Badge variant="outline" className="text-xs">
                    {groupItems.length}
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/40 backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-950/30">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2 border-slate-300/80 dark:border-slate-600/80">
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
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/40 backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-950/30">
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 border-slate-300/80 dark:border-slate-600/80">
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
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
    </TooltipProvider>
  );
}
