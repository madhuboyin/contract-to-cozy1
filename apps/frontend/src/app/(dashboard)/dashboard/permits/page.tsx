'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, AlertTriangle, ChevronRight, FileSearch } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { PermitSummary, PermitFetchJobSummary, PermitHubSummary } from '@/types';
import PermitCard from '@/components/features/permits/PermitCard';
import FetchStatusBanner from '@/components/features/permits/FetchStatusBanner';
import DisclosureExportButton from '@/components/features/permits/DisclosureExportButton';
import { track } from '@/lib/analytics/events';

const ACTIVE_STATUSES = ['ISSUED', 'INSPECTION_PENDING', 'INSPECTION_FAILED', 'APPLIED'];

export default function PermitHubPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const propertyId = searchParams.get('propertyId') ?? '';

  const [permits, setPermits] = useState<PermitSummary[]>([]);
  const [fetchJob, setFetchJob] = useState<PermitFetchJobSummary | null>(null);
  const [summary, setSummary] = useState<PermitHubSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollingFetch, setPollingFetch] = useState(false);

  const load = useCallback(async () => {
    if (!propertyId) return;
    const [p, f, s] = await Promise.all([
      api.listPermits(propertyId, { limit: 50 }).catch(() => ({ items: [] as PermitSummary[] })),
      api.getPermitFetchStatus(propertyId).catch(() => null),
      api.getPermitSummary(propertyId).catch(() => null),
    ]);
    setPermits(p.items);
    setFetchJob(f);
    setSummary(s);
  }, [propertyId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!propertyId) return;
    track('workflow_started', { tool: 'permits', propertyId, entryPoint: 'direct' });
  }, [propertyId]);

  // Poll while a fetch is running
  useEffect(() => {
    if (!fetchJob || !['QUEUED', 'RUNNING'].includes(fetchJob.status)) return;
    if (pollingFetch) return;
    setPollingFetch(true);
    const interval = setInterval(async () => {
      const f = await api.getPermitFetchStatus(propertyId).catch(() => null);
      setFetchJob(f);
      if (f && !['QUEUED', 'RUNNING'].includes(f.status)) {
        clearInterval(interval);
        setPollingFetch(false);
        await load();
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchJob?.status, propertyId, pollingFetch, load]);

  async function handleTriggerFetch() {
    if (!propertyId) return;
    const { fetchJobId } = await api.triggerPermitFetch(propertyId);
    const f = await api.getPermitFetchStatus(propertyId).catch(() => null);
    setFetchJob(f ?? { id: fetchJobId, status: 'QUEUED', startedAt: new Date().toISOString() });
    track('action_completed', { tool: 'permits', actionType: 'trigger_fetch', propertyId });
  }

  if (!propertyId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 p-4 text-center">
        <FileSearch className="h-10 w-10 text-neutral-300" />
        <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">Select a property to view permits.</p>
        <Link href="/dashboard/properties" className="text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]">
          Go to Properties →
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-[hsl(var(--mobile-brand-strong))]" />
      </div>
    );
  }

  const activePermits = permits.filter((p) => ACTIVE_STATUSES.includes(p.status));
  const historicalPermits = permits.filter((p) => !ACTIVE_STATUSES.includes(p.status));

  return (
    <div className="space-y-6 p-4 pb-24">
      {/* Header */}
      <div>
        <p className="text-xs text-[hsl(var(--mobile-text-muted))]">Home Tool</p>
        <h1 className="text-xl font-bold">Permit Tracker</h1>
        <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
          Permit history, inspection readiness checks, and disclosure export
        </p>
      </div>

      {/* Fetch Status Banner */}
      <FetchStatusBanner
        fetchJob={fetchJob}
        onTrigger={handleTriggerFetch}
      />

      {/* Open Flags Strip */}
      {summary && summary.openFlags > 0 && (
        <Link
          href={`/dashboard/permits/flags?propertyId=${propertyId}`}
          className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              {summary.openFlags} item{summary.openFlags !== 1 ? 's' : ''} may be unpermitted
            </p>
            {summary.highRiskFlags > 0 && (
              <p className="text-xs text-amber-600 mt-0.5">
                {summary.highRiskFlags} high-risk flag{summary.highRiskFlags !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-amber-500 shrink-0" />
        </Link>
      )}

      {/* Summary counts */}
      {summary && summary.totalPermits > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total', value: summary.totalPermits },
            { label: 'Active', value: summary.activePermits },
            { label: 'Finaled', value: summary.finaledPermits },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border bg-[hsl(var(--mobile-card-bg))] p-3 text-center">
              <p className="text-xl font-bold">{item.value}</p>
              <p className="text-xs text-[hsl(var(--mobile-text-muted))]">{item.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Active Permits */}
      {activePermits.length > 0 && (
        <section>
          <p className="mb-2 text-sm font-semibold">Active Permits</p>
          <div className="space-y-2">
            {activePermits.map((p) => (
              <PermitCard key={p.id} permit={p} propertyId={propertyId} />
            ))}
          </div>
        </section>
      )}

      {/* Historical Permits */}
      {historicalPermits.length > 0 && (
        <section>
          <p className="mb-2 text-sm font-semibold">Permit History</p>
          <div className="space-y-2">
            {historicalPermits.map((p) => (
              <PermitCard key={p.id} permit={p} propertyId={propertyId} />
            ))}
          </div>
        </section>
      )}

      {permits.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <FileSearch className="h-10 w-10 text-neutral-300" />
          <div>
            <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">No permit records yet.</p>
            <p className="text-xs text-[hsl(var(--mobile-text-muted))]">
              Try looking up permits above or add one manually.
            </p>
          </div>

          <div className="w-full rounded-2xl border bg-[hsl(var(--mobile-card-bg))] p-4 text-left">
            <p className="mb-2 text-sm font-semibold">Already finished renovation work?</p>
            <p className="mb-3 text-xs text-[hsl(var(--mobile-text-muted))]">
              Here&apos;s how to check if it&apos;s ready for the real inspection:
            </p>
            <ol className="space-y-2 text-xs text-[hsl(var(--mobile-text-secondary))]">
              <li className="flex gap-2">
                <span className="shrink-0 font-semibold text-[hsl(var(--mobile-brand-strong))]">1.</span>
                Tap <span className="font-medium text-foreground">Add Permit</span> below and enter the permit for your work
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 font-semibold text-[hsl(var(--mobile-brand-strong))]">2.</span>
                Open it and find the inspection stage you&apos;re about to call for (Framing, Rough-In, Final, etc.)
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 font-semibold text-[hsl(var(--mobile-brand-strong))]">3.</span>
                Tap <span className="font-medium text-foreground">Check Readiness</span> on that stage, upload photos of the completed work, and get an AI readiness verdict before you call the inspector
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Disclosure Export */}
      {permits.length > 0 && (
        <section>
          <p className="mb-2 text-sm font-semibold">Disclosure Pack</p>
          <DisclosureExportButton propertyId={propertyId} />
          <p className="mt-2 text-xs text-[hsl(var(--mobile-text-muted))] text-center">
            PDF summary of all permits and flags for resale or personal records.
          </p>
        </section>
      )}

      {/* Flags nav */}
      <Link
        href={`/dashboard/permits/flags?propertyId=${propertyId}`}
        className="flex items-center gap-3 rounded-2xl border bg-[hsl(var(--mobile-card-bg))] p-4"
      >
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Unpermitted Work Flags</p>
          <p className="text-xs text-[hsl(var(--mobile-text-muted))]">Review and investigate potential gaps</p>
        </div>
        <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
      </Link>

      {/* FAB */}
      <div className="fixed bottom-20 right-4 z-50">
        <Link
          href={`/dashboard/permits/add?propertyId=${propertyId}`}
          className="flex items-center gap-2 rounded-full bg-[hsl(var(--mobile-brand-strong))] px-4 py-3 text-sm font-semibold text-white shadow-lg"
        >
          <Plus className="h-4 w-4" />
          Add Permit
        </Link>
      </div>
    </div>
  );
}
