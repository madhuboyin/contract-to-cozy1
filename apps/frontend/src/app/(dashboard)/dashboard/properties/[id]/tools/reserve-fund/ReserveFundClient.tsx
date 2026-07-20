// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/reserve-fund/ReserveFundClient.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  PiggyBank,
  RefreshCw,
  AlertTriangle,
  Thermometer,
  Droplets,
  Zap,
  Home,
  Wrench,
  HelpCircle,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronRight,
  Eye,
} from 'lucide-react';
import HomeToolsRail from '../../components/HomeToolsRail';
import {
  getFund,
  updateFund,
  recalculateFund,
  listLineItems,
  listContributions,
  addContribution,
  removeContribution,
  listReconciliationSuggestions,
  acceptReconciliationMatch,
  ReserveFundDTO,
  ReserveFundLineItemDTO,
  ReserveFundContributionDTO,
  ReconciliationSuggestionDTO,
  ReserveFundPosture,
} from './reserveFundApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { MobileActionRow } from '@/components/mobile/dashboard/MobilePrimitives';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import InventoryItemDrawer from '../../../../components/inventory/InventoryItemDrawer';
import { getInventoryItem, listInventoryRooms } from '../../../../inventory/inventoryApi';
import { InventoryItem, InventoryRoom } from '@/types';
import { track } from '@/lib/analytics/events';
import { PropertyContextCapturePanel } from '@/components/property-context/PropertyContextCapturePanel';
import { runTimeline } from '../capital-timeline/capitalTimelineApi';

