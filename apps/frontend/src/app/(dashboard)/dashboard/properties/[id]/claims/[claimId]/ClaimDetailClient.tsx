'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  ClaimDTO,
  getClaim,
  getClaimInsights,
  regenerateChecklist,
  updateClaim,
} from '../claimsApi';

import ClaimStatusBadge from '@/app/(dashboard)/dashboard/components/claims/ClaimStatusBadge';
import ClaimChecklist from '@/app/(dashboard)/dashboard/components/claims/ClaimChecklist';
import ClaimTimeline from '@/app/(dashboard)/dashboard/components/claims/ClaimTimeline';
import ClaimQuickActions from '@/app/(dashboard)/dashboard/components/claims/ClaimQuickActions';
import ClaimProgressBar from '@/app/(dashboard)/dashboard/components/claims/ClaimProgressBar';
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

export default function ClaimDetailClient() {
  const params = useParams<{ id: string; claimId: string }>();
  const propertyId = params.id;
  const claimId = params.claimId;

  const [claim, setClaim] = useState<ClaimDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [insights, setInsights] = useState<any | null>(null);
  const [blocking, setBlocking] = useState<any[] | null>(null);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, claimId]);

  const completion = useMemo(() => claim?.checklistCompletionPct ?? 0, [claim]);

  async function onUpdate(patch: any) {
    setBusy('update');
    try {
      const updated = await updateClaim(propertyId, claimId, patch);
      setClaim((prev: ClaimDTO | null) => ({ ...(prev as ClaimDTO), ...updated }));
      await refresh();
    } catch (e: any) {
      if (e?.status === 409 && e?.payload?.code === 'CLAIM_SUBMIT_BLOCKED') {
        setBlocking(e.payload.blocking);
        return;
      }
      throw e;
    } finally {
      setBusy(null);
    }
  }

  async function onRegenerateChecklist() {
    setBusy('regen');
    try {
      const updated = await regenerateChecklist(propertyId, claimId, {
        replaceExisting: true,
      });
      setClaim(updated);
      setBlocking(null);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const [claimData, insightsData] = await Promise.all([
        getClaim(propertyId, claimId),
        getClaimInsights(propertyId, claimId),
      ]);
      setClaim(claimData);
      setInsights(insightsData);
      setBlocking(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading && !claim) {
    return (
      <MobilePageContainer className="py-6 lg:max-w-7xl lg:px-8 lg:pb-10">
        <MobileCard variant="compact" className="text-sm text-slate-600">
          Loading claim...
        </MobileCard>
      </MobilePageContainer>
    );
  }

  if (!claim) {
    return (
      <MobilePageContainer className="py-6 lg:max-w-7xl lg:px-8 lg:pb-10">
        <EmptyStateCard
          title="Claim not found"
          description="This claim may have been removed or is unavailable."
          action={
            <Button asChild>
              <Link href={`/dashboard/properties/${propertyId}/claims`}>Back to claims</Link>
            </Button>
          }
        />
      </MobilePageContainer>
    );
  }

  const slaMsg = insights?.sla?.message;
  const slaIsBreach = Boolean(insights?.sla?.isBreach);

  const followUpRisk = insights?.followUp?.risk;
  const health = insights?.health;
  const financial = insights?.financial;

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/claims`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to claims
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow="Claim"
        title={claim.title}
        subtitle={[claim.type, claim.providerName, claim.claimNumber ? `#${claim.claimNumber}` : null].filter(Boolean).join(' • ')}
      />

      <MobileFilterSurface>
        <div className="flex flex-wrap items-center gap-2">
          <ClaimStatusBadge status={claim.status} />
          <StatusChip tone="info">Checklist {completion}%</StatusChip>
        </div>
        <MobileActionRow>
          <Button variant="outline" className="min-h-[44px]" onClick={refresh} disabled={busy !== null}>
            Refresh
          </Button>
          <Button className="min-h-[44px]" onClick={onRegenerateChecklist} disabled={busy !== null}>
            {busy === 'regen' ? 'Regenerating...' : 'Regenerate checklist'}
          </Button>
        </MobileActionRow>
      </MobileFilterSurface>

      <ClaimQuickActions
        claim={claim}
        busy={busy !== null}
        onPatch={onUpdate}
        onSubmitBlocked={(b) => setBlocking(b)}
      />

      <MobileCard variant="compact">
        <ClaimProgressBar
          percent={claim.checklistCompletionPct ?? 0}
          label="Checklist"
          helperText={
            insights?.followUp?.isOverdue
              ? 'Follow-up is overdue'
              : insights?.followUp?.nextFollowUpAt
              ? `Next follow-up: ${new Date(insights.followUp.nextFollowUpAt).toLocaleDateString()}`
              : undefined
          }
          muted={Boolean(insights?.followUp?.isOverdue)}
        />
      </MobileCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <MobileCard>
            <p className="text-sm font-semibold text-gray-900">Checklist</p>
            <p className="mt-1 text-sm text-gray-600">Mark items done. Completion updates automatically.</p>
            <div className="mt-3">
              <ClaimChecklist
                propertyId={propertyId}
                claim={claim}
                onChanged={async () => {
                  setBlocking(null);
                  await refresh();
                }}
                busy={busy !== null}
                blocking={blocking ?? undefined}
              />
            </div>
          </MobileCard>

          <MobileCard>
            <p className="text-sm font-semibold text-gray-900">Timeline</p>
            <p className="mt-1 text-sm text-gray-600">Keep notes and milestones in one place.</p>
            <div className="mt-3">
              <ClaimTimeline propertyId={propertyId} claim={claim} onChanged={refresh} />
            </div>
          </MobileCard>
        </div>

        {insights ? (
          <MobileCard className="lg:sticky lg:top-4 h-fit">
            <p className="text-sm font-semibold text-gray-900">Insights</p>

            {slaMsg ? (
              <div
                className={[
                  'mt-2 rounded-lg border p-2 text-xs',
                  slaIsBreach
                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800',
                ].join(' ')}
              >
                {slaMsg}
              </div>
            ) : null}

            <div className="mt-2 grid gap-2 text-sm text-gray-700">
              <div>
                <span className="text-gray-500">Aging:</span> {insights.agingDays} days
              </div>
              <div>
                <span className="text-gray-500">Last activity:</span>{' '}
                {insights.daysSinceLastActivity === null ? '—' : `${insights.daysSinceLastActivity} days ago`}
              </div>
              {insights.daysSinceSubmitted !== null ? (
                <div>
                  <span className="text-gray-500">Since submitted:</span> {insights.daysSinceSubmitted} days
                </div>
              ) : null}

              {followUpRisk ? (
                <div className="mt-2 rounded-lg border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700">Follow-up risk</p>
                    <span className="rounded-full border px-2 py-0.5 text-xs">
                      {followUpRisk.level} • {followUpRisk.score}/100
                    </span>
                  </div>
                  {(followUpRisk.reasons ?? []).length ? (
                    <ul className="mt-2 list-disc pl-5 text-xs text-gray-600">
                      {(followUpRisk.reasons ?? []).slice(0, 2).map((r: string, i: number) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {health ? (
                <div className="mt-2 rounded-lg border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700">Claim health</p>
                    <span className="rounded-full border px-2 py-0.5 text-xs">
                      {health.level} • {health.score}/100
                    </span>
                  </div>

                  <div className="mt-2 h-2 w-full rounded bg-black/10">
                    <div className="h-2 rounded bg-black/40" style={{ width: `${health.score}%` }} />
                  </div>

                  {(health.reasons ?? []).length ? (
                    <ul className="mt-2 list-disc pl-5 text-xs text-gray-600">
                      {(health.reasons ?? []).slice(0, 3).map((r: string, i: number) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {financial ? (
                <div className="mt-2 rounded-lg border bg-white p-3">
                  <p className="text-xs font-semibold text-gray-700">Settlement vs estimate</p>

                  <div className="mt-2 grid gap-1 text-xs text-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Estimate</span>
                      <span className="font-medium">
                        {financial.estimatedLossAmount !== null
                          ? `$${Number(financial.estimatedLossAmount).toLocaleString()}`
                          : '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Settlement</span>
                      <span className="font-medium">
                        {financial.settlementAmount !== null
                          ? `$${Number(financial.settlementAmount).toLocaleString()}`
                          : '—'}
                      </span>
                    </div>

                    {financial.settlementRatio !== null ? (
                      <>
                        <p className="mt-1 text-xs text-gray-600">{financial.visual?.label}</p>
                        <p className="text-xs text-gray-600">
                          Difference:{' '}
                          <span className="font-medium">
                            {Number(financial.settlementVsEstimate) >= 0 ? '+' : ''}
                            ${Number(financial.settlementVsEstimate).toLocaleString()}
                          </span>
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-gray-500">Add estimate and settlement amounts to compare.</p>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="mt-2">
                <p className="text-xs font-semibold text-gray-700">Recommendation</p>
                <div className="mt-1">
                  <span className="rounded-full border px-2 py-0.5 text-xs">{insights.recommendation.decision}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {(insights.recommendation.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
                <ul className="mt-2 list-disc pl-5 text-xs text-gray-600">
                  {(insights.recommendation.reasons ?? []).slice(0, 3).map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              {insights.coverage?.coverageGap ? (
                <div className="mt-2 rounded-lg border bg-amber-50 p-2 text-xs text-amber-800">
                  Coverage info may be incomplete (possible coverage gap).
                </div>
              ) : null}
            </div>
          </MobileCard>
        ) : null}
      </div>
    </MobilePageContainer>
  );
}
