'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import type { GetIncidentDetailResponse, IncidentDTO, IncidentEventDTO } from '@/types/incidents.types';
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
import { Button } from '@/components/ui/button';
import humanizeActionType from '@/lib/utils/humanize';
import {
  buildServicePriceRadarHref,
  inferServicePriceRadarCategoryFromIncident,
} from '@/lib/routes/servicePriceRadar';
import {
  EmptyStateCard,
  MobileActionRow,
  MobileCard,
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

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
      const [detail, eventData] = await Promise.all([
        getIncident({ propertyId, incidentId }),
        listIncidentEvents({ propertyId, incidentId, limit: 50 }),
      ]);

      const response = detail as GetIncidentDetailResponse;
      setIncident(response.incident);
      setDecisionTrace(response.decisionTrace ?? null);
      setEvents(eventData.items ?? []);
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

  if (loading && !incident) {
    return (
      <MobilePageContainer className="py-6 lg:max-w-7xl lg:px-8 lg:pb-10">
        <MobileCard variant="compact" className="text-sm text-slate-600">
          Loading incident...
        </MobileCard>
      </MobilePageContainer>
    );
  }

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}?tab=incidents`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to incidents
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow="Incident"
        title={incident?.title || 'Incident'}
        subtitle={incident?.summary || 'View signal details, severity rationale, and recommended actions.'}
      />

      <MobileFilterSurface>
        <MobileActionRow>
          <Button
            variant="outline"
            className="min-h-[44px]"
            disabled={loading || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await reevaluateIncidentNow({ propertyId, incidentId });
                await load();
              } finally {
                setBusy(false);
              }
            }}
            title="Evaluate + orchestrate (recommended)"
          >
            {busy ? 'Re-evaluating...' : 'Re-evaluate'}
          </Button>

          <Button
            variant="outline"
            className="min-h-[44px]"
            disabled={loading || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await orchestrateIncidentNow({ propertyId, incidentId });
                await load();
              } finally {
                setBusy(false);
              }
            }}
            title="Orchestrate only (debug)"
          >
            Re-orchestrate
          </Button>

          <Button variant="outline" className="min-h-[44px]" disabled={loading || busy} onClick={load}>
            Refresh
          </Button>
        </MobileActionRow>
      </MobileFilterSurface>

      {err ? <div className="rounded-xl border bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      {incident ? (
        <>
          <MobileCard>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <IncidentSeverityBadge severity={incident.severity} />
                <IncidentStatusBadge status={incident.status} />
                <StatusChip tone="info">{humanizeActionType(incident.typeKey)}</StatusChip>
                {incident.category ? <StatusChip tone="elevated">{humanizeActionType(incident.category)}</StatusChip> : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="rounded-md bg-slate-50 px-2 py-1">Source: {humanizeActionType(incident.sourceType)}</span>
                {incident.severityScore != null ? (
                  <span className="rounded-md bg-slate-50 px-2 py-1">Score: {incident.severityScore}</span>
                ) : null}
                {incident.confidence != null ? (
                  <span className="rounded-md bg-slate-50 px-2 py-1">Conf: {Number(incident.confidence).toFixed(2)}</span>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className="min-h-[40px]">
                  <Link
                    href={buildServicePriceRadarHref({
                      propertyId,
                      launchSurface: 'incident_card',
                      serviceCategory: inferServicePriceRadarCategoryFromIncident(incident),
                      serviceLabelRaw: incident.title,
                      linkedEntityType: 'INCIDENT',
                      linkedEntityId: incident.id,
                    })}
                  >
                    Check quote fairness
                  </Link>
                </Button>
              </div>

              <IncidentAckControls
                propertyId={propertyId}
                incidentId={incident.id}
                disabled={loading || busy}
                onDone={load}
              />

              <IncidentSeverityExplainPanel incident={incident} decisionTrace={decisionTrace} />

              {incident.details ? (
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs font-semibold text-slate-700">Details</p>
                  <pre className="mt-2 overflow-auto text-xs text-slate-700">{JSON.stringify(incident.details, null, 2)}</pre>
                </div>
              ) : null}
            </div>
          </MobileCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <IncidentActionsPanel
              propertyId={propertyId}
              incidentId={incident.id}
              actions={incident.actions ?? []}
              decisionTrace={decisionTrace}
              onExecuted={load}
            />
            <div className="space-y-4">
              <IncidentEventsPanel events={events} />
              <IncidentDecisionTracePanel trace={decisionTrace} />
            </div>
          </div>

          {!!incident.signals?.length && (
            <MobileCard>
              <h3 className="text-sm font-semibold">Signals</h3>
              <div className="mt-3 space-y-2">
                {incident.signals.map((signal) => (
                  <div key={signal.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-800">{humanizeActionType(signal.signalType)}</p>
                      <p className="text-xs text-slate-500">{new Date(signal.observedAt).toLocaleString()}</p>
                    </div>
                    <pre className="mt-2 overflow-auto text-xs text-slate-700">{JSON.stringify(signal.payload, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </MobileCard>
          )}
        </>
      ) : (
        <EmptyStateCard title="Incident not found" description="This incident is unavailable for the selected property." />
      )}
    </MobilePageContainer>
  );
}
