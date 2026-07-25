// apps/frontend/src/components/ops/personalization/IncidentQueueCard.tsx

'use client';

import { Button } from '@/components/ui/button';
import type { RecommendationIncident } from '@/lib/api/personalizationAdminApi';
import { humanize, SEVERITY_CHIP } from './personalizationUtils';

const NEXT_ACTION_LABEL: Record<string, string> = {
  OPEN: 'Triage',
  TRIAGED: 'Investigate',
  INVESTIGATING: 'Resolve',
  MITIGATED: 'Resolve',
  RESOLVED: 'Close',
};

export function IncidentQueueCard({
  isLoading,
  isError,
  incidents,
  onAdvance,
  advancePending,
}: {
  isLoading: boolean;
  isError: boolean;
  incidents: RecommendationIncident[] | undefined;
  onAdvance: (incident: RecommendationIncident) => void;
  advancePending: boolean;
}) {
  const openCount = incidents?.filter((i) => !['RESOLVED', 'CLOSED'].includes(i.status)).length ?? 0;

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 pb-1 pt-4">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
          Recommendation incident queue
          <span className={`rounded px-2 py-0.5 text-[10.5px] font-semibold ${openCount > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
            {openCount} open
          </span>
        </h2>
        <p className="text-[12px] text-slate-500">
          Complaints, reversals, overrides, and operator reports enter an audited lifecycle. Critical and safety incidents pause the affected definition automatically.
        </p>
      </div>

      <div className="space-y-2 px-5 pb-5 pt-3">
        {isLoading ? <p className="text-sm text-slate-600">Loading recommendation incidents…</p> : null}
        {isError ? <p className="text-sm text-rose-700">The incident queue is unavailable.</p> : null}
        {incidents?.length === 0 ? (
          <div className="rounded-xl bg-slate-50 py-6 text-center text-[12px] text-slate-400">
            No recommendation incidents have been reported.
          </div>
        ) : null}
        {incidents?.map((incident) => (
          <div key={incident.id} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 p-3.5 lg:flex-row lg:items-start">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_CHIP[incident.severity]}`}>{incident.severity}</span>
                <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">{incident.status}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{humanize(incident.type)}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-500">{incident.definition.code}</span>
                {incident.definition.pausedAt ? (
                  <span className="rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">DEFINITION PAUSED</span>
                ) : null}
              </div>
              <p className="text-[13px] font-semibold text-slate-800">{incident.summary}</p>
              {incident.details ? <p className="text-[12px] text-slate-500">{incident.details}</p> : null}
              <p className="text-[10.5px] text-slate-400">
                Opened {new Date(incident.createdAt).toLocaleString()} · {humanize(incident.safetyTier)} · policy {incident.policyVersion}
              </p>
            </div>
            {incident.status !== 'CLOSED' ? (
              <Button type="button" variant="outline" size="sm" disabled={advancePending} onClick={() => onAdvance(incident)}>
                {NEXT_ACTION_LABEL[incident.status] ?? 'Advance'}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
