'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { listIncidents } from './incidentsApi';
import type { IncidentDTO, IncidentStatus } from '@/types/incidents.types';
import IncidentCard from '@/app/(dashboard)/dashboard/components/incidents/IncidentCard';
import { Button } from '@/components/ui/button';
import {
  EmptyStateCard,
  MobileActionRow,
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

const STATUS_OPTIONS: Array<{ label: string; value: IncidentStatus | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Actioned', value: 'ACTIONED' },
  { label: 'Suppressed', value: 'SUPPRESSED' },
  { label: 'Resolved', value: 'RESOLVED' },
];

export default function IncidentsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [status, setStatus] = useState<IncidentStatus | 'ALL'>('ACTIVE');
  const [includeSuppressed, setIncludeSuppressed] = useState(false);

  const [items, setItems] = useState<IncidentDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'SUPPRESSED' && !includeSuppressed) {
      setIncludeSuppressed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const res = await listIncidents({
        propertyId,
        status: status === 'ALL' ? undefined : status,
        includeSuppressed,
        limit: 30,
      });
      setItems(res?.items ?? []);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to load incidents';
      setErr(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (propertyId) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, status, includeSuppressed]);

  const openCount = useMemo(() => items.filter((item) => item.status === 'ACTIVE').length, [items]);

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to property
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow="Incidents"
        title="Incidents"
        subtitle="Track active risk signals, actions, and resolution status."
      />

      <MobileFilterSurface>
        <MobileActionRow>
          <select
            className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as IncidentStatus | 'ALL')}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0"
              checked={includeSuppressed}
              onChange={(e) => setIncludeSuppressed(e.target.checked)}
            />
            Include suppressed
          </label>

          <Button variant="outline" className="min-h-[44px]" onClick={load} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </MobileActionRow>

        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="info">{items.length} shown</StatusChip>
          <StatusChip tone={openCount > 0 ? 'elevated' : 'good'}>{openCount} active</StatusChip>
        </div>
      </MobileFilterSurface>

      {err ? (
        <div className="rounded-xl border bg-red-50 p-3 text-sm text-red-700">{err}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">Loading...</div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {items.map((incident) => (
            <IncidentCard key={incident.id} incident={incident} propertyId={propertyId} />
          ))}
        </div>
      ) : (
        <EmptyStateCard title="No incidents found" description="Try adjusting status filters or include suppressed items." />
      )}
    </MobilePageContainer>
  );
}
