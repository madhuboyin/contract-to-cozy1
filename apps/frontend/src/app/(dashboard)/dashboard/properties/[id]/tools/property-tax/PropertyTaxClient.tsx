'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

import { getPropertyTaxEstimate, PropertyTaxEstimateDTO } from './taxApi';
import HomeToolsRail from '../../components/HomeToolsRail';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import { PropertyContextCapturePanel } from '@/components/property-context/PropertyContextCapturePanel';
import { propertyTaxTrust } from '@/lib/trust/trustPresets';
import { track } from '@/lib/analytics/events';

function money(value: number | null | undefined, currency = 'USD') {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
}

function pct(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function sourceLabel(source?: PropertyTaxEstimateDTO['current']['source']) {
  return source === 'HOMEOWNER_REPORTED'
    ? 'Homeowner-reported planning inputs'
    : 'Rough planning estimate';
}

export default function PropertyTaxClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const propertyId = params.id;
  const appealMode = searchParams.get('mode') === 'appeal';

  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<PropertyTaxEstimateDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assessedValue, setAssessedValue] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const requestRef = useRef(0);

  async function refresh() {
    if (!propertyId) return;
    setLoading(true);
    setError(null);

    const assessedValueInput = assessedValue ? Number(assessedValue) : undefined;
    const taxRatePercent = taxRate ? Number(taxRate) : undefined;
    const taxRateInput = taxRatePercent !== undefined && Number.isFinite(taxRatePercent)
      ? taxRatePercent / 100
      : undefined;
    const requestId = ++requestRef.current;

    try {
      const result = await getPropertyTaxEstimate(propertyId, {
        assessedValue: Number.isFinite(assessedValueInput) ? assessedValueInput : undefined,
        taxRate: Number.isFinite(taxRateInput) ? taxRateInput : undefined,
      });
      if (requestId === requestRef.current) setEstimate(result);
    } catch (cause: unknown) {
      if (requestId !== requestRef.current) return;
      setError(cause instanceof Error ? cause.message : 'Failed to load property tax estimate');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!propertyId) return;
    void refresh();
    track('workflow_started', {
      tool: 'property-tax',
      propertyId,
      entryPoint: appealMode ? 'appeal_redirect' : 'direct',
    });
    // Loading an estimate is not workflow completion. Completion requires a
    // recorded decision or external tax action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const invalidAssessedValue = Boolean(assessedValue) && !Number.isFinite(Number(assessedValue));
  const invalidTaxRate = Boolean(taxRate) && !Number.isFinite(Number(taxRate));

  return (
    <ToolWorkspaceTemplate
      backHref={`/dashboard/properties/${propertyId}`}
      backLabel="Back to property"
      eyebrow="Home tool"
      title="Property Tax Center"
      subtitle="Understand the current planning estimate, verify official facts, and prepare the right next step."
      introAction={
        <HomeToolsRail propertyId={propertyId} context="property-tax" currentToolId="property-tax" showDesktop={false} />
      }
      trust={propertyTaxTrust({
        confidenceLabel: estimate
          ? `${sourceLabel(estimate.current.source)} · ${estimate.current.confidence.toLowerCase()} input confidence`
          : 'Planning estimate only',
        freshnessLabel: estimate?.meta.generatedAt ? 'Calculated from current inputs' : 'Not yet calculated',
      })}
    >
      <HomeToolHeader
        toolId="property-tax"
        propertyId={propertyId}
        context="property-tax"
        currentToolId="property-tax"
      />

      <PropertyContextCapturePanel
        propertyId={propertyId}
        featureKey="PROPERTY_TAX"
        operationKey="VIEW_ESTIMATE"
        onCaptured={() => void refresh()}
      />

      <nav aria-label="Property Tax Center stages" className="flex flex-wrap gap-2">
        <Link
          href={`/dashboard/properties/${propertyId}/tools/property-tax`}
          aria-current={!appealMode ? 'page' : undefined}
          className={`rounded-full border px-4 py-2 text-sm font-medium ${
            !appealMode ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
          }`}
        >
          Overview
        </Link>
        <Link
          href={`/dashboard/properties/${propertyId}/tools/property-tax?mode=appeal`}
          aria-current={appealMode ? 'page' : undefined}
          className={`rounded-full border px-4 py-2 text-sm font-medium ${
            appealMode ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
          }`}
        >
          Appeal readiness
        </Link>
      </nav>

      {appealMode && (
        <section className="rounded-2xl border border-amber-200/80 bg-amber-50/85 p-5 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-100">
          <h2 className="text-base font-semibold">Appeal readiness requires verified local rules</h2>
          <p className="mt-2 text-sm">
            This center does not currently determine your chance of success, filing deadline, required form, or expected savings.
            Confirm those details with the official assessor or appeals authority before filing.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-amber-200/70 bg-white/70 p-4 dark:border-amber-800/50 dark:bg-slate-950/35">
              <h3 className="text-sm font-semibold">Verify first</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                <li>Parcel, tax year, assessment stage, and valuation date</li>
                <li>Classification, assessment ratio, exemptions, and taxable value</li>
                <li>Official deadline, permitted grounds, form, fee, and evidence standard</li>
              </ul>
            </div>
            <div className="rounded-xl border border-amber-200/70 bg-white/70 p-4 dark:border-amber-800/50 dark:bg-slate-950/35">
              <h3 className="text-sm font-semibold">Prepare evidence</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                <li>The current assessment notice or bill</li>
                <li>Documents supporting factual, exemption, classification, or condition issues</li>
                <li>Jurisdiction-qualified comparable records when permitted</li>
              </ul>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Planning inputs</h2>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          Enter both values from the same current official bill or notice. A single override does not make the result high confidence.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Assessed value (USD)</span>
            <input
              value={assessedValue}
              onChange={(event) => setAssessedValue(event.target.value)}
              placeholder="e.g. 425000"
              inputMode="decimal"
              aria-invalid={invalidAssessedValue}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {invalidAssessedValue && <span className="mt-1 block text-xs text-red-600">Enter a valid number.</span>}
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Effective tax rate (%)</span>
            <input
              value={taxRate}
              onChange={(event) => setTaxRate(event.target.value)}
              placeholder="e.g. 1.85"
              inputMode="decimal"
              aria-invalid={invalidTaxRate}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {invalidTaxRate && <span className="mt-1 block text-xs text-red-600">Enter a valid number.</span>}
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || invalidAssessedValue || invalidTaxRate}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {loading ? 'Refreshing…' : 'Refresh planning estimate'}
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/55 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Rough annual property-tax estimate</h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{estimate?.input.addressLabel || '—'}</p>
            </div>
            <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
              {sourceLabel(estimate?.current.source)}
            </span>
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100">{money(estimate?.current.annualTax)}</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">About {money(estimate?.current.monthlyTax)} per month</div>
            </div>
            <div className="text-right text-sm">
              <div>Assessed value: {money(estimate?.current.assessedValue)}</div>
              <div className="mt-1">Effective rate: {estimate?.current.taxRate ? pct(estimate.current.taxRate) : '—'}</div>
            </div>
          </div>
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
            This is not an observed tax record. It must not be used to infer historical changes, peer standing, appeal merit, or a filing deadline.
          </p>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/55">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Planning scenarios</h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Forward projections only; these are not historical observations.</p>
          <div className="mt-4 space-y-3">
            {(estimate?.projection || []).map((projection) => (
              <div key={projection.years} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-xs text-slate-600 dark:text-slate-300">{projection.years}-year scenario</div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{money(projection.estimatedAnnualTax)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/55">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">What affects this estimate</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(estimate?.drivers || []).map((driver) => (
            <div key={driver.factor} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">{driver.factor}</h3>
                <span className="text-xs text-slate-600 dark:text-slate-300">{driver.impact}</span>
              </div>
              <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">{driver.explanation}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/70 bg-white/80 p-5 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/55">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Safe next step</h2>
        <p className="mt-2 text-slate-700 dark:text-slate-300">
          Verify the current parcel, classification, exemptions, assessed and taxable values, bill amount, and local process with the official assessor or collector.
        </p>
        <Link
          href={`/dashboard/properties/${propertyId}/tools/property-tax?mode=appeal`}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-slate-900 px-4 font-medium text-white dark:bg-white dark:text-slate-900"
        >
          Review appeal readiness
        </Link>
      </section>
    </ToolWorkspaceTemplate>
  );
}
