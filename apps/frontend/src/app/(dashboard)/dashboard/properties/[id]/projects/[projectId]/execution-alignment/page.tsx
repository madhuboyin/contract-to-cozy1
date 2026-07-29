'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import {
  EmptyStateCard,
  MobileCard,
  MobilePageContainer,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { ErrorBanner, fmtDate, ProjectNav, Spinner } from '../../ProjectTrackerHelpers';

type Alignment = Awaited<ReturnType<typeof api.getProjectExecutionAlignment>>;

export default function ExecutionAlignmentPage() {
  const { id: propertyId, projectId } = useParams<{ id: string; projectId: string }>();
  const [alignment, setAlignment] = useState<Alignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAlignment(await api.getProjectExecutionAlignment(propertyId, projectId));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load compliance alignment');
    } finally {
      setLoading(false);
    }
  }, [propertyId, projectId]);

  useEffect(() => { load(); }, [load]);

  async function reconcile() {
    setReconciling(true);
    setError(null);
    try {
      await api.reconcileProjectExecution(propertyId, projectId);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Reconciliation failed');
    } finally {
      setReconciling(false);
    }
  }

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-4xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/projects/${projectId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to overview
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compliance sync</h1>
          <p className="mt-1 text-sm text-slate-600">
            Permit Tracker and renovation compliance remain authoritative. Project milestones are read-only projections.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={reconciling} onClick={reconcile}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${reconciling ? 'animate-spin' : ''}`} />
          {reconciling ? 'Syncing…' : 'Retry sync'}
        </Button>
      </div>

      <ProjectNav propertyId={propertyId} projectId={projectId} />
      {error && <ErrorBanner msg={error} />}
      {loading && <Spinner />}

      {!loading && alignment?.projections.length === 0 && (
        <EmptyStateCard
          title="No compliance projections yet"
          description="Retry sync after permit inspection steps or HOA conditions have been attached to the renovation case."
        />
      )}

      {alignment && alignment.projections.length > 0 && (
        <section className="space-y-2">
          {alignment.projections.map(item => {
            const healthy = item.reconciliationStatus === 'HEALTHY';
            const sourceLabel = item.executionSourceType.startsWith('PERMIT_')
              ? 'Permit Tracker'
              : 'Renovation compliance';
            return (
              <MobileCard key={item.id} variant="compact" className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {sourceLabel} says {item.sourceStatus ?? 'unknown'} · Project shows {item.status}
                    </p>
                  </div>
                  <StatusChip tone={healthy ? 'good' : 'danger'}>
                    {healthy ? 'Aligned' : item.reconciliationStatus}
                  </StatusChip>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                  <span><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Authority: {sourceLabel}</span>
                  <span>Last sync: {fmtDate(item.lastReconciledAt)}</span>
                  <span>Attempts: {item.reconciliationAttempts}</span>
                </div>
                {item.reconciliationError && (
                  <p className="rounded bg-rose-50 p-2 text-xs text-rose-700">{item.reconciliationError}</p>
                )}
                <Button size="sm" variant="outline" className="h-8 text-xs" asChild>
                  <Link href={item.executionSourceType.startsWith('PERMIT_')
                    ? `/dashboard/permits?propertyId=${propertyId}`
                    : alignment.renovationCaseId
                      ? `/dashboard/properties/${propertyId}/renovations/${alignment.renovationCaseId}/compliance`
                      : '#'}>
                    Open authoritative source <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </MobileCard>
            );
          })}
        </section>
      )}
    </MobilePageContainer>
  );
}
