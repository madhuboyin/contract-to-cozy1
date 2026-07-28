'use client';

import React from 'react';
import {
  AlertTriangle,
  BotOff,
  DatabaseZap,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import {
  useAdminPropertyTaxCommands,
  useAdminPropertyTaxOperations,
} from '@/hooks/useAdminPropertyTaxOperations';

const HEALTH_CLASS: Record<string, string> = {
  HEALTHY: 'bg-emerald-50 text-emerald-800',
  WARNING: 'bg-amber-50 text-amber-800',
  CRITICAL: 'bg-rose-50 text-rose-800',
  DEGRADED: 'bg-amber-50 text-amber-800',
  STALE: 'bg-amber-50 text-amber-800',
  DISABLED: 'bg-slate-100 text-slate-700',
  ENABLED: 'bg-emerald-50 text-emerald-800',
  ACTIVE: 'bg-emerald-50 text-emerald-800',
};

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export default function PropertyTaxOperationsPage() {
  const guard = useAdminGuard({
    title: 'Property Tax Operations',
    subtitle: 'Source health, reviewed-rule freshness, safety guardrails, and emergency controls.',
  });
  const operations = useAdminPropertyTaxOperations(guard.isAdmin);
  const commands = useAdminPropertyTaxCommands();
  const { toast } = useToast();

  const onError = (error: unknown) => toast({
    title: 'Property-tax operation failed',
    description: error instanceof Error ? error.message : 'The operation could not be completed.',
    variant: 'destructive',
  });
  const reason = (question: string) => {
    const response = window.prompt(question);
    return response?.trim().length && response.trim().length >= 8
      ? response.trim()
      : null;
  };

  if (guard.status !== 'ready') return guard.node;

  return (
    <AdminConsoleShell
      title="Property Tax Operations"
      subtitle="Detect source and rule failures, contain unsafe states, and keep homeowner guidance fail-closed."
      actions={(
        <Button
          variant="outline"
          size="sm"
          onClick={() => operations.refetch()}
          disabled={operations.isFetching}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${operations.isFetching ? 'animate-spin motion-reduce:animate-none' : ''}`} />
          Refresh
        </Button>
      )}
      chips={operations.data ? (
        <>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold">
            {operations.data.summary.sourcesTotal} sources
          </span>
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
            {operations.data.summary.activeRules} active rules
          </span>
          <span className="rounded bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
            {operations.data.summary.criticalGuardrails} critical
          </span>
        </>
      ) : undefined}
    >
      {operations.isLoading ? (
        <AdminRouteState state="loading" title="Loading property-tax operations" description="Reading sources, rules, cases, and safety signals." />
      ) : null}
      {operations.isError ? (
        <AdminRouteState state="error" title="Unable to load property-tax operations" description="Check API and database connectivity, then retry." />
      ) : null}

      {operations.data ? (
        <div className="space-y-5">
          <section aria-labelledby="property-tax-guardrails-heading">
            <h2 id="property-tax-guardrails-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Safety guardrails
            </h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {operations.data.guardrails.map((guardrail) => (
                <article key={guardrail.code} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${HEALTH_CLASS[guardrail.severity]}`}>
                      {guardrail.severity}
                    </span>
                  </div>
                  <h3 className="mt-3 text-xs font-semibold text-slate-900">
                    {guardrail.code.replaceAll('_', ' ')}
                  </h3>
                  <p className="mt-1 text-2xl font-semibold text-slate-950">{guardrail.count}</p>
                  <p className="mt-2 text-[11px] leading-4 text-slate-600">{guardrail.explanation}</p>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="property-tax-sources-heading">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id="property-tax-sources-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Official assessment sources
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Active sources are considered stale after {operations.data.sourceStaleAfterHours} hours without a successful check.
                </p>
              </div>
            </div>
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              {operations.data.sources.map((source) => {
                const enabled = source.status === 'ACTIVE';
                return (
                  <article key={source.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <DatabaseZap className="h-4 w-4 text-slate-500" aria-hidden="true" />
                          <h3 className="text-sm font-semibold text-slate-900">{source.name}</h3>
                          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${HEALTH_CLASS[source.health]}`}>
                            {source.health}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {source.normalizedCoverageKey} · {source.adapterType}
                        </p>
                      </div>
                      <Button
                        variant={enabled ? 'destructive' : 'default'}
                        size="sm"
                        disabled={commands.source.isPending}
                        onClick={() => {
                          const operatorReason = reason(
                            enabled
                              ? 'Why must this property-tax source be disabled?'
                              : 'Why is this property-tax source safe to enable?',
                          );
                          if (!operatorReason) return;
                          commands.source.mutate({
                            sourceId: source.id,
                            enabled: !enabled,
                            reason: operatorReason,
                          }, { onError });
                        }}
                      >
                        {enabled ? 'Emergency disable' : 'Enable source'}
                      </Button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <div><span className="text-slate-400">Last fetch</span><p className="font-semibold">{formatDate(source.lastFetchAt)}</p></div>
                      <div><span className="text-slate-400">Matches</span><p className="font-semibold">{source.counts.parcelMatches}</p></div>
                      <div><span className="text-slate-400">Assessments</span><p className="font-semibold">{source.counts.assessmentRecords}</p></div>
                      <div><span className="text-slate-400">Bills</span><p className="font-semibold">{source.counts.billRecords}</p></div>
                    </div>
                    {source.lastFetchError ? (
                      <p role="status" className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                        {source.lastFetchError}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="property-tax-rules-heading">
            <h2 id="property-tax-rules-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Reviewed jurisdiction rules
            </h2>
            <div className="mt-2 space-y-3">
              {operations.data.rules.map((rule) => (
                <article key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">{rule.title} v{rule.version}</h3>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                          rule.expired || rule.expiringSoon
                            ? HEALTH_CLASS.WARNING
                            : HEALTH_CLASS[rule.status] ?? 'bg-slate-100 text-slate-700'
                        }`}>
                          {rule.expired ? 'EXPIRED' : rule.expiringSoon ? 'EXPIRING' : rule.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {rule.jurisdictionKey} · class {rule.propertyClass ?? 'all'} · reviewed {formatDate(rule.reviewedAt)} · expires {formatDate(rule.expiresAt)}
                      </p>
                      <p className="mt-2 text-xs text-slate-600">
                        {rule.counts.citations} citations · {rule.counts.deadlineRules} deadlines · {rule.counts.appealCases} cases
                      </p>
                    </div>
                    {rule.status === 'ACTIVE' ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={commands.rule.isPending}
                        onClick={() => {
                          const operatorReason = reason('Why must this reviewed rule be disabled immediately?');
                          if (!operatorReason) return;
                          commands.rule.mutate({ profileId: rule.id, reason: operatorReason }, { onError });
                        }}
                      >
                        Emergency disable
                      </Button>
                    ) : null}
                  </div>
                  {rule.latestControl ? (
                    <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                      {rule.latestControl.action.replaceAll('_', ' ')} {formatDate(rule.latestControl.createdAt)}: {rule.latestControl.reason}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="property-tax-ai-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <BotOff className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  <h2 id="property-tax-ai-heading" className="text-sm font-semibold text-slate-900">
                    Property-tax AI processing
                  </h2>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${HEALTH_CLASS[operations.data.ai.status]}`}>
                    {operations.data.ai.status}
                  </span>
                </div>
                <p className="mt-2 max-w-3xl text-xs text-slate-600">{operations.data.ai.reason}</p>
                <p className="mt-1 text-xs font-semibold text-slate-700">
                  Fail-closed: {operations.data.ai.failClosed ? 'Yes' : 'No'} · last changed {formatDate(operations.data.ai.updatedAt)}
                </p>
              </div>
              {operations.data.ai.enabled ? (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={commands.ai.isPending}
                  onClick={() => {
                    const operatorReason = reason('Why must property-tax AI processing be disabled immediately?');
                    if (!operatorReason) return;
                    commands.ai.mutate(operatorReason, { onError });
                  }}
                >
                  <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                  Emergency disable AI
                </Button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </AdminConsoleShell>
  );
}
