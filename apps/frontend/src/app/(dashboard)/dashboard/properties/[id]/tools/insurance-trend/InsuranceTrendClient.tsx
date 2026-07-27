'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import MultiLineChart from './MultiLineChart';
import {
  getInsurancePolicyHistory,
  type InsuranceHistoryValueDTO,
  type InsurancePolicyHistoryDTO,
} from '@/lib/api/coverageAnalysisApi';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
import { track } from '@/lib/analytics/events';

const FIELD_LABELS: Record<string, string> = {
  ANNUAL_PREMIUM: 'Annual premium',
  ALL_PERIL_DEDUCTIBLE: 'All-peril deductible',
  DWELLING_LIMIT: 'Dwelling limit',
  PERSONAL_PROPERTY_LIMIT: 'Personal-property limit',
  LIABILITY_LIMIT: 'Liability limit',
  POLICY_FORM: 'Policy form',
  VALUATION_BASIS: 'Valuation basis',
  ENDORSEMENTS: 'Endorsements',
};

function formatDate(value: string | null) {
  if (!value) return 'date unknown';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatValue(value: InsuranceHistoryValueDTO) {
  if (value.valueType === 'AMOUNT' && value.amountValue != null) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: value.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(Number(value.amountValue));
  }
  if (value.valueType === 'BOOLEAN') return value.booleanValue ? 'Yes' : 'No';
  if (value.valueType === 'JSON') {
    return Array.isArray(value.jsonValue)
      ? value.jsonValue.join(', ')
      : 'Structured policy detail';
  }
  return value.textValue ?? 'Unknown';
}

