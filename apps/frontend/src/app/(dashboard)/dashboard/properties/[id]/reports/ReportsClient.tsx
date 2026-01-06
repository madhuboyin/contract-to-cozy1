'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

import { SectionHeader } from '../../../components/SectionHeader';
import {
  HomeReportExportDTO,
  createHomeReportExport,
  listHomeReportExports,
  getDownloadUrl,
  createShareLink,
  revokeShareLink,
} from './reportsApi';

function fmt(dt?: string | null) {
  if (!dt) return '—';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
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
    default:
      return `${base} bg-gray-100 text-gray-700`;
  }
}

function typeLabel(t: HomeReportExportDTO['type']) {
  switch (t) {
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
      return t;
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
    () => exports.some((e) => e.status === 'PENDING' || e.status === 'GENERATING'),
    [exports]
  );

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listHomeReportExports(propertyId);
      setExports(res.exports);
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
      window.location.href = url;
    } catch (e: any) {
      setError(e?.message || 'Failed to download');
    }
  }

  async function onShare(exportId: string) {
    setError(null);
    try {
      const res = await createShareLink(exportId, 14);
      await refresh();

      const shareUrl = `${window.location.origin}/reports/share/${res.shareToken}`;
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

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  // Poll while there are active exports
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
    <div className="space-y-6">
      <SectionHeader
        icon="📄"
        title="Home Reports"
        description="Generate printable PDFs for insurance, claims, resale, estate planning, and lender/HOA requests."
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={creating}
          onClick={onCreate}
        >
          {creating ? 'Generating…' : 'Generate Home Report Pack'}
        </button>

        <button
          className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
          disabled={loading}
          onClick={refresh}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>

        {hasActive ? (
          <span className="text-sm text-amber-700">A report is generating… this page will auto-refresh.</span>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="rounded-xl border bg-white">
        <div className="border-b px-4 py-3 text-sm font-semibold">Report History</div>

        <div className="divide-y">
          {exports.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">No reports yet. Generate your first report pack.</div>
          ) : (
            exports.map((exp) => {
              const shareActive =
                !!exp.shareToken && !exp.shareRevokedAt && (!exp.shareExpiresAt || new Date(exp.shareExpiresAt) > new Date());

              const shareUrl = exp.shareToken ? `/reports/share/${exp.shareToken}` : null;

              return (
                <div key={exp.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold">{typeLabel(exp.type)}</div>
                        <span className={statusBadge(exp.status)}>{exp.status}</span>
                      </div>
                      <div className="text-xs text-gray-600">
                        Requested: {fmt(exp.requestedAt)} • Started: {fmt(exp.startedAt)} • Completed: {fmt(exp.completedAt)}
                      </div>

                      {exp.status === 'FAILED' && exp.errorMessage ? (
                        <div className="text-xs text-rose-700">Error: {exp.errorMessage}</div>
                      ) : null}

                      {exp.status === 'READY' ? (
                        <div className="text-xs text-gray-600">
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
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
                        disabled={exp.status !== 'READY'}
                        onClick={() => onDownload(exp.id)}
                      >
                        Download
                      </button>

                      <button
                        className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
                        disabled={exp.status !== 'READY'}
                        onClick={() => onShare(exp.id)}
                        title="Creates a share link and copies it to clipboard"
                      >
                        Share (Copy link)
                      </button>

                      <button
                        className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
                        disabled={!shareActive}
                        onClick={() => onRevoke(exp.id)}
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Notes: Downloads use short-lived presigned URLs. Share links can be revoked and may expire automatically.
      </div>
    </div>
  );
}
