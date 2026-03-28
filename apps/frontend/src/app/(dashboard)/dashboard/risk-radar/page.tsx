'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Shield, ShieldAlert } from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { api } from '@/lib/api/client';
import humanizeActionType from '@/lib/utils/humanize';
import {
  EmptyStateCard,
  ExpandableSummaryCard,
  MetricRow,
  MobilePageContainer,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
  SummaryCard,
} from '@/components/mobile/dashboard/MobilePrimitives';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function riskTone(level: string): 'danger' | 'elevated' | 'info' {
  const normalized = level.toUpperCase();
  if (normalized === 'HIGH') return 'danger';
  if (normalized === 'ELEVATED' || normalized === 'MODERATE') return 'elevated';
  return 'info';
}

function displayLabel(value?: string | null): string {
  const label = humanizeActionType(value ?? '');
  return label === '—' ? 'Unknown' : label;
}

export default function RiskRadarPage() {
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = selectedPropertyId || searchParams.get('propertyId') || undefined;
  const guidanceJourneyId = searchParams.get('guidanceJourneyId') || undefined;
  const guidanceStepKey = searchParams.get('guidanceStepKey') || undefined;
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily') || undefined;
  const itemId = searchParams.get('itemId') || undefined;
  const homeAssetId = searchParams.get('homeAssetId') || undefined;

  const riskQuery = useQuery({
    queryKey: ['risk-radar-report', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const report = await api.getRiskReportSummary(propertyId);
      if (report === 'QUEUED') return 'QUEUED' as const;
      return report;
    },
    enabled: !!propertyId,
    staleTime: 3 * 60 * 1000,
  });

  if (!propertyId) {
    return (
      <MobilePageContainer className="space-y-7 py-3 lg:max-w-7xl lg:px-8 lg:pb-10">
        <EmptyStateCard
          title="Select a property"
          description="Risk Radar requires a selected property."
          action={
            <Link
              href="/dashboard/properties"
              className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 text-sm font-semibold text-white"
            >
              Open Properties
            </Link>
          }
        />
      </MobilePageContainer>
    );
  }

  const report = riskQuery.data;
  const guidanceParams = new URLSearchParams();
  if (guidanceJourneyId) guidanceParams.set('guidanceJourneyId', guidanceJourneyId);
  if (guidanceStepKey) guidanceParams.set('guidanceStepKey', guidanceStepKey);
  if (guidanceSignalIntentFamily) guidanceParams.set('guidanceSignalIntentFamily', guidanceSignalIntentFamily);
  if (itemId) guidanceParams.set('itemId', itemId);
  if (homeAssetId) guidanceParams.set('homeAssetId', homeAssetId);
  const guidanceSuffix = guidanceParams.toString();
  const actionCenterHref = `/dashboard/actions?propertyId=${encodeURIComponent(propertyId)}${
    guidanceSuffix ? `&${guidanceSuffix}` : ''
  }`;
  const riskAssessmentHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/risk-assessment${
    guidanceSuffix ? `?${guidanceSuffix}` : ''
  }`;

  return (
    <MobilePageContainer className="space-y-7 py-3 lg:max-w-7xl lg:px-8 lg:pb-10">
      <MobileSection>
        <Link href={`/dashboard?propertyId=${encodeURIComponent(propertyId)}`} className="no-brand-style inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
        <MobileSectionHeader title="Risk Radar" subtitle="High-impact exposure details" />
      </MobileSection>

      {riskQuery.isLoading ? (
        <SummaryCard title="Loading risk radar" subtitle="Calculating current exposure state">
          <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">Please wait...</p>
        </SummaryCard>
      ) : report === 'QUEUED' ? (
        <SummaryCard title="Risk report queued" subtitle="The latest report is being generated">
          <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">
            Check back shortly for refreshed risk detail.
          </p>
        </SummaryCard>
      ) : report ? (
        <>
          <MobileSection>
            <SummaryCard
              title="Risk Summary"
              subtitle="Current property exposure"
              action={<StatusChip tone={report.riskScore >= 80 ? 'good' : report.riskScore >= 60 ? 'elevated' : 'danger'}>{Math.round(report.riskScore)}/100</StatusChip>}
            >
              <MetricRow label="Risk score" value={`${Math.round(report.riskScore)}/100`} />
              <MetricRow label="Total exposure" value={formatCurrency(report.financialExposureTotal)} />
              <MetricRow label="Flagged assets" value={`${report.details.length}`} />
              <MetricRow
                label="Last calculated"
                value={new Date(report.lastCalculatedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              />
            </SummaryCard>
          </MobileSection>

          <MobileSection>
            <MobileSectionHeader title="Top Risk Drivers" subtitle="Progressive detail by system" />
            <div className="space-y-3">
              {[...report.details]
                .sort((a, b) => Number(b.riskDollar || 0) - Number(a.riskDollar || 0))
                .slice(0, 10)
                .map((detail) => (
                  <ExpandableSummaryCard
                    key={`${detail.assetName}-${detail.systemType}`}
                    title={displayLabel(detail.assetName)}
                    summary={`${displayLabel(detail.systemType)} • ${displayLabel(detail.category)}`}
                    metric={formatCurrency(detail.riskDollar)}
                  >
                    <div className="space-y-2">
                      <MetricRow
                        label="Risk level"
                        value={<StatusChip tone={riskTone(detail.riskLevel)}>{displayLabel(detail.riskLevel)}</StatusChip>}
                      />
                      <MetricRow label="Out-of-pocket" value={formatCurrency(detail.outOfPocketCost)} />
                      <MetricRow label="Replacement cost" value={formatCurrency(detail.replacementCost)} />
                      <MetricRow label="Probability" value={`${Math.round((detail.probability || 0) * 100)}%`} />
                      <MetricRow label="Coverage factor" value={`${Math.round((detail.coverageFactor || 0) * 100)}%`} />
                      {detail.actionCta ? (
                        <div className="pt-1 text-xs text-[hsl(var(--mobile-text-secondary))]">
                          <span className="inline-flex items-center gap-1">
                            <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                            {detail.actionCta}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </ExpandableSummaryCard>
                ))}
            </div>
          </MobileSection>

          <MobileSection>
            <SummaryCard title="Suggested Next Steps" subtitle="Action pathways from risk radar">
              <Link
                href={actionCenterHref}
                className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 text-sm font-semibold text-white"
              >
                Review Action Center
              </Link>
              <Link
                href={riskAssessmentHref}
                className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
              >
                Open Full Risk Assessment
              </Link>
            </SummaryCard>
          </MobileSection>
        </>
      ) : (
        <EmptyStateCard
          title="Risk radar unavailable"
          description="No risk report is available for this property yet."
          action={
            <Link
              href={`/dashboard/properties/${encodeURIComponent(propertyId)}/risk-assessment`}
              className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
            >
              Generate Risk Report
            </Link>
          }
        />
      )}

      <MobileSection>
        <div className="flex items-center justify-center gap-2 text-xs text-[hsl(var(--mobile-text-muted))]">
          <Shield className="h-3.5 w-3.5" />
          <AlertTriangle className="h-3.5 w-3.5" />
          Radar focuses on highest-dollar risks first
        </div>
      </MobileSection>
    </MobilePageContainer>
  );
}
