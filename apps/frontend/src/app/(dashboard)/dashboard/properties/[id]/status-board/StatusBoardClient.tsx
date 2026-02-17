"use client";

import { Fragment, useState, useMemo } from "react";
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
} from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const CONDITION_COLORS: Record<StatusBoardCondition, string> = {
  GOOD: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  MONITOR: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  ACTION_NEEDED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
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

  const summary = data?.summary;
  const items = data?.items ?? [];
  const pagination = data?.pagination;
  const groups = data?.groups;

  // Render grouped or flat
  const renderItems = (itemList: StatusBoardItemDTO[]) =>
    itemList.map((item) => (
      <Fragment key={item.id}>
        <TableRow
          className={`cursor-pointer hover:bg-muted/50 ${item.isPinned ? "bg-yellow-50/50 dark:bg-yellow-900/10" : ""}`}
          onClick={() => handleExpand(item)}
        >
          <TableCell className="w-8">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePin(item);
              }}
              className={`p-1 rounded hover:bg-muted ${item.isPinned ? "text-yellow-600" : "text-muted-foreground"}`}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
          </TableCell>
          <TableCell className="font-medium">{item.displayName}</TableCell>
          <TableCell className="text-muted-foreground text-sm">{item.category}</TableCell>
          <TableCell className="text-sm">{item.ageYears != null ? `${item.ageYears}yr` : "—"}</TableCell>
          <TableCell>
            <Badge variant="outline" className={`text-xs ${WARRANTY_COLORS[item.warrantyStatus]}`}>
              {WARRANTY_LABELS[item.warrantyStatus]}
            </Badge>
          </TableCell>
          <TableCell>
            <Badge className={`text-xs ${CONDITION_COLORS[item.condition]}`}>
              {CONDITION_LABELS[item.condition]}
            </Badge>
            {item.overrideCondition && (
              <span className="ml-1 text-[10px] text-muted-foreground">(override)</span>
            )}
          </TableCell>
          <TableCell className="text-sm">{RECOMMENDATION_LABELS[item.recommendation]}</TableCell>
          <TableCell className="w-8">
            {expandedId === item.id ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </TableCell>
        </TableRow>

        {expandedId === item.id && (
          <TableRow>
            <TableCell colSpan={8} className="bg-muted/30 p-0">
              <div className="p-4 space-y-4">
                {/* Details grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Installed</span>
                    <p className="font-medium">{item.installDate ? new Date(item.installDate).toLocaleDateString() : "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Computed</span>
                    <p className="font-medium">{item.computedAt ? new Date(item.computedAt).toLocaleDateString() : "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Warranty</span>
                    <p className="font-medium">
                      {item.warrantyExpiry ? `Expires ${new Date(item.warrantyExpiry).toLocaleDateString()}` : "None"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pending Tasks</span>
                    <p className="font-medium">{item.pendingMaintenance}</p>
                  </div>
                </div>

                {/* Computed reasons */}
                {item.computedReasons.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">Computed Reasons</p>
                    <ul className="space-y-1">
                      {item.computedReasons.map((r, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                          {r.code === "ALL_CLEAR" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          ) : r.code.includes("EOL") || r.code.includes("OVERDUE") ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 text-amber-500" />
                          )}
                          {r.detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Deep links */}
                <div className="flex flex-wrap gap-2">
                  {item.deepLinks.viewItem && (
                    <Link href={item.deepLinks.viewItem}>
                      <Button variant="outline" size="sm">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Item
                      </Button>
                    </Link>
                  )}
                  {item.deepLinks.viewRoom && (
                    <Link href={item.deepLinks.viewRoom}>
                      <Button variant="outline" size="sm">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Room
                      </Button>
                    </Link>
                  )}
                  {item.deepLinks.maintenance && item.pendingMaintenance > 0 ? (
                    <Link href={item.deepLinks.maintenance}>
                      <Button variant="outline" size="sm">
                        <Wrench className="h-3.5 w-3.5 mr-1" /> Maintenance
                      </Button>
                    </Link>
                  ) : (
                    <Button variant="outline" size="sm" disabled className="opacity-50 cursor-not-allowed">
                      <Wrench className="h-3.5 w-3.5 mr-1" /> Maintenance
                    </Button>
                  )}
                  {item.deepLinks.riskAssessment && (
                    <Link href={item.deepLinks.riskAssessment}>
                      <Button variant="outline" size="sm">
                        <Shield className="h-3.5 w-3.5 mr-1" /> Risk
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
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
                <div className="border-t pt-3 space-y-3">
                  <p className="text-sm font-medium">Override Status</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Condition</label>
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
                      <label className="text-xs text-muted-foreground">Recommendation</label>
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
                      <label className="text-xs text-muted-foreground">Notes</label>
                      <Textarea
                        value={overrideNotes}
                        onChange={(e) => setOverrideNotes(e.target.value)}
                        placeholder="Optional notes..."
                        className="h-8 text-sm resize-none"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveOverride(item.id);
                    }}
                    disabled={patchMutation.isPending}
                  >
                    Save Override
                  </Button>
                </div>
              </div>
            </TableCell>
          </TableRow>
        )}
      </Fragment>
    ));

  return (
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
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-xs text-muted-foreground">Total Items</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{summary.good}</p>
              <p className="text-xs text-muted-foreground">Good</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{summary.monitor}</p>
              <p className="text-xs text-muted-foreground">Monitor</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{summary.actionNeeded}</p>
              <p className="text-xs text-muted-foreground">Action Needed</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-2">
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
          className="h-9"
          onClick={() => recomputeMutation.mutate()}
          disabled={recomputeMutation.isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${recomputeMutation.isPending ? "animate-spin" : ""}`} />
          Recompute
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
                <div className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-muted/50">
                  <ChevronDown className="h-4 w-4" />
                  <h3 className="font-medium">{groupName}</h3>
                  <Badge variant="outline" className="text-xs">
                    {groupItems.length}
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead>Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Age</TableHead>
                        <TableHead>Warranty</TableHead>
                        <TableHead>Condition</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead className="w-8" />
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
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Warranty</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="w-8" />
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
  );
}
