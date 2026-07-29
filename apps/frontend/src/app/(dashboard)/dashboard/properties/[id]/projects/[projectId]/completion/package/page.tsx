'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Copy, Download, Share2, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ProjectCloseoutPackage } from '@/types';
import { Button } from '@/components/ui/button';
import { MobileCard, MobilePageContainer } from '@/components/mobile/dashboard/MobilePrimitives';
import { ErrorBanner, Spinner } from '../../../ProjectTrackerHelpers';

type LedgerRow = {
  id: string;
  targetSystem: string;
  action: string;
  appliedAt: string;
  payload: Record<string, unknown>;
};

export default function ProjectCloseoutPackagePage() {
  const { id: propertyId, projectId } = useParams<{ id: string; projectId: string }>();
  const [closeout, setCloseout] = useState<ProjectCloseoutPackage | null>(null);
  const [writeBacks, setWriteBacks] = useState<LedgerRow[]>([]);
  const [shareUrl, setShareUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getProjectCloseoutPackage(propertyId, projectId);
      setCloseout(data.closeoutPackage);
      setWriteBacks(data.writeBacks);
    } catch (caught: any) {
      setError(caught?.message ?? 'Failed to load closeout package');
    } finally {
      setLoading(false);
    }
  }, [propertyId, projectId]);

  useEffect(() => { load(); }, [load]);

  function downloadPackage() {
    if (!closeout) return;
    const url = URL.createObjectURL(new Blob(
      [JSON.stringify(closeout, null, 2)],
      { type: 'application/json' },
    ));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${closeout.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-closeout.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function createShare() {
    setSharing(true);
    setError(null);
    try {
      const created = await api.createProjectCloseoutShare(propertyId, projectId);
      const absolute = new URL(created.shareUrl, window.location.origin).toString();
      setShareUrl(absolute);
      await navigator.clipboard.writeText(absolute);
    } catch (caught: any) {
      setError(caught?.message ?? 'Failed to create share link');
    } finally {
      setSharing(false);
    }
  }

  return (
    <MobilePageContainer className="space-y-4 pb-10 lg:max-w-3xl">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/projects/${projectId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to project
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Renovation closeout package</h1>
        <p className="mt-1 text-sm text-slate-500">
          Case status, authority evidence, actual outcome, living-home updates, and downstream reconciliation in one record.
        </p>
      </div>
      {error && <ErrorBanner msg={error} />}
      {loading && <Spinner />}
      {closeout && (
        <>
          <MobileCard className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">{closeout.project.name}</h2>
                <p className="text-sm text-slate-500">
                  {closeout.project.outcomeStatus.replace(/_/g, ' ').toLowerCase()} · generated {new Date(closeout.generatedAt).toLocaleString()}
                </p>
              </div>
              {closeout.verifiedInstalledFactsApplied
                ? <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                : <TriangleAlert className="h-6 w-6 text-amber-600" />}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-slate-500">Actual cost</p><p className="font-medium">${((closeout.project.actualCostCents ?? 0) / 100).toLocaleString()}</p></div>
              <div><p className="text-xs text-slate-500">Case state</p><p className="font-medium">{closeout.renovationCase?.lifecycle?.replace(/_/g, ' ') ?? 'No linked case'}</p></div>
              <div><p className="text-xs text-slate-500">Evidence</p><p className="font-medium">{closeout.evidence.documentIds.length} documents · {closeout.evidence.materialSpecIds.length} materials</p></div>
              <div><p className="text-xs text-slate-500">Open items</p><p className="font-medium">{closeout.unresolvedItems.length}</p></div>
            </div>
          </MobileCard>

          {closeout.unresolvedItems.length > 0 && (
            <MobileCard className="border-amber-200 bg-amber-50">
              <h2 className="text-sm font-semibold text-amber-900">Open items remain visible</h2>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-amber-900">{JSON.stringify(closeout.unresolvedItems, null, 2)}</pre>
            </MobileCard>
          )}

          <MobileCard className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Reconciliation ledger</h2>
            <div className="divide-y divide-slate-100">
              {writeBacks.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{row.targetSystem.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-slate-500">{row.action.toLowerCase()}</span>
                </div>
              ))}
            </div>
          </MobileCard>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={downloadPackage}>
              <Download className="mr-2 h-4 w-4" /> Export JSON
            </Button>
            <Button onClick={createShare} disabled={sharing}>
              <Share2 className="mr-2 h-4 w-4" /> {sharing ? 'Creating…' : 'Create 30-day share link'}
            </Button>
          </div>
          {shareUrl && (
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(shareUrl)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left text-xs text-emerald-900"
            >
              <span className="truncate">{shareUrl}</span><Copy className="h-4 w-4 shrink-0" />
            </button>
          )}
        </>
      )}
    </MobilePageContainer>
  );
}
