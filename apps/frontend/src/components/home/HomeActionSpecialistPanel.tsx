'use client';

// C2C Intelligence & Agentic Evolution Phase 2 / PR 11 (plan §7.4).
// "Get help deciding" for an eligible, delivered HVAC repair-or-replace Home
// Action. Renders exactly four states (IPD-004 removed the follow-up state):
// working, needs context / document, recommendation ready, abstained. Calls
// the same backend operation Ask uses.

import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, HelpCircle, Loader2, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useHvacSpecialistStatus,
  useStartHvacSpecialist,
  useSubmitHvacSpecialistContext,
} from '@/hooks/useHvacSpecialist';
import type {
  HvacSpecialistHomeActionOrigin,
  SpecialistOutstandingItem,
  SpecialistStatus,
} from '@/lib/api/hvacSpecialist';

const VERDICT_COPY: Record<string, string> = {
  REPAIR: 'Repair is the better call right now.',
  REPLACE: 'Replacement is the better call.',
  MONITOR: 'Keep monitoring — no clear repair-or-replace signal yet.',
};

const ABSTENTION_COPY: Record<string, string> = {
  AMBIGUOUS_DECISION_THREAD: 'There is more than one active decision for this system, so the Specialist won’t guess. Resolve them and try again.',
  LOOP_BUDGET_EXHAUSTED: 'The Specialist reached its work limit without a confident answer.',
  CONTEXT_UNRESOLVED: 'The system’s details couldn’t be brought up to date.',
  LOW_CONFIDENCE: 'The available information isn’t enough for a confident recommendation.',
  TOOL_FAILURE: 'A data lookup the Specialist needs is temporarily unavailable. Try again shortly.',
  UNSUPPORTED_VERDICT: 'The decision engine didn’t return a supported recommendation for this system.',
};

function ContextForm({
  outstanding,
  casVersion,
  onSubmit,
  pending,
}: {
  outstanding: SpecialistOutstandingItem[];
  casVersion: number | undefined;
  onSubmit: (intake: Record<string, unknown>, expectedCasVersion?: number) => void;
  pending: boolean;
}) {
  const facts = outstanding.filter((o) => o.kind === 'FACT');
  const documents = outstanding.filter((o) => o.kind === 'DOCUMENT');
  const [values, setValues] = useState<Record<string, string>>({});

  const submit = () => {
    const intake: Record<string, unknown> = {};
    for (const item of facts) {
      const raw = values[item.key]?.trim();
      if (!raw) continue;
      if (item.key === 'hvac.replacementCost') intake[item.key] = Number(raw);
      else if (item.key === 'hvac.condition') intake[item.key] = raw.toUpperCase();
      else intake[item.key] = raw;
    }
    if (Object.keys(intake).length) onSubmit(intake, casVersion);
  };

  return (
    <div className="space-y-3">
      {facts.map((item) => (
        <label key={item.key} className="block text-sm">
          <span className="text-slate-700">{item.label}</span>
          <Input
            value={values[item.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [item.key]: e.target.value }))}
            placeholder={
              item.key === 'hvac.condition' ? 'NEW / GOOD / FAIR / POOR'
                : item.key === 'hvac.replacementCost' ? 'Estimated replacement cost, in dollars'
                  : item.key === 'hvac.installDate' ? 'Year installed (e.g. 2011)'
                    : ''
            }
            className="mt-1 h-9 text-sm"
          />
        </label>
      ))}
      {documents.map((item) => (
        <p key={item.key} className="text-xs text-slate-500">
          {item.label}
          {item.correctionPath && <span className="ml-1 text-slate-400">— add it from your documents to continue.</span>}
        </p>
      ))}
      {facts.length > 0 && (
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Send to the Specialist
        </Button>
      )}
    </div>
  );
}

