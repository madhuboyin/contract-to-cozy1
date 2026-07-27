'use client';

import { useEffect, useState } from 'react';
import {
  getInsuranceMarketContext,
  type InsuranceMarketContextDTO,
} from '@/lib/api/insuranceMarketContextApi';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function InsuranceMarketContextPanel({ propertyId }: { propertyId: string }) {
  const [context, setContext] = useState<InsuranceMarketContextDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void getInsuranceMarketContext(propertyId)
      .then((result) => {
        if (active) setContext(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [propertyId]);

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-card p-5" aria-busy="true">
        <h2 className="text-base font-semibold">Observed market context</h2>
        <p className="mt-2 text-sm text-muted-foreground">Checking qualified source coverage…</p>
      </section>
    );
  }

  if (failed || !context) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Observed market context unavailable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Market context could not be loaded. Your saved policy facts and renewal history are
          unaffected.
        </p>
      </section>
    );
  }

  if (context.state !== 'READY') {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Observed market context unavailable</h2>
        <p className="mt-2 text-sm text-muted-foreground">{context.message}</p>
        {context.state === 'STALE' && (
          <p className="mt-2 text-xs text-muted-foreground">
            Last retrieved {formatDate(context.lastRetrievedAt)} from{' '}
            <a
              href={context.source.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
              style={{ color: 'hsl(var(--foreground))' }}
            >
              {context.source.name}
            </a>
            . Expired {formatDate(context.expiredAt)}.
          </p>
        )}
      </section>
    );
  }

  const { current, previous, change } = context;
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Observed market context — not a quote
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            {formatMoney(current.value, current.currency)} annual premium reference
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {current.geography.code} · {formatDate(current.period.start)}–{formatDate(current.period.end)}
            {' · '}
            {current.coverageBasis.label}
          </p>
        </div>
        {change && previous && (
          <div className="rounded-lg bg-muted px-3 py-2 text-right">
            <p className="text-xs text-muted-foreground">Change between observed periods</p>
            <p className="text-sm font-semibold">
              {change.absolute >= 0 ? '+' : ''}
              {formatMoney(change.absolute, current.currency)}
              {change.percent == null
                ? ''
                : ` (${change.percent >= 0 ? '+' : ''}${change.percent.toFixed(1)}%)`}
            </p>
          </div>
        )}
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Source and owner</dt>
          <dd>
            <a
              href={current.source.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-2"
              style={{ color: 'hsl(var(--foreground))' }}
            >
              {current.source.name}
            </a>{' '}
            · {current.source.ownerName}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Release</dt>
          <dd>
            {current.releaseVersion} · retrieved {formatDate(current.retrievedAt)}
            {current.sampleSize ? ` · sample ${current.sampleSize.toLocaleString()}` : ''}
          </dd>
        </div>
      </dl>

      <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <p className="font-medium">Method and limitations</p>
        <p className="mt-1 text-muted-foreground">{current.methodologySummary}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          {current.coverageBasis.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        This period-level observation is not a personal insurance quote or carrier offer. It does
        not establish whether your premium is appropriate; your property, limits, deductibles,
        endorsements, claims history, and underwriting factors may differ.
      </p>
    </section>
  );
}
