'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FolderOpen,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MobilePageIntro, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import { api } from '@/lib/api/client';
import { track } from '@/lib/analytics/events';
import {
  RENOVATION_STAGE_LABELS,
  getRenovationNextAction,
  renovationLifecycleLabel,
  type RenovationReadinessSummary,
  type RenovationWorkspaceCase,
} from '@/features/renovations/renovationWorkspace';

type SupportingState = {
  readiness?: {
    summary?: RenovationReadinessSummary;
  };
  compliance?: {
    requirements?: unknown[];
    conditions?: Array<{ status?: string; isBlocking?: boolean }>;
    permits?: unknown[];
    hoaApprovals?: unknown[];
  };
};

export default function RenovationCaseWorkspacePage() {
  const { id: propertyId, caseId } = useParams<{ id: string; caseId: string }>();
  const [renovationCase, setRenovationCase] = useState<RenovationWorkspaceCase | null>(null);
  const [supporting, setSupporting] = useState<SupportingState>({});
  const [partialFailures, setPartialFailures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const trackedLifecycle = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setPartialFailures([]);
    try {
      const caseResponse = await api.getRenovationCase(propertyId, caseId);
      if (!caseResponse.success || !caseResponse.data) {
        throw new Error(caseResponse.message || 'Renovation plan not found');
      }
      const loadedCase = caseResponse.data as RenovationWorkspaceCase;
      setRenovationCase(loadedCase);

      const [readinessResult, complianceResult] = await Promise.allSettled([
        api.getRenovationReadiness(propertyId, caseId),
        api.getRenovationComplianceWorkflow(propertyId, caseId),
      ]);
      const failures: string[] = [];
      const nextSupporting: SupportingState = {};
      if (readinessResult.status === 'fulfilled' && readinessResult.value.success) {
        nextSupporting.readiness = readinessResult.value.data as SupportingState['readiness'];
      } else {
        failures.push('readiness');
      }
      if (complianceResult.status === 'fulfilled' && complianceResult.value.success) {
        nextSupporting.compliance = complianceResult.value.data as SupportingState['compliance'];
      } else {
        failures.push('compliance records');
      }
      setSupporting(nextSupporting);
      setPartialFailures(failures);
      setRenovationCase({
        ...loadedCase,
        readinessSummary: nextSupporting.readiness?.summary ?? loadedCase.readinessSummary,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Renovation plan could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [caseId, propertyId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!renovationCase || trackedLifecycle.current === renovationCase.lifecycle) return;
    trackedLifecycle.current = renovationCase.lifecycle;
    track('workflow_step_reached', {
      tool: 'home-renovation-risk-advisor',
      propertyId,
      step: renovationCase.lifecycle,
    });
  }, [propertyId, renovationCase]);

  const nextAction = useMemo(
    () => renovationCase ? getRenovationNextAction(renovationCase, propertyId) : null,
    [propertyId, renovationCase],
  );
  const readiness = supporting.readiness?.summary ?? renovationCase?.readinessSummary;
  const conditions = supporting.compliance?.conditions ?? [];
  const openConditions = conditions.filter(condition => condition.status !== 'SATISFIED');
  const linkedRecordCount = renovationCase?.links?.length ?? 0;

  if (loading) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center p-6" aria-live="polite">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        Loading renovation workspace…
      </main>
    );
  }

  if (error || !renovationCase || !nextAction) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-800">
          <p>{error || 'Renovation plan not found'}</p>
          <Button variant="link" className="mt-2 h-auto p-0 text-red-800" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 pb-28 sm:p-6">
      <MobilePageIntro
        title={renovationCase.name}
        subtitle={renovationCase.objective || 'One plan from exploration through verified closeout.'}
        action={<StatusChip tone="info">{renovationLifecycleLabel(renovationCase.lifecycle)}</StatusChip>}
      />

      <nav aria-label="Renovation stages" className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        <ol className="flex min-w-max gap-1">
          {RENOVATION_STAGE_LABELS.map(stage => {
            const active = stage.toLowerCase() === nextAction.stage;
            return (
              <li key={stage}>
                <span
                  aria-current={active ? 'step' : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm ${active ? 'bg-indigo-100 font-semibold text-indigo-900' : 'text-slate-500'}`}
                >
                  {stage}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      {partialFailures.length ? (
        <div role="status" className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Some supporting details are temporarily unavailable.</p>
            <p>The plan is available, but {partialFailures.join(' and ')} could not be refreshed.</p>
          </div>
        </div>
      ) : null}

      <Card className="border-indigo-200">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Your next question</p>
            <h2 className="mt-1 text-xl font-semibold">{nextAction.question}</h2>
            <p className="mt-2 text-sm text-slate-600">{nextAction.description}</p>
          </div>
          <Button asChild>
            <Link href={nextAction.href}>
              {nextAction.title}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <section aria-labelledby="readiness-trust-heading" className="grid gap-4 md:grid-cols-3">
        <h2 id="readiness-trust-heading" className="sr-only">Readiness and trust details</h2>
        <Card>
          <CardContent className="space-y-2 p-5">
            <ShieldCheck className="h-5 w-5 text-indigo-700" aria-hidden="true" />
            <h3 className="font-semibold">Start readiness</h3>
            <p className="text-sm text-slate-600">
              {readiness?.state
                ? `${renovationLifecycleLabel(readiness.state)} · ${readiness.blockingItems ?? 0} blocking`
                : 'Not evaluated yet'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <FileCheck2 className="h-5 w-5 text-indigo-700" aria-hidden="true" />
            <h3 className="font-semibold">Compliance evidence</h3>
            <p className="text-sm text-slate-600">
              {openConditions.length} open condition{openConditions.length === 1 ? '' : 's'} · requirements are decision support until verified.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <FolderOpen className="h-5 w-5 text-indigo-700" aria-hidden="true" />
            <h3 className="font-semibold">Linked home records</h3>
            <p className="text-sm text-slate-600">{linkedRecordCount} specialist record{linkedRecordCount === 1 ? '' : 's'} linked to this plan.</p>
          </CardContent>
        </Card>
      </section>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <div className="flex gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <p>
            This workspace organizes renovation decisions and evidence. Permit, HOA, safety, tax, and professional requirements must be verified with the appropriate authority.
          </p>
        </div>
      </div>

      <section aria-labelledby="specialist-records-heading" className="space-y-3">
        <h2 id="specialist-records-heading" className="text-lg font-semibold">Specialist records</h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href={`/dashboard/properties/${propertyId}/renovations/${caseId}/requirements`}>Requirements</Link></Button>
          <Button asChild variant="outline"><Link href={`/dashboard/properties/${propertyId}/renovations/${caseId}/compliance`}>Permit & HOA workflow</Link></Button>
          <Button asChild variant="outline"><Link href={`/dashboard/properties/${propertyId}/projects`}>Projects</Link></Button>
          <Button asChild variant="outline"><Link href={`/dashboard/properties/${propertyId}/materials`}>Materials</Link></Button>
        </div>
      </section>
    </main>
  );
}
