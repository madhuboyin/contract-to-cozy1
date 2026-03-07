'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import type { RecallMatchDTO, RecallResolutionType } from '@/types/recalls.types';
import {
  confirmRecallMatch,
  dismissRecallMatch,
  listPropertyRecalls,
  resolveRecallMatch,
} from './recallsApi';

import RecallMatchCard from '@/app/(dashboard)/dashboard/components/recalls/RecallMatchCard';
import { Button } from '@/components/ui/button';
import {
  EmptyStateCard,
  MobileActionRow,
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

export default function RecallAlertsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const searchParams = useSearchParams();
  const highlightId = searchParams.get('matchId');

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RecallMatchDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listPropertyRecalls(propertyId);
      if (res) {
        setRows(res.matches || []);
      } else {
        setRows([]);
      }
    } catch (e: any) {
      console.error('Recall Load Error:', e);
      setError(e?.message || 'Failed to load recall alerts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const counts = useMemo(() => {
    const c = { open: 0, confirm: 0, resolved: 0, dismissed: 0 };
    for (const row of rows) {
      if (row.status === 'OPEN') c.open++;
      if (row.status === 'NEEDS_CONFIRMATION') c.confirm++;
      if (row.status === 'RESOLVED') c.resolved++;
      if (row.status === 'DISMISSED') c.dismissed++;
    }
    return c;
  }, [rows]);

  async function onConfirm(matchId: string) {
    await confirmRecallMatch(propertyId, matchId);
    await refresh();
  }

  async function onDismiss(matchId: string) {
    await dismissRecallMatch(propertyId, matchId);
    await refresh();
  }

  async function onResolve(matchId: string, payload: { resolutionType: RecallResolutionType; resolutionNotes?: string }) {
    await resolveRecallMatch({ propertyId, matchId, ...payload });
    await refresh();
  }

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to property
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow="Safety"
        title="Recall & Safety Alerts"
        subtitle="Inventory-linked recall matches and guided resolution actions."
      />

      <MobileFilterSurface>
        <MobileActionRow>
          <StatusChip tone={counts.open > 0 ? 'danger' : 'good'}>Open: {counts.open}</StatusChip>
          <StatusChip tone={counts.confirm > 0 ? 'elevated' : 'info'}>Needs confirmation: {counts.confirm}</StatusChip>
          <StatusChip tone="good">Resolved: {counts.resolved}</StatusChip>
          <StatusChip tone="info">Dismissed: {counts.dismissed}</StatusChip>
        </MobileActionRow>

        <Button variant="outline" className="min-h-[44px]" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </MobileFilterSurface>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading...</div>
      ) : rows.length === 0 ? (
        <EmptyStateCard
          title="No recall alerts"
          description="No open recall matches were found for this property inventory."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((match) => (
            <RecallMatchCard
              key={match.id}
              match={match}
              highlighted={highlightId === match.id}
              onConfirm={onConfirm}
              onDismiss={onDismiss}
              onResolve={onResolve}
            />
          ))}
        </div>
      )}
    </MobilePageContainer>
  );
}
