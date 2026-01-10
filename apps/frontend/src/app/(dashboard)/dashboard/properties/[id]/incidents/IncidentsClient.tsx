// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/incidents/IncidentsClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { SectionHeader } from '../../../components/SectionHeader';
import { listIncidents } from './incidentsApi';
import type { IncidentDTO, IncidentStatus } from '@/types/incidents.types';
import IncidentCard from '@/app/(dashboard)/dashboard/components/incidents/IncidentCard';

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

  // ✅ Keep filters consistent:
  // - If user selects "Suppressed", we must include suppressed or list will appear empty.
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
      
      // ✅ FIX: Added optional chaining and nullish coalescing to ensure we never 
      // set items to anything other than an array, even if the API structure changes.
      setItems(res?.items ?? []);
    } catch (e: any) {
      // ✅ Better error extraction for Axios/API responses
      const errorMessage = e?.response?.data?.message || e?.message || 'Failed to load incidents';
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

  const headerRight = useMemo(() => {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-lg border bg-white px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={includeSuppressed}
            onChange={(e) => setIncludeSuppressed(e.target.checked)}
          />
          Include suppressed
        </label>

        <button
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    );
  }, [status, includeSuppressed, loading]);

  return (
    <div className="space-y-4">
      <SectionHeader
        icon="⚠️"
        title="Incidents"
        // ✅ FIX: Added optional chaining here to prevent crash if items is momentarily null
        description={items?.length ? `${items.length} shown` : undefined}
        action={headerRight}
      />

      {err ? (
        <div className="rounded-xl border bg-red-50 p-3 text-sm text-red-700">{err}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">Loading…</div>
      ) : items && items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {items.map((i) => (
            // ✅ Important: pass propertyId so IncidentCard can link to detail route
            <IncidentCard key={i.id} incident={i} propertyId={propertyId} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">
          No incidents found.
        </div>
      )}
    </div>
  );
}