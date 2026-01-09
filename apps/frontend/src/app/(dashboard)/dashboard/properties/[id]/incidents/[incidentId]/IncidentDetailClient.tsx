// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/incidents/[incidentId]/IncidentDetailClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { SectionHeader } from '../../../../components/SectionHeader';
import type { IncidentDTO, IncidentEventDTO } from '@/types/incidents.types';
import { getIncident, listIncidentEvents, evaluateIncidentNow, orchestrateIncidentNow } from '../incidentsApi';

import IncidentSeverityBadge from '@/app/(dashboard)/dashboard/components/incidents/IncidentSeverityBadge';
import IncidentStatusBadge from '@/app/(dashboard)/dashboard/components/incidents/IncidentStatusBadge';
import IncidentActionsPanel from '@/app/(dashboard)/dashboard/components/incidents/IncidentActionsPanel';
import IncidentEventsPanel from '@/app/(dashboard)/dashboard/components/incidents/IncidentEventsPanel';

export default function IncidentDetailClient() {
  const params = useParams<{ id: string; incidentId: string }>();
  const propertyId = params.id;
  const incidentId = params.incidentId;

  const [incident, setIncident] = useState<IncidentDTO | null>(null);
  const [events, setEvents] = useState<IncidentEventDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const [i, e] = await Promise.all([getIncident(incidentId), listIncidentEvents(incidentId, 50)]);
      setIncident(i);
      setEvents(e.items ?? []);
    } catch (ex: any) {
      setErr(ex?.message ?? 'Failed to load incident');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  const right = useMemo(() => {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          disabled={loading}
          onClick={async () => {
            await evaluateIncidentNow(incidentId);
            await load();
          }}
        >
          Re-evaluate
        </button>
        <button
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          disabled={loading}
          onClick={async () => {
            await orchestrateIncidentNow(incidentId);
            await load();
          }}
        >
          Re-orchestrate
        </button>
        <button
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          disabled={loading}
          onClick={load}
        >
          Refresh
        </button>
      </div>
    );
  }, [incidentId, loading]);

  if (loading && !incident) {
    return (
      <div className="space-y-4">
        <SectionHeader icon="⚠️" title="Incident" action={right} />
        <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader icon="⚠️" title="Incident" action={right} />

      {err ? <div className="rounded-xl border bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      {incident ? (
        <>
          <div className="rounded-xl border bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{incident.title}</h2>
                {incident.summary ? <p className="mt-1 text-sm text-slate-700">{incident.summary}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="rounded-md bg-slate-50 px-2 py-1">Type: {incident.typeKey}</span>
                  {incident.category ? <span className="rounded-md bg-slate-50 px-2 py-1">Cat: {incident.category}</span> : null}
                  <span className="rounded-md bg-slate-50 px-2 py-1">Source: {incident.sourceType}</span>
                  {incident.severityScore != null ? (
                    <span className="rounded-md bg-slate-50 px-2 py-1">Score: {incident.severityScore}</span>
                  ) : null}
                  {incident.confidence != null ? (
                    <span className="rounded-md bg-slate-50 px-2 py-1">Conf: {incident.confidence}</span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <IncidentSeverityBadge severity={incident.severity} />
                <IncidentStatusBadge status={incident.status} />
              </div>
            </div>

            {incident.scoreBreakdown ? (
              <div className="mt-4 rounded-lg border bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">Why this severity</p>
                <pre className="mt-2 overflow-auto text-xs text-slate-700">
                  {JSON.stringify(incident.scoreBreakdown, null, 2)}
                </pre>
              </div>
            ) : null}

            {incident.details ? (
              <div className="mt-4 rounded-lg border bg-white p-3">
                <p className="text-xs font-semibold text-slate-700">Details</p>
                <pre className="mt-2 overflow-auto text-xs text-slate-700">
                  {JSON.stringify(incident.details, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <IncidentActionsPanel
              incidentId={incident.id}
              actions={incident.actions ?? []}
              onExecuted={load}
            />
            <IncidentEventsPanel events={events} />
          </div>

          {!!incident.signals?.length && (
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-sm font-semibold">Signals</h3>
              <div className="mt-3 space-y-2">
                {incident.signals.map((s) => (
                  <div key={s.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-800">{s.signalType}</p>
                      <p className="text-xs text-slate-500">{new Date(s.observedAt).toLocaleString()}</p>
                    </div>
                    <pre className="mt-2 overflow-auto text-xs text-slate-700">
                      {JSON.stringify(s.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">
          Incident not found.
        </div>
      )}
    </div>
  );
}
