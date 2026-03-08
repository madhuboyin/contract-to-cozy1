'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';

import {
  HomeReportExportDTO,
  createHomeReportExport,
  createShareLink,
  deleteHomeReportExport,
  getDownloadUrl,
  listHomeReportExports,
  regenerateHomeReportExport,
  revokeShareLink,
} from './reportsApi';
import { Button } from '@/components/ui/button';
import {
  EmptyStateCard,
  MobileActionRow,
  MobileCard,
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

function fmt(dt?: string | null) {
  if (!dt) return '—';
  const date = new Date(dt);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function statusBadge(status: HomeReportExportDTO['status']) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';
  switch (status) {
    case 'READY':
      return `${base} bg-emerald-50 text-emerald-700`;
    case 'FAILED':
      return `${base} bg-rose-50 text-rose-700`;
    case 'PENDING':
    case 'GENERATING':
      return `${base} bg-amber-50 text-amber-700`;
    case 'EXPIRED':
      return `${base} bg-gray-100 text-gray-700`;
    case 'DELETED':
      return `${base} bg-gray-50 text-gray-400`;
    default:
      return `${base} bg-gray-100 text-gray-700`;
  }
}

function typeLabel(type: HomeReportExportDTO['type']) {
  switch (type) {
    case 'HOME_REPORT_PACK':
      return 'Home Report Pack';
    case 'HOME_SUMMARY':
      return 'Home Summary';
    case 'INVENTORY':
      return 'Inventory Report';
    case 'MAINTENANCE_HISTORY':
      return 'Maintenance History';
    case 'COVERAGE_SNAPSHOT':
      return 'Coverage Snapshot';
    default:
      return type;
  }
}

export default function ReportsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const [exports, setExports] = useState<HomeReportExportDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  const hasActive = useMemo(
    () => exports.some((entry) => entry.status === 'PENDING' || entry.status === 'GENERATING'),
    [exports]
  );

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await listHomeReportExports(propertyId);
      setExports(response.exports);
    } catch (e: any) {
      setError(e?.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }

  async function onCreate() {
    setCreating(true);
    setError(null);
    try {
      await createHomeReportExport(propertyId, { type: 'HOME_REPORT_PACK' });
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Failed to create export');
    } finally {
      setCreating(false);
    }
  }

  async function onDownload(exportId: string) {
    setError(null);
    try {
      const { url } = await getDownloadUrl(exportId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      setError(e?.message || 'Failed to download');
    }
  }

  async function onShare(exportId: string) {
    setError(null);
    try {
      const response = await createShareLink(exportId, 14);
      await refresh();

      const shareUrl = `${window.location.origin}/reports/share/${response.shareToken}`;
      await navigator.clipboard.writeText(shareUrl);
    } catch (e: any) {
      setError(e?.message || 'Failed to create share link');
    }
  }

  async function onRevoke(exportId: string) {
    setError(null);
    try {
      await revokeShareLink(exportId);
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Failed to revoke share link');
    }
  }

  async function onRegenerate(exportId: string) {
    setError(null);
    try {
      await regenerateHomeReportExport(exportId);
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Failed to regenerate report');
    }
  }

  async function onDelete(exportId: string) {
    setError(null);
    const ok = window.confirm('Delete this report? This will remove the PDF and revoke any share links.');
    if (!ok) return;

    try {
      await deleteHomeReportExport(exportId);
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete report');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (!hasActive) return;

    pollRef.current = window.setInterval(() => {
      refresh();
    }, 3000);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActive, propertyId]);

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to property
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow="Reports"
        title="Home Reports"
        subtitle="Generate printable PDFs for insurance, claims, resale, estate planning, and lender/HOA requests."
      />

      <MobileFilterSurface>
        <MobileActionRow>
          <Button className="min-h-[44px] gap-1.5" disabled={creating} onClick={onCreate}>
            <Plus className="h-4 w-4" />
            {creating ? 'Generating...' : 'Generate report pack'}
          </Button>

          <Button variant="outline" className="min-h-[44px]" disabled={loading} onClick={refresh}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </MobileActionRow>

        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="info">{exports.length} reports</StatusChip>
          {hasActive ? <StatusChip tone="elevated">Generation in progress</StatusChip> : <StatusChip tone="good">Idle</StatusChip>}
        </div>
      </MobileFilterSurface>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}

      {exports.length === 0 ? (
        <EmptyStateCard title="No reports yet" description="Generate your first report pack to create downloadable and shareable PDFs." />
      ) : (
        <div className="grid gap-3">
          {exports.map((exp) => {
            const isDeleted = exp.status === 'DELETED';
            const canDownload = exp.status === 'READY' && !isDeleted;
            const canShare = exp.status === 'READY' && !isDeleted;
            const canRegenerate =
              !isDeleted && (exp.status === 'READY' || exp.status === 'FAILED' || exp.status === 'EXPIRED');
            const canDelete = !isDeleted;

            const shareActive =
              !!exp.shareToken &&
              !exp.shareRevokedAt &&
              (!exp.shareExpiresAt || new Date(exp.shareExpiresAt) > new Date());

            const shareUrl = exp.shareToken ? `/reports/share/${exp.shareToken}` : null;

            return (
              <MobileCard key={exp.id} variant="compact" className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{typeLabel(exp.type)}</p>
                  <span className={statusBadge(exp.status)}>{exp.status}</span>
                </div>

                <p className="text-xs text-gray-600">
                  Requested: {fmt(exp.requestedAt)} • Started: {fmt(exp.startedAt)} • Completed: {fmt(exp.completedAt)}
                </p>

                {exp.status === 'FAILED' && exp.errorMessage ? (
                  <p className="text-xs text-rose-700">Error: {exp.errorMessage}</p>
                ) : null}

                {exp.status === 'READY' ? (
                  <p className="text-xs text-gray-600">
                    {shareActive ? (
                      <>
                        Share link active (expires {fmt(exp.shareExpiresAt)}):{' '}
                        <a className="underline" href={shareUrl ?? '#'} target="_blank" rel="noreferrer">
                          {shareUrl}
                        </a>
                      </>
                    ) : exp.shareToken ? (
                      <>Share link exists but is expired/revoked.</>
                    ) : (
                      <>No share link.</>
                    )}
                  </p>
                ) : null}

                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <Button variant="outline" className="min-h-[40px]" disabled={!canDownload} onClick={() => onDownload(exp.id)}>
                    Download
                  </Button>

                  <Button
                    variant="outline"
                    className="min-h-[40px]"
                    disabled={!canShare}
                    onClick={() => onShare(exp.id)}
                    title="Creates a share link and copies it to clipboard"
                  >
                    Share
                  </Button>

                  <Button
                    variant="outline"
                    className="min-h-[40px]"
                    disabled={!shareActive || isDeleted}
                    onClick={() => onRevoke(exp.id)}
                  >
                    Revoke
                  </Button>

                  <Button
                    variant="outline"
                    className="min-h-[40px]"
                    disabled={!canRegenerate}
                    onClick={() => onRegenerate(exp.id)}
                    title="Creates a new export and re-runs generation"
                  >
                    Regenerate
                  </Button>

                  <Button
                    variant="destructive"
                    className="min-h-[40px]"
                    disabled={!canDelete}
                    onClick={() => onDelete(exp.id)}
                    title="Deletes the report and revokes share links"
                  >
                    Delete
                  </Button>
                </div>
              </MobileCard>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Notes: Downloads use short-lived presigned URLs. Share links can be revoked and may expire automatically.
      </p>
    </MobilePageContainer>
  );
}
