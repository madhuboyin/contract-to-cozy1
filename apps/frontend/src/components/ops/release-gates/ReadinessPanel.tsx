// apps/frontend/src/components/ops/release-gates/ReadinessPanel.tsx
//
// Condensed launch-readiness summary: one status banner, a compact control
// strip (instead of 7 verbose badges), a blockers alert, and a collapsed
// disclosure for the long tail of diagnostic-only fields that are usually
// empty (disabled IDs, manifest pins, key parity).

'use client';

import { useState } from 'react';
import { Check, ChevronDown, CircleAlert } from 'lucide-react';
import type { ReleaseGateSummary } from '@/lib/api/adminPlatformOps';
import { humanizeBlockerCode } from './releaseGatesUtils';

type Controls = ReleaseGateSummary['operationalControls'];

function ControlPill({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
        ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
      }`}
    >
      {ok ? <Check className="h-2.5 w-2.5" /> : <CircleAlert className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

export function ReadinessPanel({ controls }: { controls: Controls }) {
  const [diagOpen, setDiagOpen] = useState(false);

  const humanPolicyOk = controls.humanPolicyApprovalEnforced && controls.governanceReviewSourceAvailable;

  const diagRows: Array<[string, string]> = [
    ['Disabled capabilities', controls.disabledCapabilityIds.join(', ') || 'none'],
    ['Broken-route suppression', controls.brokenRouteCapabilityIds.join(', ') || 'none'],
    ['Release-gate blocks', controls.releaseGateBlockedCapabilityIds.join(', ') || 'none'],
    [
      'Rollout key parity',
      controls.rolloutKeyParity.valid
        ? 'valid — no missing or unknown keys'
        : `missing: ${controls.rolloutKeyParity.missingKeys.join(', ') || 'none'}; unknown: ${controls.rolloutKeyParity.unknownKeys.join(', ') || 'none'}`,
    ],
    [
      'Manifest / configuration pins',
      controls.manifestVersionMismatches.length === 0 &&
      controls.invalidManifestVersionEntries.length === 0 &&
      controls.invalidConfigurationEntries.length === 0
        ? 'no mismatches'
        : [
            ...controls.manifestVersionMismatches.map(
              (m) => `${m.capabilityId} (current ${m.currentVersion}, expected ${m.expectedVersion})`,
            ),
            ...controls.invalidManifestVersionEntries.map((id) => `invalid pin: ${id}`),
            ...controls.invalidConfigurationEntries.map((id) => `invalid config: ${id}`),
          ].join(', '),
    ],
  ];

  const unknownIdRows: Array<[string, string[]]> = [
    ['Unknown disabled IDs', controls.unknownDisabledCapabilityIds],
    ['Unknown broken-route IDs', controls.unknownBrokenRouteCapabilityIds],
    ['Unknown release-gate IDs', controls.unknownReleaseGateBlockedCapabilityIds],
  ];

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div
        className={`flex flex-wrap items-center gap-2.5 border-b px-4 py-3 ${
          controls.releaseReady
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-rose-200 bg-rose-50'
        }`}
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            controls.releaseReady ? 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]' : 'bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.15)]'
          }`}
        />
        <p className={`text-sm font-semibold ${controls.releaseReady ? 'text-emerald-700' : 'text-rose-700'}`}>
          Real-user launch {controls.releaseReady ? 'ready' : 'blocked'}
        </p>
        <p className="ml-auto font-mono text-[10.5px] text-slate-400">
          Registry {controls.registryVersion}
          {controls.expectedRegistryVersion ? ` · expected ${controls.expectedRegistryVersion}` : ' · no deployment pin'}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 py-3">
        <ControlPill
          ok={controls.releaseMode === 'REAL_USER_LAUNCH'}
          label={controls.releaseMode === 'REAL_USER_LAUNCH' ? 'Real-user mode' : 'Internal beta mode'}
        />
        <ControlPill ok={controls.globalEnabled} label={`Discovery ${controls.globalEnabled ? 'enabled' : 'disabled'}`} />
        <ControlPill
          ok={controls.releaseGateEnforced}
          label={`Release gates ${controls.releaseGateEnforced ? 'enforced' : 'advisory'}`}
        />
        <ControlPill
          ok={humanPolicyOk}
          label={`Human policy ${
            controls.humanPolicyApprovalEnforced
              ? controls.governanceReviewSourceAvailable
                ? 'enforced'
                : 'unavailable'
              : 'advisory'
          }`}
        />
        <ControlPill ok={controls.rolloutKeyParity.valid} label={`Rollout parity ${controls.rolloutKeyParity.valid ? 'valid' : 'invalid'}`} />
        <ControlPill ok={controls.registryVersionMatches} label={`Registry ${controls.registryVersionMatches ? 'matched' : 'mismatch'}`} />
        <ControlPill ok={controls.configurationValid} label={`Configuration ${controls.configurationValid ? 'valid' : 'invalid'}`} />
      </div>

      {!controls.releaseReady ? (
        <div className="mx-4 mb-3.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
          <p className="mb-1 text-[11px] font-bold text-rose-700">
            Launch blockers ({controls.releaseBlockers.length})
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-[11.5px] text-slate-600">
            {(controls.releaseBlockers.length > 0 ? controls.releaseBlockers : ['unknown policy failure']).map((b) => (
              <li key={b}>{humanizeBlockerCode(b)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setDiagOpen((v) => !v)}
        aria-expanded={diagOpen}
        className="flex h-7 w-full items-center justify-center gap-1 border-t border-slate-100 bg-slate-50/60 text-[10.5px] font-semibold text-slate-400 hover:text-slate-600"
      >
        Diagnostic detail (disabled IDs, manifest pins, key parity)
        <ChevronDown className={`h-3 w-3 transition-transform ${diagOpen ? 'rotate-180' : ''}`} />
      </button>

      {diagOpen && (
        <div className="space-y-1.5 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-[11px] text-slate-600">
          {diagRows.map(([label, value]) => (
            <p key={label}>
              <span className="font-semibold text-slate-700">{label}:</span> {value}
            </p>
          ))}
          {unknownIdRows.map(([label, values]) =>
            values.length > 0 ? (
              <p key={label} className="font-medium text-rose-700">
                {label}: {values.join(', ')}
              </p>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