// ─── Helpers ────────────────────────────────────────────────────────
function money(cents: number | null | undefined) {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function categoryIcon(cat: string) {
  switch (cat) {
    case 'ROOF':
    case 'EXTERIOR':
    case 'FOUNDATION':
      return <Home className="h-5 w-5" />;
    case 'HVAC':
      return <Thermometer className="h-5 w-5" />;
    case 'WATER_HEATER':
    case 'PLUMBING':
      return <Droplets className="h-5 w-5" />;
    case 'ELECTRICAL':
      return <Zap className="h-5 w-5" />;
    case 'APPLIANCE':
      return <Wrench className="h-5 w-5" />;
    default:
      return <HelpCircle className="h-5 w-5" />;
  }
}

function categoryLabel(cat: string) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function eventTypeVerb(eventType: string) {
  switch (eventType) {
    case 'REPLACE':
      return 'Replacement';
    case 'MAJOR_REPAIR':
      return 'Major repair';
    case 'INSPECTION':
      return 'Inspection';
    default:
      return categoryLabel(eventType);
  }
}

function windowLabel(startIso: string, endIso: string) {
  const s = new Date(startIso).getFullYear();
  const e = new Date(endIso).getFullYear();
  return s === e ? String(s) : `${s} – ${e}`;
}

function statusBadge(status: ReserveFundLineItemDTO['status']) {
  const base = 'text-xs font-medium px-2.5 py-1 rounded-full border shadow-sm backdrop-blur';
  switch (status) {
    case 'FUNDED':
      return <span className={`${base} border-emerald-200/70 bg-emerald-50/85 text-emerald-700`}>Funded</span>;
    case 'RETIRED':
      return <span className={`${base} border-slate-300/70 bg-slate-50/85 text-slate-600`}>Retired</span>;
    case 'OVERDUE':
      return <span className={`${base} border-red-200/70 bg-red-50/85 text-red-700`}>Overdue</span>;
    default:
      return <span className={`${base} border-teal-200/70 bg-teal-50/85 text-teal-700`}>Active</span>;
  }
}

const POSTURE_OPTIONS: { value: ReserveFundPosture; label: string; hint: string }[] = [
  { value: 'AGGRESSIVE', label: 'Aggressive', hint: 'Plans to the low end of each cost estimate — smaller monthly target, less cushion' },
  { value: 'MODERATE', label: 'Moderate', hint: 'Plans to the midpoint of each cost estimate' },
  { value: 'CONSERVATIVE', label: 'Conservative', hint: 'Plans to the high end of each cost estimate — larger monthly target, more cushion' },
];

// ─── Posture Toggle ────────────────────────────────────────────────
function PostureToggle({
  value,
  onChange,
  disabled,
}: {
  value: ReserveFundPosture;
  onChange: (p: ReserveFundPosture) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/75 p-1 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55">
        {POSTURE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            title={opt.hint}
            className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-medium transition-all disabled:opacity-50 ${
              value === opt.value
                ? 'border border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
                : 'border border-transparent text-slate-600 hover:border-slate-300/70 hover:bg-white/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900/60'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
        {POSTURE_OPTIONS.find((o) => o.value === value)?.hint}
      </p>
    </div>
  );
}

// ─── Add Contribution Form ─────────────────────────────────────────
function AddContributionForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (input: { type: 'DEPOSIT' | 'WITHDRAWAL'; amountDollars: number; note: string }) => Promise<void>;
  submitting: boolean;
}) {
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit() {
    const parsed = parseFloat(amount);
    if (!amount.trim() || isNaN(parsed) || parsed <= 0) {
      setLocalError('Enter an amount greater than $0');
      return;
    }
    setLocalError(null);
    await onSubmit({ type, amountDollars: parsed, note: note.trim() });
    setAmount('');
    setNote('');
  }

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white/60 p-3 dark:border-slate-700/50 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-full border border-slate-200/70 bg-white/70 p-0.5 text-xs dark:border-slate-700/60 dark:bg-slate-900/55">
          <button
            onClick={() => setType('DEPOSIT')}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-all ${
              type === 'DEPOSIT'
                ? 'bg-teal-600 text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Plus className="h-3 w-3" /> Deposit
          </button>
          <button
            onClick={() => setType('WITHDRAWAL')}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-all ${
              type === 'WITHDRAWAL'
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Minus className="h-3 w-3" /> Withdrawal
          </button>
        </div>
        <div className="relative w-28">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-500">
            $
          </span>
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={submitting}
            aria-label="Amount"
            className="h-9 pl-6"
          />
        </div>
        <Input
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={submitting}
          aria-label="Note"
          className="h-9 min-w-[10rem] flex-1"
        />
        <Button size="sm" onClick={handleSubmit} disabled={submitting} className="h-9 rounded-xl text-sm">
          {submitting ? 'Saving…' : 'Log'}
        </Button>
      </div>
      {localError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{localError}</p>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export default function ReserveFundClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const backHref = `/dashboard/properties/${propertyId}`;

  const [fund, setFund] = useState<ReserveFundDTO | null>(null);
  const [lineItems, setLineItems] = useState<ReserveFundLineItemDTO[]>([]);
  const [contributions, setContributions] = useState<ReserveFundContributionDTO[]>([]);
  const [suggestions, setSuggestions] = useState<ReconciliationSuggestionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contributionSubmitting, setContributionSubmitting] = useState(false);
  const [dismissedSuggestionKeys, setDismissedSuggestionKeys] = useState<Set<string>>(new Set());
  const [expandedLineItems, setExpandedLineItems] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<InventoryItem | null>(null);
  const [drawerRooms, setDrawerRooms] = useState<InventoryRoom[]>([]);
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const [showCalcExplainer, setShowCalcExplainer] = useState(false);

  async function handleViewItem(inventoryItemId: string) {
    if (!propertyId) return;
    setViewingItemId(inventoryItemId);
    try {
      const [invItem, rooms] = await Promise.all([
        getInventoryItem(propertyId, inventoryItemId),
        listInventoryRooms(propertyId),
      ]);
      setDrawerItem(invItem);
      setDrawerRooms(rooms);
      setDrawerOpen(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load item details');
    } finally {
      setViewingItemId(null);
    }
  }

  async function handleDrawerSaved() {
    setDrawerOpen(false);
    setDrawerItem(null);
    if (propertyId) {
      const refreshedLineItems = await listLineItems(propertyId);
      setLineItems(refreshedLineItems);
    }
  }

  function toggleExpand(lineItemId: string) {
    setExpandedLineItems((prev) => {
      const next = new Set(prev);
      if (next.has(lineItemId)) {
        next.delete(lineItemId);
      } else {
        next.add(lineItemId);
      }
      return next;
    });
  }

  async function load() {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      // getFund is awaited first, not raced in parallel with the rest — every one
      // of these endpoints lazily creates the fund row on first access, so firing
      // them all at once on a brand-new property had them all race to create it.
      const fundResult = await getFund(propertyId);
      const [lineItemsResult, contributionsResult, suggestionsResult] = await Promise.all([
        listLineItems(propertyId),
        listContributions(propertyId, { limit: 20 }),
        listReconciliationSuggestions(propertyId),
      ]);
      setFund(fundResult.fund);
      setLineItems(lineItemsResult);
      setContributions(contributionsResult.items);
      setSuggestions(suggestionsResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load your reserve fund');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (propertyId) {
      track('workflow_started', { tool: 'reserve-fund', propertyId, entryPoint: 'direct' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  async function handlePostureChange(posture: ReserveFundPosture) {
    if (!propertyId || !fund) return;
    setRecalculating(true);
    try {
      const updated = await updateFund(propertyId, { posture });
      setFund(updated.fund);
      const refreshedLineItems = await listLineItems(propertyId);
      setLineItems(refreshedLineItems);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update posture');
    } finally {
      setRecalculating(false);
    }
  }

  async function handleRecalculate() {
    if (!propertyId) return;
    setRecalculating(true);
    try {
      const updated = await recalculateFund(propertyId);
      setFund(updated.fund);
      const refreshedLineItems = await listLineItems(propertyId);
      setLineItems(refreshedLineItems);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to recalculate');
    } finally {
      setRecalculating(false);
    }
  }

  async function handleBuildPlan() {
    if (!propertyId) return;
    setRecalculating(true);
    setError(null);
    try {
      await runTimeline(propertyId, fund?.horizonYears ?? 10, { synchronizeReserveFund: true });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to build the reserve plan');
    } finally {
      setRecalculating(false);
    }
  }

  async function handleAddContribution(input: {
    type: 'DEPOSIT' | 'WITHDRAWAL';
    amountDollars: number;
    note: string;
  }) {
    if (!propertyId) return;
    setContributionSubmitting(true);
    try {
      const signedCents = Math.round(input.amountDollars * 100) * (input.type === 'WITHDRAWAL' ? -1 : 1);
      await addContribution(propertyId, {
        type: input.type,
        amountCents: signedCents,
        note: input.note || null,
      });
      const [updatedFund, updatedContributions] = await Promise.all([
        getFund(propertyId),
        listContributions(propertyId, { limit: 20 }),
      ]);
      setFund(updatedFund.fund);
      setContributions(updatedContributions.items);
      track('action_completed', { tool: 'reserve-fund', actionType: 'log_contribution', propertyId });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to log contribution');
    } finally {
      setContributionSubmitting(false);
    }
  }

  async function handleRemoveContribution(contributionId: string) {
    if (!propertyId) return;
    try {
      await removeContribution(propertyId, contributionId);
      const [updatedFund, updatedContributions] = await Promise.all([
        getFund(propertyId),
        listContributions(propertyId, { limit: 20 }),
      ]);
      setFund(updatedFund.fund);
      setContributions(updatedContributions.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to remove entry');
    }
  }

  async function handleAcceptSuggestion(suggestion: ReconciliationSuggestionDTO) {
    if (!propertyId) return;
    try {
      await acceptReconciliationMatch(propertyId, suggestion.lineItemId, suggestion.expenseId);
      const [refreshedLineItems, refreshedSuggestions] = await Promise.all([
        listLineItems(propertyId),
        listReconciliationSuggestions(propertyId),
      ]);
      setLineItems(refreshedLineItems);
      setSuggestions(refreshedSuggestions);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to confirm match');
    }
  }

  function dismissSuggestion(suggestion: ReconciliationSuggestionDTO) {
    // Client-side only — see the Phase 1 note in homeReserveFundReconciliation.service.ts;
    // this suggestion will resurface on next visit until accepted or no longer matches.
    setDismissedSuggestionKeys((prev) => new Set(prev).add(`${suggestion.lineItemId}:${suggestion.expenseId}`));
  }

  const activeLineItems = lineItems.filter((li) => li.status === 'ACTIVE');
  const otherLineItems = lineItems.filter((li) => li.status !== 'ACTIVE');
  const visibleSuggestions = suggestions.filter(
    (s) => !dismissedSuggestionKeys.has(`${s.lineItemId}:${s.expenseId}`)
  );
  // No Capital Timeline items → recommendedMonthlyContributionCents and
  // currentShortfallCents are both 0 because there's nothing to compute from,
  // not because the homeowner is actually on track. Render that as a distinct
  // "no data" state instead of the reassuring green "$0/mo · You're covered"
  // cards, which would otherwise look identical to a genuinely funded property.
  const hasTimelineData = activeLineItems.length > 0;
  const contextInventoryItemId = activeLineItems.find(({ timelineItem }) => {
    const item = timelineItem.inventoryItem;
    return timelineItem.inventoryItemId && item && (
      item.condition === 'UNKNOWN' || (!item.installedOn && !item.purchasedOn)
    );
  })?.timelineItem.inventoryItemId ?? null;
  const propertyContextOperationInput = React.useMemo(
    () => contextInventoryItemId ? { inventoryItemId: contextInventoryItemId } : {},
    [contextInventoryItemId],
  );

  const targetTotalCents = activeLineItems.reduce((sum, li) => sum + li.targetCostCents, 0);
  const progressPct =
    targetTotalCents > 0 && fund
      ? Math.max(0, Math.min(100, (fund.currentBalanceCents / targetTotalCents) * 100))
      : 0;

  return (
    <ToolWorkspaceTemplate
      backHref={backHref}
      backLabel="Back to property"
      eyebrow="Home tool"
      title="Reserve Fund Planner"
      subtitle="Turn your Capital Timeline into a monthly savings target."
      trust={{
        confidenceLabel: fund ? `Sourced from your Capital Timeline` : 'Run your Capital Timeline first',
        freshnessLabel: fund?.lastRecalculatedAt
          ? `Last recalculated ${new Date(fund.lastRecalculatedAt).toLocaleDateString()}`
          : 'Not yet calculated',
        sourceLabel: 'Home Capital Timeline — the only forecast engine on this platform rated safe for financial planning',
        rationale: 'Converts dated, cost-ranged capital events into a smoothed monthly contribution target and a near-term shortfall figure.',
      }}
      rail={(
        <div className="space-y-3">
          <HomeToolsRail propertyId={propertyId} context="reserve-fund" currentToolId="reserve-fund" />
          <MobileActionRow className="justify-between">
            {fund && (
              <PostureToggle value={fund.posture} onChange={handlePostureChange} disabled={recalculating} />
            )}
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-slate-300/70 bg-white/85 px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-white disabled:opacity-50 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              <RefreshCw className={`h-4 w-4 ${recalculating ? 'animate-spin' : ''}`} />
              Recalculate
            </button>
          </MobileActionRow>
        </div>
      )}
    >
      <PropertyContextCapturePanel
        propertyId={propertyId}
        featureKey="RESERVE_FUND"
        operationKey="RECALCULATE"
        operationInput={propertyContextOperationInput}
        onCaptured={handleBuildPlan}
      />
      {loading && !fund && (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-white/70 bg-white/65 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/45">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-900 dark:border-slate-100" />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/85 p-4 backdrop-blur">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-800">{error}</p>
            <button onClick={() => load()} className="mt-2 text-sm font-medium text-red-600 hover:text-red-800">
              Try again
            </button>
          </div>
        </div>
      )}

      {fund && !loading && (
        <>
          {/* Summary Card */}
          <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl sm:p-6 dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/50">
                <PiggyBank className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium tracking-normal text-slate-500 dark:text-slate-300">
                  Current balance
                </p>
                <p className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {money(fund.currentBalanceCents)}
                </p>
                {targetTotalCents > 0 && (
                  <div className="mt-2">
                    <Progress value={progressPct} className="h-2" />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {progressPct.toFixed(0)}% of {money(targetTotalCents)} total target across open items
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {hasTimelineData ? (
                <div className="rounded-2xl border border-teal-200/70 bg-teal-50/80 px-4 py-3 shadow-sm backdrop-blur dark:border-teal-700/60 dark:bg-teal-900/30">
                  <p className="text-xs font-medium tracking-normal text-teal-700 dark:text-teal-400">
                    Recommended monthly set-aside
                  </p>
                  <p className="mt-1 text-2xl font-bold text-teal-700 dark:text-teal-300">
                    {money(fund.recommendedMonthlyContributionCents)}
                    <span className="ml-0.5 text-sm font-normal">/mo</span>
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-800/40">
                  <p className="text-xs font-medium tracking-normal text-slate-500 dark:text-slate-400">
                    Recommended monthly set-aside
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-400 dark:text-slate-500">
                    No data yet
                  </p>
                </div>
              )}
              {hasTimelineData ? (
                <div
                  className={`rounded-2xl border px-4 py-3 shadow-sm backdrop-blur ${
                    fund.currentShortfallCents > 0
                      ? 'border-red-200/70 bg-red-50/80 dark:border-red-700/60 dark:bg-red-900/20'
                      : 'border-emerald-200/70 bg-emerald-50/80 dark:border-emerald-700/60 dark:bg-emerald-900/20'
                  }`}
                >
                  <p
                    className={`text-xs font-medium tracking-normal ${
                      fund.currentShortfallCents > 0
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {fund.currentShortfallCents > 0 ? 'Near-term shortfall (next 6 months)' : 'No near-term shortfall'}
                  </p>
                  <p
                    className={`mt-1 text-2xl font-bold ${
                      fund.currentShortfallCents > 0
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {fund.currentShortfallCents > 0 ? money(fund.currentShortfallCents) : "You're covered"}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-800/40">
                  <p className="text-xs font-medium tracking-normal text-slate-500 dark:text-slate-400">
                    Near-term shortfall
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-400 dark:text-slate-500">
                    No data yet
                  </p>
                </div>
              )}
            </div>
            {!hasTimelineData && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  These figures are blank, not zero. Build the timeline here to generate a real target.
                </p>
                <Button type="button" size="sm" onClick={handleBuildPlan} disabled={recalculating}>
                  Build reserve plan
                </Button>
              </div>
            )}
            {hasTimelineData && (
              <>
                <button
                  onClick={() => setShowCalcExplainer((v) => !v)}
                  className="mt-3 -ml-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-2 text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  {showCalcExplainer ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  How is this calculated?
                </button>
                {showCalcExplainer && (
                  <div className="mt-1 rounded-xl border border-white/70 bg-white/72 p-3 text-xs leading-relaxed text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300">
                    <p>
                      Based on your{' '}
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {POSTURE_OPTIONS.find((o) => o.value === fund.posture)?.label}
                      </span>{' '}
                      posture — {POSTURE_OPTIONS.find((o) => o.value === fund.posture)?.hint.toLowerCase()}.
                    </p>
                    <p className="mt-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        Recommended monthly set-aside
                      </span>{' '}
                      is the sum of (estimated cost ÷ months until due) for every active item due more than 6
                      months from now — a smoothed monthly rate per item, added together.
                    </p>
                    <p className="mt-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        Near-term shortfall
                      </span>{' '}
                      covers items due within the next 6 months. There isn&apos;t enough runway to smooth these
                      into a monthly rate, so each item&apos;s cost — minus your proportional share of the
                      current balance — is shown as a lump sum instead.
                    </p>
                    <p className="mt-2 text-slate-400 dark:text-slate-500">
                      Both figures update when you recalculate, change posture, or your Capital Timeline changes.
                    </p>
                  </div>
                )}
              </>
            )}
            {fund.disclaimer && (
              <p className="mt-4 border-t border-slate-200/70 pt-3 text-xs leading-relaxed text-slate-500 dark:border-slate-700/70 dark:text-slate-400">
                {fund.disclaimer}
              </p>
            )}
          </div>

          {/* Reconciliation suggestions */}
          {visibleSuggestions.length > 0 && (
            <div className="space-y-2">
              {visibleSuggestions.map((s) => {
                const li = lineItems.find((item) => item.id === s.lineItemId);
                const itemLabel = categoryLabel(s.category);
                return (
                  <div
                    key={`${s.lineItemId}:${s.expenseId}`}
                    className="flex items-start gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4 shadow-sm backdrop-blur dark:border-amber-700/50 dark:bg-amber-900/20"
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                        Looks like this covers your {itemLabel} reserve
                      </p>
                      <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                        &ldquo;{s.expenseDescription}&rdquo; for {money(Math.round(s.expenseAmount * 100))} on{' '}
                        {new Date(s.expenseDate).toLocaleDateString()} — mark the {itemLabel} line item retired?
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleAcceptSuggestion(s)}
                          className="h-8 rounded-xl text-xs"
                        >
                          Mark retired
                        </Button>
                        <button
                          onClick={() => dismissSuggestion(s)}
                          className="inline-flex h-8 items-center gap-1 rounded-xl px-2 text-xs font-medium text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                        >
                          <X className="h-3 w-3" /> Not a match
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Line items */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              What you&apos;re saving for
            </p>
            {activeLineItems.length === 0 ? (
              <div className="rounded-2xl border border-white/70 bg-white/70 p-8 text-center shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
                <PiggyBank className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-500" />
                <h3 className="mb-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                  Nothing to save for yet
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Build from your current inventory and planning assumptions without leaving this page.
                </p>
                <Button type="button" className="mt-4" onClick={handleBuildPlan} disabled={recalculating}>
                  {recalculating ? 'Building plan…' : 'Build reserve plan'}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {activeLineItems.map((li) => {
                  const isExpanded = expandedLineItems.has(li.id);
                  const itemName = li.timelineItem.inventoryItem?.name || categoryLabel(li.timelineItem.category);
                  const hasCostRange =
                    li.timelineItem.estimatedCostMinCents != null && li.timelineItem.estimatedCostMaxCents != null;
                  const isInMonthlyBucket = li.allocatedMonthlyCents > 0;
                  return (
                    <div
                      key={li.id}
                      className="overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38"
                    >
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 rounded-xl border border-white/70 bg-white/75 p-2 text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300">
                            {categoryIcon(li.timelineItem.category)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {itemName}
                                </h3>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                  {eventTypeVerb(li.timelineItem.eventType)} due{' '}
                                  {windowLabel(li.timelineItem.windowStart, li.timelineItem.windowEnd)}
                                </p>
                              </div>
                              {statusBadge(li.status)}
                            </div>
                            <div className="mt-2 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-6">
                              <div>
                                <span className="text-slate-500 dark:text-slate-300">Target: </span>
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  {money(li.targetCostCents)}
                                </span>
                              </div>
                              {li.allocatedMonthlyCents > 0 && (
                                <div>
                                  <span className="text-slate-500 dark:text-slate-300">Set aside: </span>
                                  <span className="font-medium text-teal-700 dark:text-teal-400">
                                    {money(li.allocatedMonthlyCents)}/mo
                                  </span>
                                </div>
                              )}
                              {hasCostRange && (
                                <div>
                                  <span className="text-slate-500 dark:text-slate-300">Est. cost: </span>
                                  <span className="font-medium text-slate-900 dark:text-slate-100">
                                    {money(li.timelineItem.estimatedCostMinCents)} &ndash;{' '}
                                    {money(li.timelineItem.estimatedCostMaxCents)}
                                  </span>
                                </div>
                              )}
                            </div>
                            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                              {isInMonthlyBucket
                                ? 'Counted in Recommended monthly set-aside'
                                : 'Counted in Near-term shortfall'}
                            </p>
                            <div className="mt-2 -ml-2 flex flex-wrap items-center gap-1">
                              <button
                                onClick={() => toggleExpand(li.id)}
                                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-2 text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                                Why this estimate?
                              </button>
                              {li.timelineItem.inventoryItemId && (
                                <button
                                  onClick={() => handleViewItem(li.timelineItem.inventoryItemId as string)}
                                  disabled={viewingItemId === li.timelineItem.inventoryItemId}
                                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-2 text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  {viewingItemId === li.timelineItem.inventoryItemId ? 'Loading…' : 'View details'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-4 pb-4">
                          <div className="rounded-xl border border-white/70 bg-white/72 p-3 text-xs leading-relaxed text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300">
                            {li.timelineItem.why}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {otherLineItems.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                  {otherLineItems.length} retired item{otherLineItems.length === 1 ? '' : 's'}
                </summary>
                <div className="mt-2 space-y-1.5">
                  {otherLineItems.map((li) => (
                    <div
                      key={li.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2 text-xs dark:border-slate-700/50 dark:bg-slate-900/40"
                    >
                      <span className="text-slate-600 dark:text-slate-300">
                        {li.timelineItem.inventoryItem?.name || categoryLabel(li.timelineItem.category)}
                      </span>
                      {statusBadge(li.status)}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Contribution ledger */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Contribution ledger
            </p>
            <div className="space-y-3 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <AddContributionForm onSubmit={handleAddContribution} submitting={contributionSubmitting} />

              {contributions.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                  No deposits or withdrawals logged yet. This balance is self-reported — there&apos;s no bank
                  connection, so log it here whenever it changes.
                </p>
              ) : (
                <div className="divide-y divide-slate-100/60 dark:divide-slate-800/40">
                  {contributions.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {c.amountCents >= 0 ? '+' : ''}
                          {money(c.amountCents)}
                          <span className="ml-1.5 text-xs font-normal text-slate-400 dark:text-slate-500">
                            {c.type === 'DEPOSIT' ? 'Deposit' : c.type === 'WITHDRAWAL' ? 'Withdrawal' : 'Correction'}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(c.occurredAt).toLocaleDateString()}
                          {c.note ? ` · ${c.note}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveContribution(c.id)}
                        aria-label="Remove entry"
                        className="flex-shrink-0 rounded-full p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <InventoryItemDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerItem(null);
        }}
        propertyId={propertyId}
        rooms={drawerRooms}
        initialItem={drawerItem}
        onSaved={handleDrawerSaved}
      />
    </ToolWorkspaceTemplate>
  );
}