function StatusBody({
  status,
  propertyId,
  inventoryItemId,
}: {
  status: SpecialistStatus;
  propertyId: string;
  inventoryItemId: string;
}) {
  const submit = useSubmitHvacSpecialistContext(propertyId, inventoryItemId);

  if (status.phase === 'WORKING') {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Working through the repair-or-replace decision…
      </p>
    );
  }

  if (status.phase === 'NEEDS_CONTEXT' || status.phase === 'NEEDS_DOCUMENT') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-700">
          The Specialist needs a little more about this system before it can recommend anything:
        </p>
        <ContextForm
          outstanding={status.outstanding}
          casVersion={status.casVersion ?? undefined}
          pending={submit.isPending}
          onSubmit={(intake, casVersion) => submit.mutate({ contextIntake: intake, expectedCasVersion: casVersion })}
        />
        {submit.isError && <p className="text-xs text-rose-600">Couldn’t save that — reload and try again.</p>}
      </div>
    );
  }

  if (status.phase === 'RECOMMENDATION_READY') {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          {status.verdict ? VERDICT_COPY[status.verdict] : 'A recommendation is ready.'}
        </p>
        {status.confidenceLabel && (
          <Badge variant="outline" className="text-[11px]">{status.confidenceLabel} confidence</Badge>
        )}
        {status.explanation.length > 0 && (
          <ul className="mt-1 space-y-1 text-sm text-slate-700">
            {status.explanation.map((claim) => <li key={claim.claimId}>• {claim.text}</li>)}
          </ul>
        )}
        <p className="text-xs text-slate-500">
          This uses the same recommendation shown on the decision card — the Specialist just walks you through it.
        </p>
        <p className="text-xs text-slate-500">
          Once you act, tell Cozy what you decided (&ldquo;record the outcome for this HVAC decision&rdquo;) so it can
          learn from what actually worked. Disagree with the recommendation? Correct the underlying record and it
          re-runs.
        </p>
      </div>
    );
  }

  // ABSTAINED
  return (
    <p className="text-sm text-amber-800">
      {status.abstentionReason ? ABSTENTION_COPY[status.abstentionReason] ?? 'The Specialist couldn’t give a confident recommendation.' : 'The Specialist couldn’t give a confident recommendation.'}
    </p>
  );
}

export function HomeActionSpecialistPanel({
  propertyId,
  inventoryItemId,
  homeActionOrigin,
}: {
  propertyId: string;
  inventoryItemId: string;
  homeActionOrigin: Omit<HvacSpecialistHomeActionOrigin, 'engagementNonce'>;
}) {
  const [opened, setOpened] = useState(false);
  const engagementNonce = useRef(
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const origin = useMemo(() => ({ ...homeActionOrigin, engagementNonce: engagementNonce.current }), [homeActionOrigin]);
  const statusQuery = useHvacSpecialistStatus(propertyId, inventoryItemId, { enabled: opened });
  const start = useStartHvacSpecialist(propertyId, inventoryItemId, origin);
  const status = start.data?.status ?? statusQuery.data?.status ?? null;

  const heading = useMemo(() => (
    <div className="flex items-center gap-2">
      <Wrench className="h-4 w-4 text-slate-500" />
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">HVAC Repair-or-Replace Specialist</span>
    </div>
  ), []);

  if (!opened) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 md:col-span-2">
        {heading}
        <p className="mt-1 text-sm text-slate-600">Not sure whether to repair or replace this system? Walk through it with the Specialist.</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => { setOpened(true); start.mutate(); }}
        >
          <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
          Get help deciding
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 md:col-span-2">
      {heading}
      <div className="mt-2">
        {start.isPending || (statusQuery.isLoading && !status) ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Starting the Specialist…
          </p>
        ) : status ? (
          <StatusBody status={status} propertyId={propertyId} inventoryItemId={inventoryItemId} />
        ) : (
          <p className="text-sm text-rose-600">The Specialist is unavailable right now.</p>
        )}
      </div>
    </div>
  );
}
