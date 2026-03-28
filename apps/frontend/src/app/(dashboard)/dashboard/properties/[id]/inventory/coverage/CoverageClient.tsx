'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { api } from '@/lib/api/client';
import { recordGuidanceToolStatus } from '@/lib/api/guidanceApi';
import { InventoryItem, InventoryRoom } from '@/types';
import { formatEnumLabel } from '@/lib/utils/formatters';
import InsuranceQuoteModal from '@/app/(dashboard)/dashboard/components/coverage/InsuranceQuoteModal';
import WhatsCoveredModal from '@/app/(dashboard)/dashboard/components/coverage/WhatsCoveredModal';
import InventoryItemDrawer from '@/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer';
import { getInventoryItem, listInventoryRooms } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { Button } from '@/components/ui/button';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  CompactEntityRow,
  EmptyStateCard,
  MobileFilterStack,
  MobilePageIntro,
  MobileToolWorkspace,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { GuidanceInlinePanel } from '@/components/guidance/GuidanceInlinePanel';

export default function CoverageClient({ propertyId }: { propertyId: string }) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPathWithQuery = React.useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [data, setData] = React.useState<any>(null);
  const [rooms, setRooms] = React.useState<InventoryRoom[]>([]);

  const guidanceJourneyId = searchParams.get('guidanceJourneyId') ?? undefined;
  const guidanceStepKey = searchParams.get('guidanceStepKey') ?? undefined;
  const [guidanceProgressing, setGuidanceProgressing] = React.useState(false);
  const [guidanceProgressRecorded, setGuidanceProgressRecorded] = React.useState(false);
  const [guidanceProofCompleted, setGuidanceProofCompleted] = React.useState(false);

  const [quoteOpen, setQuoteOpen] = React.useState(false);
  const [coveredOpen, setCoveredOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<any>(null);
  const [editingItem, setEditingItem] = React.useState<InventoryItem | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [openingItemId, setOpeningItemId] = React.useState<string | null>(null);

  async function refreshCoverageOnly() {
    const response = await api.get(`/api/properties/${propertyId}/inventory/coverage-gaps`);
    setData(response.data);
  }

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const [coverageRes, roomsRes] = await Promise.allSettled([
          api.get(`/api/properties/${propertyId}/inventory/coverage-gaps`),
          listInventoryRooms(propertyId),
        ]);

        if (cancelled) return;

        if (coverageRes.status === 'fulfilled') {
          setData(coverageRes.value.data);
        } else {
          const e: any = coverageRes.reason;
          setErr(e?.message || 'Failed to load coverage summary');
        }

        if (roomsRes.status === 'fulfilled') {
          setRooms(roomsRes.value);
        } else {
          setRooms([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const gaps = data?.gaps || [];
  const counts = data?.counts || {};

  async function handleViewItem(itemId: string) {
    setOpeningItemId(itemId);
    try {
      const item = await getInventoryItem(propertyId, itemId);
      setEditingItem(item);
      setDrawerOpen(true);
    } catch (e) {
      console.error('[CoverageClient] failed to open item from coverage', e);
      alert('Unable to open this item from coverage. Please try again.');
    } finally {
      setOpeningItemId(null);
    }
  }

  async function handleGuidanceProgress() {
    if (!propertyId || !guidanceStepKey) return;
    setGuidanceProgressing(true);
    try {
      await recordGuidanceToolStatus(propertyId, {
        stepKey: guidanceStepKey,
        journeyId: guidanceJourneyId,
        sourceToolKey: 'coverage-options',
        status: 'IN_PROGRESS',
        producedData: {
          proofType: 'progress_checkpoint',
          proofId: `${guidanceStepKey}:coverage-progress`,
          progressNotedAt: new Date().toISOString(),
        },
      });
      setGuidanceProgressRecorded(true);
    } catch (e) {
      console.error('[CoverageClient] failed to record guidance progress', e);
    } finally {
      setGuidanceProgressing(false);
    }
  }

  React.useEffect(() => {
    if (!propertyId || !guidanceStepKey || !guidanceJourneyId) return;
    const total = Number(data?.counts?.total ?? 0);
    if (guidanceProofCompleted || Number.isNaN(total) || total > 0) return;

    let cancelled = false;
    (async () => {
      try {
        await recordGuidanceToolStatus(propertyId, {
          stepKey: guidanceStepKey,
          journeyId: guidanceJourneyId,
          sourceToolKey: 'coverage-options',
          status: 'COMPLETED',
          producedData: {
            proofType: 'coverage_gap_snapshot',
            proofId: `coverage-gaps:${propertyId}`,
            totalCoverageGaps: total,
            capturedAt: new Date().toISOString(),
          },
        });
        if (!cancelled) setGuidanceProofCompleted(true);
      } catch (error) {
        console.error('[CoverageClient] failed to auto-complete proof-backed step', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data?.counts?.total, guidanceJourneyId, guidanceProofCompleted, guidanceStepKey, propertyId]);

  return (
    <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10"
      intro={
        <div className="space-y-2">
          <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
            <Link href={`/dashboard/properties/${propertyId}/inventory`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to inventory
            </Link>
          </Button>
          <MobilePageIntro
            eyebrow="Inventory"
            title="Coverage"
            subtitle="Review high-value items missing warranty or insurance coverage."
          />
        </div>
      }
      summary={
        <ResultHeroCard
          title="Coverage Gaps"
          value={counts.total || 0}
          status={<StatusChip tone={(counts.total || 0) > 0 ? 'elevated' : 'good'}>{(counts.NO_COVERAGE || 0) > 0 ? 'Needs action' : 'Stable'}</StatusChip>}
          summary={`${counts.NO_COVERAGE || 0} uncovered • ${
            (counts.WARRANTY_ONLY || 0) +
            (counts.INSURANCE_ONLY || 0) +
            (counts.EXPIRED_WARRANTY || 0) +
            (counts.EXPIRED_INSURANCE || 0)
          } partial / expired`}
        />
      }
      filters={
        <MobileFilterStack
          primaryFilters={
            <>
              <Link
                href={`/dashboard/properties/${propertyId}/inventory`}
                className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-black/10 px-3 text-sm font-medium text-black/70 hover:text-black"
              >
                Items
              </Link>
              <div className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-black bg-black px-3 text-sm font-medium text-white">
                Coverage
              </div>
            </>
          }
        />
      }
      footer={<BottomSafeAreaReserve size="chatAware" />}
    >
      <GuidanceInlinePanel
        propertyId={propertyId}
        title="Coverage Gap Next Steps"
        subtitle="Resolve missing policy context before making execution decisions."
        issueDomains={['INSURANCE', 'FINANCIAL'] as const}
        limit={2}
        compact
      />

      {guidanceStepKey && (
        <div className="rounded-2xl border border-black/10 bg-white p-4 space-y-2">
          <p className="text-sm font-medium">Guidance Step</p>
          <p className="text-sm text-muted-foreground">
            {guidanceProofCompleted
              ? 'Proof-backed completion recorded from current coverage state. Return to your guidance journey.'
              : 'Completion is proof-based. Update policy/documents in the linked tools to complete this step automatically.'}
          </p>
          {!guidanceProofCompleted && (
            <Button
              className="min-h-[44px] w-full mt-1"
              onClick={handleGuidanceProgress}
              disabled={guidanceProgressing}
            >
              {guidanceProgressing
                ? 'Saving...'
                : guidanceProgressRecorded
                  ? 'Progress recorded'
                  : 'Record progress'}
            </Button>
          )}
        </div>
      )}

      {loading ? (
        <ScenarioInputCard title="Loading" subtitle="Loading coverage summary..." badge={<StatusChip tone="info">Please wait</StatusChip>}>
          <p className="text-sm text-slate-600">Coverage analysis is syncing.</p>
        </ScenarioInputCard>
      ) : err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
      ) : gaps.length === 0 ? (
        <EmptyStateCard
          title="No high-value coverage gaps"
          description="All tracked high-value items currently have coverage or no gaps were detected."
        />
      ) : (
        <ScenarioInputCard title="Priority Items" subtitle="Resolve uncovered or partially covered inventory first.">
          <div className="space-y-3">
            {gaps.map((gap: any) => {
              const gapTypeLabel = formatEnumLabel(gap.gapType) || 'Coverage Gap';
              return (
              <div key={gap.inventoryItemId} className="space-y-2.5 rounded-xl border border-black/10 p-2.5">
                <CompactEntityRow
                  title={gap.itemName}
                  subtitle={gap.reasons?.join('. ') || 'Coverage gap detected'}
                  meta={gap.roomName ? `${gap.roomName} • ${gapTypeLabel}` : gapTypeLabel}
                  status={<StatusChip tone={gap.gapType === 'NO_COVERAGE' ? 'danger' : 'elevated'}>{gapTypeLabel}</StatusChip>}
                />
                <ActionPriorityRow
                  primaryAction={
                    <Link
                      href={`/dashboard/properties/${propertyId}/inventory/items/${gap.inventoryItemId}/coverage?returnTo=${encodeURIComponent(currentPathWithQuery)}`}
                      className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-black bg-black px-3 text-sm text-white hover:bg-black/90"
                    >
                      Get coverage
                    </Link>
                  }
                  secondaryActions={
                    <>
                      <Link
                        href={`/dashboard/properties/${propertyId}/inventory/items/${gap.inventoryItemId}/replace-repair`}
                        className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5"
                      >
                        Replace/Repair
                      </Link>
                      <button
                        onClick={() => handleViewItem(gap.inventoryItemId)}
                        disabled={openingItemId === gap.inventoryItemId}
                        className="min-h-[40px] rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5 disabled:opacity-60"
                      >
                        {openingItemId === gap.inventoryItemId ? 'Opening...' : 'View'}
                      </button>
                      <button
                        onClick={() => {
                          setSelected(gap);
                          setQuoteOpen(true);
                        }}
                        className="min-h-[40px] rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5"
                      >
                        Quotes
                      </button>
                      <button
                        onClick={() => {
                          setSelected(gap);
                          setCoveredOpen(true);
                        }}
                        className="min-h-[40px] rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5"
                      >
                        Info
                      </button>
                    </>
                  }
                />
              </div>
              );
            })}
          </div>
        </ScenarioInputCard>
      )}

      <InsuranceQuoteModal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        apiBase={apiBase}
        propertyId={propertyId}
        gapType={selected?.gapType}
        inventoryItem={
          selected
            ? {
                id: selected.inventoryItemId,
                name: selected.itemName,
                replacementCostCents: selected.exposureCents,
                currency: selected.currency,
              }
            : undefined
        }
      />

      {selected?.inventoryItemId ? (
        <WhatsCoveredModal
          open={coveredOpen}
          onClose={() => setCoveredOpen(false)}
          apiBase={apiBase}
          propertyId={propertyId}
          itemId={selected.inventoryItemId}
        />
      ) : null}

      <InventoryItemDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        propertyId={propertyId}
        rooms={rooms}
        initialItem={editingItem}
        onSaved={async () => {
          setDrawerOpen(false);
          await refreshCoverageOnly();
        }}
      />
    </MobileToolWorkspace>
  );
}