export default function InsuranceTrendClient({ embedded = false }: { embedded?: boolean }) {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceBackHref = guidanceJourneyId
    ? buildGuidanceOverviewHref({
        propertyId,
        journeyId: guidanceJourneyId,
        stepKey: guidanceStepKey,
        inventoryItemId: searchParams.get('itemId'),
        issueType: searchParams.get('issueType'),
      })
    : null;
  const [history, setHistory] = useState<InsurancePolicyHistoryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHistory(await getInsurancePolicyHistory(propertyId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Renewal history is unavailable.');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void load();
    track('workflow_started', {
      tool: 'coverage-intelligence',
      propertyId,
      entryPoint: guidanceJourneyId ? 'guidance' : 'direct',
    });
  }, [guidanceJourneyId, load, propertyId]);

  useEffect(() => {
    if (!history) return;
    track('workflow_completed', { tool: 'coverage-intelligence', propertyId });
  }, [history, propertyId]);

  const termsNewestFirst = useMemo(
    () => [...(history?.terms ?? [])].reverse(),
    [history?.terms]
  );
  const documentNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const term of history?.terms ?? []) {
      if (term.sourceDocument) names.set(term.sourceDocument.id, term.sourceDocument.name);
      for (const fact of term.facts) {
        if (fact.sourceDocument) names.set(fact.sourceDocument.id, fact.sourceDocument.name);
      }
    }
    return names;
  }, [history?.terms]);
  const premiumChart =
    history && history.premiumSeries.length >= 2
      ? {
          x: history.premiumSeries.map((point) => formatDate(point.termStart)),
          series: [
            {
              key: 'observed-premium',
              label: 'Observed confirmed annual premium',
              values: history.premiumSeries.map((point) => point.annualPremium),
              opacity: 1,
              strokeWidth: 3,
            },
          ],
        }
      : null;
  const showRenewalCta =
    history?.renewalAction.status !== 'LATER' && history?.renewalAction.status !== undefined;

  return (
    <ToolWorkspaceTemplate
      embedded={embedded}
      backHref={guidanceBackHref ?? `/dashboard/properties/${propertyId}`}
      backLabel={guidanceBackHref ? 'Back to guidance' : 'Back to property'}
      eyebrow="Observed history"
      title="Renewal & Premium History"
      subtitle="Confirmed policy terms only. Modeled estimates are not included in this history."
      introAction={
        embedded ? undefined : (
          <HomeToolsRail
            propertyId={propertyId}
            context="coverage-intelligence"
            currentToolId="coverage-intelligence"
            showDesktop={false}
          />
        )
      }
    >
      {loading ? (
        <div className="rounded-xl border border-border bg-card p-4" aria-busy="true">
          <p className="text-sm text-muted-foreground">Loading confirmed policy terms…</p>
        </div>
      ) : error || !history ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Renewal history unavailable</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {error ?? 'The history could not be loaded.'}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Renewal action
            </p>
            <h2 className="mt-1 text-base font-semibold">{history.renewalAction.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {history.renewalAction.detail}
            </p>
            {showRenewalCta && (
              <Link
                href={`/dashboard/properties/${propertyId}/tools/coverage-intelligence`}
                className="mt-3 inline-flex min-h-10 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                Review current policy facts
              </Link>
            )}
          </section>

          {history.historyState === 'NO_CONFIRMED_TERMS' ? (
            <section className="rounded-xl border border-dashed border-border bg-card p-4">
              <h2 className="text-sm font-semibold">No confirmed term history yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add and confirm a declarations document. ContractToCozy will not generate prior
                premiums or policy terms to fill this space.
              </p>
            </section>
          ) : history.historyState === 'ONE_CONFIRMED_TERM' ? (
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">One confirmed term</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The current term is shown below. A prior confirmed term is needed before changes or
                a premium chart can be displayed.
              </p>
            </section>
          ) : history.historyState === 'PARTIAL_HISTORY' ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <h2 className="text-sm font-semibold text-amber-950">Partial renewal history</h2>
              <p className="mt-1 text-sm text-amber-900/80">
                Confirmed terms exist, but there is no comparable prior term for the same policy.
              </p>
            </section>
          ) : null}

          {premiumChart && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Observed annual premium</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Solid line: homeowner-confirmed policy facts. No estimates or market benchmarks.
              </p>
              <div className="mt-4">
                <MultiLineChart
                  xLabels={premiumChart.x}
                  series={premiumChart.series}
                  ariaLabel="Observed confirmed annual premium by policy term"
                />
              </div>
            </section>
          )}

          {history.changes.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-base font-semibold">Observed term changes</h2>
                <p className="text-sm text-muted-foreground">
                  Each difference links to confirmed facts from both policy terms.
                </p>
              </div>
              {history.changes.map((change) => {
                const fromSource = change.sourceEvidenceJson.from;
                const toSource = change.sourceEvidenceJson.to;
                return (
                  <article key={change.id} className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {change.category.toLowerCase()}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold">
                      {FIELD_LABELS[change.changeKey] ?? change.changeKey}
                    </h3>
                    <p className="mt-2 text-sm">
                      <span className="text-muted-foreground">
                        {formatValue(change.oldValueJson)}
                      </span>{' '}
                      → <span className="font-medium">{formatValue(change.newValueJson)}</span>
                    </p>
                    <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <p>
                        Prior source:{' '}
                        {fromSource.sourceDocumentId
                          ? documentNames.get(fromSource.sourceDocumentId) ?? 'Policy document'
                          : `confirmed fact ${fromSource.factId}`}
                        {fromSource.sourcePage ? `, page ${fromSource.sourcePage}` : ''}
                      </p>
                      <p>
                        New source:{' '}
                        {toSource.sourceDocumentId
                          ? documentNames.get(toSource.sourceDocumentId) ?? 'Policy document'
                          : `confirmed fact ${toSource.factId}`}
                        {toSource.sourcePage ? `, page ${toSource.sourcePage}` : ''}
                      </p>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">Policy-term timeline</h2>
              <p className="text-sm text-muted-foreground">
                Verified terms in the Living Home Record, newest first.
              </p>
            </div>
            {termsNewestFirst.map((term) => {
              const premium = term.facts.find((fact) => fact.factKey === 'ANNUAL_PREMIUM');
              return (
                <article key={term.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">
                        {term.insurancePolicy.carrierName} · {term.insurancePolicy.policyNumber}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDate(term.termStart)}–{formatDate(term.termEnd)}
                      </p>
                    </div>
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">
                      verified
                    </span>
                  </div>
                  <p className="mt-3 text-sm">
                    Annual premium:{' '}
                    <span className="font-medium">
                      {premium?.amountValue != null
                        ? formatValue({
                            valueType: 'AMOUNT',
                            amountValue: Number(premium.amountValue),
                            currency: premium.currency ?? 'USD',
                          })
                        : 'Unknown'}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Source: {term.sourceDocument?.name ?? 'homeowner-confirmed policy facts'}
                  </p>
                </article>
              );
            })}
          </section>

          <p className="text-xs text-muted-foreground">
            This timeline reports observed records only. It does not predict future premiums,
            determine coverage, or replace licensed insurance advice.
          </p>
        </>
      )}
    </ToolWorkspaceTemplate>
  );
}
