// apps/frontend/src/app/(dashboard)/dashboard/components/incidents/IncidentSeverityExplainPanel.tsx
'use client';

import React, { useMemo, useState } from 'react';
import type { IncidentDTO } from '@/types/incidents.types';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pct(conf?: number | null) {
  if (conf == null) return null;
  const v = Number(conf);
  if (!Number.isFinite(v)) return null;
  return clamp(Math.round(v * 100), 0, 100);
}

function SeverityLegend({ severity, score }: { severity?: string | null; score?: number | null }) {
  const label = severity ?? '—';
  const s = score ?? null;

  return (
    <div className="flex items-center gap-2">
      <span className="rounded-full border px-2 py-1 text-xs font-semibold">{label}</span>
      {s != null ? <span className="text-xs text-slate-600">({s}/100)</span> : null}
    </div>
  );
}

function ConfidenceBar({ confidence }: { confidence?: number | null }) {
  const p = pct(confidence);
  if (p == null) {
    return <div className="text-xs text-slate-600">—</div>;
  }

  return (
    <div className="w-full">
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-slate-900"
          style={{ width: `${p}%` }}
          aria-label={`Confidence ${p}%`}
        />
      </div>
      <div className="mt-1 text-xs text-slate-600">{p}%</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-white px-3 py-2">
      <div className="text-sm text-slate-800">{label}</div>
      <div className="text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function normalizeBreakdown(scoreBreakdown: any) {
  // Supports either:
  // - your existing breakdown shape
  // - future shapes (we degrade gracefully)
  if (!scoreBreakdown || typeof scoreBreakdown !== 'object') return null;

  // Common keys we want to present if present
  const keys = [
    { k: 'riskImpact', label: 'Risk impact' },
    { k: 'likelihood', label: 'Likelihood' },
    { k: 'timeSensitivity', label: 'Time sensitivity' },
    { k: 'coveragePenalty', label: 'Coverage penalty' },
    { k: 'mitigationConfidence', label: 'Mitigation confidence (reduces)' },
  ];

  const rows = keys
    .filter(({ k }) => scoreBreakdown[k] != null)
    .map(({ k, label }) => ({ label, value: scoreBreakdown[k] }));

  const total =
    scoreBreakdown.total ??
    scoreBreakdown.score ??
    scoreBreakdown.severityScore ??
    null;

  return { rows, total };
}

function safeStringify(obj: any) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export default function IncidentSeverityExplainPanel({
  incident,
  decisionTrace,
}: {
  incident: IncidentDTO;
  decisionTrace?: any | null;
}) {
  const [showRaw, setShowRaw] = useState(false);

  const normalized = useMemo(
    () => normalizeBreakdown(incident.scoreBreakdown),
    [incident.scoreBreakdown]
  );

  // Pull “inputs” from decisionTrace if present (from ACTION_PROPOSED payload)
  const inputs = decisionTrace?.inputs ?? null;
  const checks = Array.isArray(decisionTrace?.checks) ? decisionTrace.checks : null;
  const evaluatedAt = decisionTrace?.evaluatedAt ?? null;

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Severity explainability</h3>
          <p className="mt-1 text-xs text-slate-600">
            Why this incident is prioritized and how confident we are.
          </p>
        </div>

        <SeverityLegend severity={incident.severity} score={incident.severityScore ?? null} />
      </div>

      {/* Confidence */}
      <div className="mt-4 rounded-lg border bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-700">Confidence</div>
            <div className="text-xs text-slate-600">
              Higher confidence means we’re more certain the incident is real and actionable.
            </div>
          </div>
          <div className="w-44">
            <ConfidenceBar confidence={incident.confidence ?? null} />
          </div>
        </div>
      </div>

      {/* Breakdown (structured) */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-700">Score breakdown</div>
          {incident.scoreBreakdown ? (
            <button
              className="text-xs font-semibold text-blue-600 hover:underline"
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
            </button>
          ) : null}
        </div>

        {incident.scoreBreakdown ? (
          normalized?.rows?.length ? (
            <div className="mt-2 space-y-2">
              {normalized.rows.map((r: any, idx: number) => (
                <Row key={idx} label={r.label} value={r.value} />
              ))}
              {normalized.total != null ? (
                <Row label="Total" value={normalized.total} />
              ) : null}
            </div>
          ) : (
            <div className="mt-2 text-sm text-slate-600">
              Breakdown present but unrecognized format. Use raw view.
            </div>
          )
        ) : (
          <div className="mt-2 text-sm text-slate-600">
            No breakdown available yet. (Evaluator should populate <code>scoreBreakdown</code>.)
          </div>
        )}

        {showRaw && incident.scoreBreakdown ? (
          <pre className="mt-3 overflow-auto rounded-lg border bg-white p-3 text-xs text-slate-700">
            {safeStringify(incident.scoreBreakdown)}
          </pre>
        ) : null}
      </div>

      {/* WHY panel (inputs + checks) */}
      <div className="mt-5 rounded-lg border bg-white p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-700">Why</div>
          {evaluatedAt ? (
            <div className="text-xs text-slate-500">
              Evaluated: {new Date(evaluatedAt).toLocaleString()}
            </div>
          ) : null}
        </div>

        {/* Inputs summary */}
        {inputs ? (
          <div className="mt-2">
            <div className="text-xs font-semibold text-slate-700">Inputs</div>
            <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
              {safeStringify(inputs)}
            </pre>
          </div>
        ) : (
          <div className="mt-2 text-xs text-slate-600">
            Inputs not available yet. Click <b>Re-evaluate</b> to generate a decision trace.
          </div>
        )}

        {/* Checks summary (if your trace includes checks) */}
        {checks?.length ? (
          <div className="mt-3">
            <div className="text-xs font-semibold text-slate-700">Checks</div>
            <div className="mt-2 space-y-2">
              {checks.map((c: any, idx: number) => (
                <div key={idx} className="rounded-lg border bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">{c.label ?? c.id}</div>
                      {c.details ? (
                        <div className="mt-1 text-xs text-slate-600">
                          {safeStringify(c.details)}
                        </div>
                      ) : null}
                    </div>
                    <span
                      className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                        c.passed ? 'bg-green-50' : 'bg-red-50'
                      }`}
                    >
                      {c.passed ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
