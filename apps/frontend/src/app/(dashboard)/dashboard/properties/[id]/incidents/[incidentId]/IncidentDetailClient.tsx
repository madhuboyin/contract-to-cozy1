// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/incidents/[incidentId]/IncidentDetailClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { SectionHeader } from '../../../../components/SectionHeader';
import type { IncidentDTO, IncidentEventDTO, GetIncidentDetailResponse } from '@/types/incidents.types';
import {
  getIncident,
  listIncidentEvents,
  orchestrateIncidentNow,
  reevaluateIncidentNow,
} from '../incidentsApi';

import IncidentSeverityBadge from '@/app/(dashboard)/dashboard/components/incidents/IncidentSeverityBadge';
import IncidentStatusBadge from '@/app/(dashboard)/dashboard/components/incidents/IncidentStatusBadge';
import IncidentActionsPanel from '@/app/(dashboard)/dashboard/components/incidents/IncidentActionsPanel';
import IncidentEventsPanel from '@/app/(dashboard)/dashboard/components/incidents/IncidentEventsPanel';
import IncidentSeverityExplainPanel from '@/app/(dashboard)/dashboard/components/incidents/IncidentSeverityExplainPanel';
import IncidentAckControls from '@/app/(dashboard)/dashboard/components/incidents/IncidentAckControls';
import IncidentDecisionTracePanel from '@/app/(dashboard)/dashboard/components/incidents/IncidentDecisionTracePanel';


export default function IncidentDetailClient() {
  const params = useParams<{ id: string; incidentId: string }>();
  const propertyId = params.id;
  const incidentId = params.incidentId;

  const [incident, setIncident] = useState<IncidentDTO | null>(null);
  const [events, setEvents] = useState<IncidentEventDTO[]>([]);
  const [decisionTrace, setDecisionTrace] = useState<any | null>(null);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const [detail, e] = await Promise.all([
        getIncident({ propertyId, incidentId }),
        listIncidentEvents({ propertyId, incidentId, limit: 50 }),
      ]);

      // getIncident now returns { incident, decisionTrace, latestActionProposedEvent }
      const d = detail as GetIncidentDetailResponse;

      setIncident(d.incident);
      setDecisionTrace(d.decisionTrace ?? null);
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
  }, [propertyId, incidentId]);

  const right = useMemo(() => {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
          href={`/dashboard/properties/${propertyId}?tab=incidents`}
        >
          ← Back
        </Link>

        <button
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          disabled={loading || busy}
          onClick={async () => {
            setBusy(true);
            try {
              // ✅ New combined endpoint
              await reevaluateIncidentNow({ propertyId, incidentId });
              await load();
            } finally {
              setBusy(false);
            }
          }}
          title="Evaluate + orchestrate (recommended)"
        >
          {busy ? 'Re-evaluating…' : 'Re-evaluate'}
        </button>

        <button
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          disabled={loading || busy}
          onClick={async () => {
            setBusy(true);
            try {
              // Optional debugging: orchestration only
              await orchestrateIncidentNow({ propertyId, incidentId });
              await load();
            } finally {
              setBusy(false);
            }
          }}
          title="Orchestrate only (debug)"
        >
          Re-orchestrate
        </button>

        <button
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          disabled={loading || busy}
          onClick={load}
        >
          Refresh
        </button>
      </div>
    );
  }, [propertyId, incidentId, loading, busy]);

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

      {err ? (
        <div className="rounded-xl border bg-red-50 p-3 text-sm text-red-700">{err}</div>
      ) : null}

      {incident ? (
        <>
          <div className="rounded-xl border bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{incident.title}</h2>
                {incident.summary ? (
                  <p className="mt-1 text-sm text-slate-700">{incident.summary}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="rounded-md bg-slate-50 px-2 py-1">Type: {incident.typeKey}</span>
                  {incident.category ? (
                    <span className="rounded-md bg-slate-50 px-2 py-1">Cat: {incident.category}</span>
                  ) : null}
                  <span className="rounded-md bg-slate-50 px-2 py-1">Source: {incident.sourceType}</span>
                  {incident.severityScore != null ? (
                    <span className="rounded-md bg-slate-50 px-2 py-1">Score: {incident.severityScore}</span>
                  ) : null}
                  {incident.confidence != null ? (
                    <span className="rounded-md bg-slate-50 px-2 py-1">
                      Conf: {Number(incident.confidence).toFixed(2)}
                    </span>
                  ) : null}
                </div>
              </div>
              <IncidentAckControls
                propertyId={propertyId}
                incidentId={incident.id}
                disabled={loading || busy}
                onDone={load}
              />
              <div className="flex items-center gap-2">
                <IncidentSeverityBadge severity={incident.severity} />
                <IncidentStatusBadge status={incident.status} />
              </div>
            </div>

            <div className="mt-4">
              <IncidentSeverityExplainPanel incident={incident} decisionTrace={decisionTrace} />
            </div>

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
              propertyId={propertyId}
              incidentId={incident.id}
              actions={incident.actions ?? []}
              decisionTrace={decisionTrace} // ✅ pass it
              onExecuted={load}
            />
            <div className="space-y-4">
              <IncidentEventsPanel events={events} />
              <IncidentDecisionTracePanel trace={decisionTrace} />
            </div>
          </div>


          {!!incident.signals?.length && (
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-sm font-semibold">Signals</h3>
              <div className="mt-3 space-y-2">
                {incident.signals.map((s) => (
                  <div key={s.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-800">{s.signalType}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(s.observedAt).toLocaleString()}
                      </p>
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
