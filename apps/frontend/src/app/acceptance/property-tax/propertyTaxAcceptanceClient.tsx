'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

const STAGES = [
  'overview',
  'bill',
  'changes',
  'exemptions',
  'review',
  'appeal',
  'history',
] as const;

type Stage = (typeof STAGES)[number];

export function PropertyTaxAcceptanceClient() {
  const searchParams = useSearchParams();
  const requested = searchParams.get('stage');
  const stage: Stage = STAGES.includes(requested as Stage)
    ? requested as Stage
    : 'overview';
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef(stage);

  useEffect(() => {
    if (previousStage.current !== stage) {
      headingRef.current?.focus();
      previousStage.current = stage;
    }
  }, [stage]);

  const href = (nextStage: Stage) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('stage', nextStage);
    return `/acceptance/property-tax?${next.toString()}`;
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-5 bg-slate-50 p-4 text-slate-950 sm:p-6 dark:bg-slate-950 dark:text-white">
      <a
        href="#property-tax-acceptance-content"
        className="sr-only rounded-lg bg-slate-950 px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:outline-none focus:ring-4 focus:ring-sky-400"
      >
        Skip to property-tax stage content
      </a>
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Home tool</p>
        <h1 className="mt-1 text-2xl font-semibold">Property Tax Center</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Understand the current record, verify official facts, and take the right next step.
        </p>
      </header>

      <nav
        aria-label="Property Tax Center stages"
        className="flex snap-x gap-2 overflow-x-auto pb-2 motion-reduce:scroll-auto"
      >
        {STAGES.map((item) => (
          <Link
            key={item}
            href={href(item)}
            aria-current={item === stage ? 'page' : undefined}
            style={{ display: 'inline-flex', minHeight: 44 }}
            className={`inline-flex min-h-11 shrink-0 snap-start items-center rounded-full border px-4 py-2 text-sm font-medium capitalize outline-none focus-visible:ring-4 focus-visible:ring-sky-400 ${
              item === stage
                ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            {item}
          </Link>
        ))}
      </nav>

      <section id="property-tax-acceptance-content">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold capitalize outline-none focus-visible:ring-4 focus-visible:ring-sky-400"
        >
          {stage} stage
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Event, match, action, and case context remain attached across every stage.
        </p>
      </section>

      <section aria-live="polite" className="rounded-2xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-800 dark:bg-sky-950/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200">What matters now</p>
        <h2 className="mt-1 text-lg font-semibold">
          {stage === 'changes'
            ? 'Resolve the conflicting assessed value'
            : stage === 'appeal'
              ? 'Verify the official filing window'
              : 'Confirm the current bill and assessment'}
        </h2>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
          The exact next step is based on sourced facts and reviewed rules; no deadline, history, or expected savings is inferred.
        </p>
      </section>

      <section aria-labelledby="acceptance-source-legend" className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 id="acceptance-source-legend" className="font-semibold">How to read these values</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
            <h3 className="font-semibold">Official</h3>
            <p>Fetched from a reviewed assessor source with an observation date and match method.</p>
          </article>
          <article className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
            <h3 className="font-semibold">Confirmed</h3>
            <p>Verified from a Vault document or explicitly saved by the homeowner.</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950">
            <h3 className="font-semibold">Estimated</h3>
            <p>A planning calculation that cannot establish history, appeal merit, a deadline, or savings.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
