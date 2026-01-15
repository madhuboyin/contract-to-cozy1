// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/recalls/RecallAlertsClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import { SectionHeader } from '../../../components/SectionHeader';
import type { RecallMatchDTO, RecallResolutionType } from '@/types/recalls.types';
import {
  confirmRecallMatch,
  dismissRecallMatch,
  listPropertyRecalls,
  resolveRecallMatch,
} from './recallsApi';

import RecallMatchCard from '@/app/(dashboard)/dashboard/components/recalls/RecallMatchCard';

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
      // Add a null check for 'res'
      if (res) {
        setRows(res.matches || []); 
      } else {
        setRows([]);
      }
    } catch (e: any) {
      console.error("Recall Load Error:", e);
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
    for (const r of rows) {
      if (r.status === 'OPEN') c.open++;
      if (r.status === 'NEEDS_CONFIRMATION') c.confirm++;
      if (r.status === 'RESOLVED') c.resolved++;
      if (r.status === 'DISMISSED') c.dismissed++;
    }
    return c;
  }, [rows]);

  async function onConfirm(matchId: string) {
    await confirmRecallMatch(propertyId as string, matchId);
    await refresh();
  }

  async function onDismiss(matchId: string) {
    await dismissRecallMatch(propertyId as string, matchId);
    await refresh();
  }

  async function onResolve(matchId: string, payload: { resolutionType: RecallResolutionType; resolutionNotes?: string }) {
    await resolveRecallMatch({ propertyId: propertyId as string, matchId, ...payload });
    await refresh();
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon="⚠️"
        title="Recall & Safety Alerts"
        description="We scan your home inventory for safety recalls and create actions to help you resolve them."
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-slate-200 bg-white px-2 py-1">
          OPEN: <span className="font-semibold">{counts.open}</span>
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-1">
          NEEDS CONFIRMATION: <span className="font-semibold">{counts.confirm}</span>
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-1">
          RESOLVED: <span className="font-semibold">{counts.resolved}</span>
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-1">
          DISMISSED: <span className="font-semibold">{counts.dismissed}</span>
        </span>

        <button
          className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-60"
          onClick={refresh}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          No recall alerts found for this property.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <RecallMatchCard
              key={m.id}
              match={m}
              highlighted={highlightId === m.id}
              onConfirm={onConfirm}
              onDismiss={onDismiss}
              onResolve={onResolve}
            />
          ))}
        </div>
      )}
    </div>
  );
}
