'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  CalendarRange,
  CircleDollarSign,
  FileSearch,
  Receipt,
} from 'lucide-react';
import { getTrueCostOwnership, type TrueCostOwnershipDTO } from '../tools/true-cost/trueCostApi';
import { track } from '@/lib/analytics/events';

const VIEWS = [
  { key: 'current', label: 'Current cost', icon: CircleDollarSign },
  { key: 'changes', label: 'What changed', icon: FileSearch },
  { key: 'forecast', label: 'What may change', icon: CalendarRange },
  { key: 'variability', label: 'Plan a buffer', icon: Activity },
] as const;

type OwnershipCostsView = typeof VIEWS[number]['key'];

function money(value: number | null | undefined) {
  if (value == null) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function OwnershipCostsClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const propertyId = params.id;
  const requestedView = searchParams.get('view');
  const view: OwnershipCostsView = VIEWS.some((item) => item.key === requestedView)
    ? requestedView as OwnershipCostsView
    : 'current';
  const [data, setData] = useState<TrueCostOwnershipDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    let active = true;
    setError(null);
    void getTrueCostOwnership(propertyId, 5)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Ownership costs are temporarily unavailable.');
        }
      });
    track('workflow_started', {
      tool: 'ownership-costs',
      propertyId,
      entryPoint: 'direct',
    });
    return () => {
      active = false;
    };
  }, [propertyId]);

  const categories = useMemo(() => [
    { label: 'Property tax', amount: data?.current.annualTaxNow, status: 'Estimated' },
    {
      label: 'Insurance',
      amount: data?.current.annualInsuranceNow,
      status: data?.current.annualInsuranceNow ? 'Confirmed or reported' : 'Missing',
    },
    { label: 'Routine maintenance', amount: data?.current.annualMaintenanceNow, status: 'Benchmark' },
    { label: 'Utilities', amount: data?.current.annualUtilitiesNow, status: 'Benchmark' },
  ], [data]);

  const viewContent = {
    current: {
      title: 'Current operating-expense estimate',
      description: 'A partial view of recurring costs. Financing, HOA, recurring services, and capital projects are not included yet.',
    },
    changes: {
      title: 'What changed',
      description: 'We do not have enough comparable observed bills to show a complete change yet. Modeled backcasts are not treated as history.',
    },
    forecast: {
      title: 'What may change',
      description: 'Forward scenarios will begin after the latest confirmed period and will keep assumptions separate from canonical facts.',
    },
    variability: {
      title: 'Plan for variability',
      description: 'Measured variability is withheld until at least three comparable observed annual periods exist. Budget planning remains separate from measured history.',
    },
  }[view];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href={`/dashboard/properties/${propertyId}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to property
      </Link>

      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-teal-50/50 p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
              <Receipt className="h-3.5 w-3.5" />
              Material financial planning
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Cost of owning this home</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              See what this home costs today, where each number came from, what changed,
              what may change next, and the action that could improve your plan.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
            <div className="text-xs font-medium text-slate-500">Operating expense</div>
            <div className="mt-1 text-2xl font-semibold text-slate-950">
              {money(data?.current.annualTotalNow)}
              <span className="ml-1 text-sm font-normal text-slate-500">/ year</span>
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {money(data ? data.current.annualTotalNow / 12 : null)} / month
            </div>
          </div>
        </div>

        <nav aria-label="Ownership cost views" className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {VIEWS.map((item) => {
            const Icon = item.icon;
            const active = item.key === view;
            return (
              <Link
                key={item.key}
                href={`/dashboard/properties/${propertyId}/ownership-costs?view=${item.key}`}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white/75 text-slate-700 hover:border-slate-400'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </section>

      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-slate-950">{viewContent.title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{viewContent.description}</p>

        {view === 'current' ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Current ownership cost categories and evidence status</caption>
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Annual amount</th>
                  <th className="px-4 py-3">Evidence status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {categories.map((category) => (
                  <tr key={category.label}>
                    <td className="px-4 py-3 font-medium text-slate-900">{category.label}</td>
                    <td className="px-4 py-3 text-slate-700">{money(category.amount)}</td>
                    <td className="px-4 py-3 text-slate-600">{category.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-700">
            This view is established in the canonical workspace. Its canonical evidence adapter and persisted read model are delivered in the next implementation slices.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        This estimate is educational planning support, not financial, tax, insurance,
        mortgage, valuation, or investment advice. Missing categories are not zero.
      </section>
    </main>
  );
}
