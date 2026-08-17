'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ChevronRight, ClipboardList, Plus, Upload } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { InspectionHubSummary, InspectionReportSummary } from '@/types';
import { Button } from '@/components/ui/button';
import {
  EmptyStateCard,
  MobileActionRow,
  MobileCard,
  MobileFilterSurface,
  MobilePageContainer,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import DetailTemplate from '../components/route-templates/DetailTemplate';
import { track } from '@/lib/analytics/events';
import { inspectionHubLaunchQuery } from '@/features/tools/inspectionHubLaunchContext';
import { buyerPlanReturnHref } from '@/lib/navigation/buyerReturnContext';

const REPORT_TYPE_LABELS: Record<string, string> = {
  GENERAL: 'General Home',
  ROOF: 'Roof',
  HVAC: 'HVAC',
  SEWER: 'Sewer Scope',
  ELECTRICAL: 'Electrical',
  FOUNDATION: 'Foundation',
  PRE_PURCHASE: 'Pre-Purchase',
  PRE_LISTING: 'Pre-Listing',
  ANNUAL: 'Annual / Maintenance',
  OTHER: 'Other',
};

function statusChipTone(status: InspectionReportSummary['status']) {
  switch (status) {
    case 'CONFIRMED': return 'good' as const;
    case 'REVIEW_PENDING': return 'elevated' as const;
    case 'PROCESSING': return 'info' as const;
    case 'ARCHIVED': return 'info' as const;
    default: return 'info' as const;
  }
}

function statusLabel(status: InspectionReportSummary['status']) {
  switch (status) {
    case 'CONFIRMED': return 'Confirmed';
    case 'REVIEW_PENDING': return 'Ready to Review';
    case 'PROCESSING': return 'Processing…';
    case 'ARCHIVED': return 'Archived';
    default: return status;
  }
}

function fmtDate(dt?: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InspectionHubPage() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const launchQuery = inspectionHubLaunchQuery(searchParams);
  const launchSuffix = launchQuery ? `?${launchQuery}` : '';
  const buyerReturnHref = buyerPlanReturnHref(propertyId, searchParams);

  const [hub, setHub] = useState<InspectionHubSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getInspectionHub(propertyId);
      setHub(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load inspection hub');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!propertyId) return;
    track('workflow_started', { tool: 'inspection-hub', propertyId, entryPoint: 'direct' });
  }, [propertyId]);

  // Poll while any report is PROCESSING
  useEffect(() => {
    const hasProcessing = hub?.reports.some((r) => r.status === 'PROCESSING');
    if (!hasProcessing) return;
    const id = window.setInterval(load, 5000);
    return () => window.clearInterval(id);
  }, [hub, load]);

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-4xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={buyerReturnHref ?? `/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {buyerReturnHref ? 'Back to Closing Plan' : 'Back to property'}
        </Link>
      </Button>

      <DetailTemplate
        title="Inspection Hub"
        subtitle="Upload inspection reports and track every finding across the life of your home."
        trust={{
          confidenceLabel: 'High — AI-extracted from professional inspection reports',
          freshnessLabel: 'Updated each time a report is confirmed',
          sourceLabel: 'Inspection PDFs uploaded by homeowner + AI extraction engine',
        }}
      >
        {/* Summary stats */}
        {hub && (hub.openCount > 0 || hub.safetyCount > 0) && (
          <MobileCard variant="compact" className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold text-slate-900">{hub.openCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">Open items</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${hub.safetyCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {hub.safetyCount}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Safety</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{hub.majorCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">Major</p>
            </div>
          </MobileCard>
        )}

        {hub?.safetyCount ? (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {hub.safetyCount} safety finding{hub.safetyCount > 1 ? 's' : ''} require attention
          </div>
        ) : null}

        <MobileFilterSurface>
          <MobileActionRow>
            <Button className="min-h-[44px] gap-1.5" asChild>
              <Link href={`/dashboard/properties/${propertyId}/inspection-hub/upload${launchSuffix}`}>
                <Upload className="h-4 w-4" />
                Upload Report
              </Link>
            </Button>
            {(hub?.openCount ?? 0) > 0 && (
              <Button variant="outline" className="min-h-[44px] gap-1.5" asChild>
                <Link href={`/dashboard/properties/${propertyId}/inspection-hub/open-items${launchSuffix}`}>
                  <ClipboardList className="h-4 w-4" />
                  Open Items ({hub?.openCount})
                </Link>
              </Button>
            )}
          </MobileActionRow>
          <div className="flex flex-wrap gap-2">
            <StatusChip tone="info">{hub?.reports.length ?? 0} reports</StatusChip>
          </div>
        </MobileFilterSurface>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
        )}

        {loading && !hub ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-200 border-t-slate-600" />
          </div>
        ) : hub?.reports.length === 0 ? (
          <EmptyStateCard
            title="No inspection reports yet"
            description="Upload your first inspection PDF to start tracking findings and keeping your home records up to date."
          />
        ) : (
          <div className="grid gap-3">
            {hub?.reports.map((report) => (
              <Link
                key={report.id}
                href={`/dashboard/properties/${propertyId}/inspection-hub/${report.id}${launchSuffix}`}
                className="block"
              >
                <MobileCard variant="compact" className="flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {REPORT_TYPE_LABELS[report.reportType] ?? report.reportType}
                      </p>
                      <StatusChip tone={statusChipTone(report.status)}>
                        {statusLabel(report.status)}
                      </StatusChip>
                    </div>
                    <p className="text-xs text-slate-500">
                      {fmtDate(report.inspectionDate)}
                      {report.inspectorName ? ` · ${report.inspectorName}` : ''}
                    </p>
                    {report.status !== 'PROCESSING' && (
                      <div className="flex flex-wrap gap-2">
                        {report.safetyFindings > 0 && (
                          <StatusChip tone="danger">{report.safetyFindings} Safety</StatusChip>
                        )}
                        {report.majorFindings > 0 && (
                          <StatusChip tone="elevated">{report.majorFindings} Major</StatusChip>
                        )}
                        <StatusChip tone="info">{report.openFindings} open / {report.totalFindings} total</StatusChip>
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
                </MobileCard>
              </Link>
            ))}
          </div>
        )}
      </DetailTemplate>
    </MobilePageContainer>
  );
}
