'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { api } from '@/lib/api/client';
import { InventoryItem, InventoryRoom } from '@/types';
import InsuranceQuoteModal from '@/app/(dashboard)/dashboard/components/coverage/InsuranceQuoteModal';
import WhatsCoveredModal from '@/app/(dashboard)/dashboard/components/coverage/WhatsCoveredModal';
import InventoryItemDrawer from '@/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer';
import { getInventoryItem, listInventoryRooms } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { Button } from '@/components/ui/button';
import {
  EmptyStateCard,
  MobileActionRow,
  MobileCard,
  MobileKpiStrip,
  MobileKpiTile,
  MobilePageContainer,
  MobilePageIntro,
} from '@/components/mobile/dashboard/MobilePrimitives';

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

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
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

      <MobileActionRow className="rounded-2xl border border-black/10 bg-white p-1.5 w-fit">
        <Link
          href={`/dashboard/properties/${propertyId}/inventory`}
          className="rounded-xl px-3 py-2 text-sm font-medium text-black/60 hover:text-black"
        >
          Items
        </Link>
        <div className="rounded-xl border border-black/10 bg-black px-3 py-2 text-sm font-medium text-white">
          Coverage
        </div>
      </MobileActionRow>

      {loading ? (
        <MobileCard variant="compact" className="text-sm text-slate-600">
          Loading coverage summary...
        </MobileCard>
      ) : err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
      ) : (
        <>
          <MobileKpiStrip>
            <MobileKpiTile label="Total gaps" value={counts.total || 0} tone={(counts.total || 0) > 0 ? 'warning' : 'neutral'} />
            <MobileKpiTile
              label="Uncovered"
              value={counts.NO_COVERAGE || 0}
              tone={(counts.NO_COVERAGE || 0) > 0 ? 'danger' : 'neutral'}
            />
            <MobileKpiTile
              label="Partial / expired"
              value={
                (counts.WARRANTY_ONLY || 0) +
                (counts.INSURANCE_ONLY || 0) +
                (counts.EXPIRED_WARRANTY || 0) +
                (counts.EXPIRED_INSURANCE || 0)
              }
              tone="warning"
            />
          </MobileKpiStrip>

          {gaps.length === 0 ? (
            <EmptyStateCard
              title="No high-value coverage gaps"
              description="All tracked high-value items currently have coverage or no gaps were detected."
            />
          ) : (
            <div className="grid gap-3">
              {gaps.map((gap: any) => (
                <MobileCard key={gap.inventoryItemId} variant="compact" className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {gap.itemName}
                      {gap.roomName ? <span className="text-xs font-normal text-slate-500"> • {gap.roomName}</span> : null}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{gap.reasons?.join('. ') || 'Coverage gap detected'}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Exposure: ${Math.round((gap.exposureCents || 0) / 100)} {gap.currency || 'USD'} • {gap.gapType}
                    </p>
                  </div>

                  <MobileActionRow>
                    <Link
                      href={`/dashboard/properties/${propertyId}/inventory/items/${gap.inventoryItemId}/replace-repair`}
                      className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5"
                    >
                      Replace/Repair
                    </Link>

                    <Link
                      href={`/dashboard/properties/${propertyId}/inventory/items/${gap.inventoryItemId}/coverage?returnTo=${encodeURIComponent(currentPathWithQuery)}`}
                      className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5"
                    >
                      Get coverage
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
                  </MobileActionRow>
                </MobileCard>
              ))}
            </div>
          )}
        </>
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
    </MobilePageContainer>
  );
}
