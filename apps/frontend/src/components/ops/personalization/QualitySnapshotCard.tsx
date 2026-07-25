// apps/frontend/src/components/ops/personalization/QualitySnapshotCard.tsx

'use client';

import { useState } from 'react';
import { ChevronDown, CircleAlert } from 'lucide-react';
import type { PersonalizationQualityResponse } from '@/lib/api/personalizationAdminApi';
import { humanize, SAMPLE_STATUS_LABEL } from './personalizationUtils';

function pct(value: number | null): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function pts(value: number | null): string {
  return value == null ? '—' : `${Math.round(value * 100)} pts`;
}

export function QualitySnapshotCard({
  isLoading,
  isError,
  data,
}: {
  isLoading: boolean;
  isError: boolean;
  data: PersonalizationQualityResponse | undefined;
}) {
  const [calibOpen, setCalibOpen] = useState(false);

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 pb-1 pt-4">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
          Personalization quality snapshot
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500">Last 30 days</span>
        </h2>
        <p className="text-[12px] text-slate-500">
          Aggregate signals only. Online tuning remains disabled even after the review threshold is reached.
        </p>
      </div>

      {isLoading ? <p className="px-5 py-4 text-sm text-slate-600">Loading personalization quality…</p> : null}
      {isError || !data ? (
        <p className="px-5 py-4 text-sm text-rose-700">Personalization quality is unavailable. Catalog operations are unaffected.</p>
      ) : null}

      {data ? (
        <>
          <div className="mx-5 mt-3 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
              <CircleAlert className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <p className="text-[12.5px] font-semibold text-slate-800">
                {SAMPLE_STATUS_LABEL[data.sample.status] ?? humanize(data.sample.status)} — {data.sample.decisionEvents} of{' '}
                {data.sample.minimumRequired} decision events
              </p>
              <p className="mt-0.5 text-[11.5px] text-slate-500">
                This threshold permits manual review only; it never triggers automatic weight changes.
              </p>
              <div className="mt-1.5 h-[5px] w-56 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${Math.min(100, (data.sample.decisionEvents / Math.max(1, data.sample.minimumRequired)) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
              {[
                ['Homes, default guidance', data.propertiesWithDefaultGuidance, null],
                ['Optional profiles enabled', data.optionalProfilesEnabled, null],
                ['Recommendations', data.recommendations.total, null],
                ['Accepted', data.feedback.accepted, null],
                ['Negative', data.feedback.negative, null],
                ['Open incidents', data.incidents.open, `${data.incidents.critical} critical`],
              ].map(([label, value, sub]) => (
                <div key={label as string} className="rounded-xl border border-slate-100 bg-white p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="mt-1 font-mono text-[20px] font-bold tabular-nums text-slate-900">{value as number}</p>
                  {sub ? <p className="mt-0.5 text-[10.5px] text-slate-400">{sub}</p> : null}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCalibOpen((v) => !v)}
              aria-expanded={calibOpen}
              className="mt-4 flex h-7 w-full items-center justify-center gap-1 rounded-lg bg-slate-50 text-[10.5px] font-semibold text-slate-400 hover:text-slate-600"
            >
              Feedback signals &amp; confidence calibration
              <ChevronDown className={`h-3 w-3 transition-transform ${calibOpen ? 'rotate-180' : ''}`} />
            </button>

            {calibOpen && (
              <div className="mt-2.5 rounded-xl bg-slate-50 p-3.5">
                {data.feedback.reasons.length > 0 ? (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {data.feedback.reasons.map((r) => (
                      <span key={r.reasonCode} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-600">
                        {humanize(r.reasonCode)} · {r.count}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-600">Complaints · {data.feedback.complaints}</span>
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-600">Overrides · {data.feedback.overrides}</span>
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-600">Reversals · {data.feedback.reversals}</span>
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-600">Profile corrections · {data.feedback.corrections}</span>
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-600">Resolved incidents · {data.incidents.resolved}</span>
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-600">
                    Median resolution · {data.incidents.medianResolutionHours == null ? '—' : `${data.incidents.medianResolutionHours}h`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {data.calibration.map((band) => (
                    <div key={band.band} className="rounded-lg border border-slate-200 bg-white p-2.5">
                      <p
                        className={`text-[11px] font-bold ${
                          band.band === 'LOW'
                            ? 'text-rose-600'
                            : band.band === 'MEDIUM'
                              ? 'text-amber-600'
                              : band.band === 'HIGH'
                                ? 'text-emerald-600'
                                : 'text-slate-400'
                        }`}
                      >
                        {band.band.charAt(0) + band.band.slice(1).toLowerCase()} confidence
                      </p>
                      <p className="text-[10.5px] text-slate-400">
                        {band.samples} samples · observed {pct(band.observedPositiveRate)} · gap {pts(band.calibrationGap)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
