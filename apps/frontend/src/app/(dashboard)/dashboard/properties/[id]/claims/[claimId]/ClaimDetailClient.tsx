// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/claims/[claimId]/ClaimDetailClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { SectionHeader } from '../../../../components/SectionHeader';
import {
  ClaimDTO,
  getClaim,
  regenerateChecklist,
  updateClaim,
} from '../claimsApi';

import ClaimStatusBadge from '@/app/(dashboard)/dashboard/components/claims/ClaimStatusBadge';
import ClaimChecklist from '@/app/(dashboard)/dashboard/components/claims/ClaimChecklist';
import ClaimTimeline from '@/app/(dashboard)/dashboard/components/claims/ClaimTimeline';
import ClaimQuickActions from '@/app/(dashboard)/dashboard/components/claims/ClaimQuickActions';
import { getClaimInsights } from '../claimsApi';
import ClaimProgressBar from '@/app/(dashboard)/dashboard/components/claims/ClaimProgressBar';

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
      // ClaimQuickActions will also handle submit-blocking toast + pass blocking via onSubmitBlocked
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
      // Clear old submit-blocking state; it should be re-set on next blocked submit attempt
      setBlocking(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading && !claim) {
    return <div className="text-sm text-gray-600">Loading…</div>;
  }

  if (!claim) {
    return (
      <div className="rounded-xl border bg-white p-6 text-sm text-gray-700">
        Claim not found.
        <div className="mt-3">
          <Link
            className="text-emerald-700 hover:underline"
            href={`/dashboard/properties/${propertyId}/claims`}
          >
            Back to Claims
          </Link>
        </div>
      </div>
    );
  }

  const slaMsg = insights?.sla?.message;
  const slaIsBreach = Boolean(insights?.sla?.isBreach);

  const followUpRisk = insights?.followUp?.risk;
  const health = insights?.health;
  const financial = insights?.financial;

  return (
    <div className="space-y-4">
      <SectionHeader
        icon="📋"
        title={claim.title}
        description={
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1 sm:gap-2 text-sm text-gray-600">
            <ClaimStatusBadge status={claim.status} />
            <span className="hidden sm:inline text-gray-300">•</span>
            <span className="font-medium">{claim.type}</span>
            {claim.providerName ? (
              <>
                <span className="hidden sm:inline text-gray-300">•</span>
                <span>{claim.providerName}</span>
              </>
            ) : null}
            {claim.claimNumber ? (
              <>
                <span className="hidden sm:inline text-gray-300">•</span>
                <span>#{claim.claimNumber}</span>
              </>
            ) : null}
            <span className="hidden sm:inline text-gray-300">•</span>
            <span>Checklist {completion}%</span>
          </div>
        }
        action={
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <Link
              href={`/dashboard/properties/${propertyId}/claims`}
              className="rounded-lg border px-3 py-2.5 sm:py-2 min-h-[44px] text-sm hover:bg-gray-50 text-center"
            >
              Back
            </Link>
            <button
              className="rounded-lg border px-3 py-2.5 sm:py-2 min-h-[44px] text-sm hover:bg-gray-50"
              onClick={refresh}
              disabled={busy !== null}
            >
              Refresh
            </button>
            <button
              className="rounded-lg bg-emerald-700 px-3 py-2.5 sm:py-2 min-h-[44px] text-sm text-white hover:bg-emerald-800"
              onClick={onRegenerateChecklist}
              disabled={busy !== null}
              title="Regenerate checklist from template"
            >
              {busy === 'regen' ? 'Regenerating…' : 'Regenerate checklist'}
            </button>
          </div>
        }
      />

      <ClaimQuickActions
        claim={claim}
        busy={busy !== null}
        onPatch={onUpdate}
        onSubmitBlocked={(b) => setBlocking(b)}
      />

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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">Checklist</div>
            <div className="mt-1 text-sm text-gray-600">
              Mark items done. Your completion updates automatically.
            </div>
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
          </div>
          <div className="rounded-xl border bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">Timeline</div>
            <div className="mt-1 text-sm text-gray-600">
              Keep notes and milestones in one place.
            </div>
            <div className="mt-3">
              <ClaimTimeline propertyId={propertyId} claim={claim} onChanged={refresh} />
            </div>
          </div>
        </div>

        {insights ? (
          <div className="lg:sticky lg:top-4 h-fit rounded-xl border bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">Insights</div>

            {/* SLA banner */}
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

              {/* Follow-up risk */}
              {followUpRisk ? (
                <div className="mt-2 rounded-lg border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-gray-700">Follow-up risk</div>
                    <span className="rounded-full border px-2 py-1 sm:py-0.5 text-xs min-h-[44px] sm:min-h-0 inline-flex items-center">
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

              {/* Claim health */}
              {health ? (
                <div className="mt-2 rounded-lg border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-gray-700">Claim health</div>
                    <span className="rounded-full border px-2 py-1 sm:py-0.5 text-xs min-h-[44px] sm:min-h-0 inline-flex items-center">
                      {health.level} • {health.score}/100
                    </span>
                  </div>

                  <div className="mt-2 h-2 w-full rounded bg-black/10">
                    <div
                      className="h-2 rounded bg-black/40"
                      style={{ width: `${health.score}%` }}
                    />
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

              {/* Settlement vs estimate */}
              {financial ? (
                <div className="mt-2 rounded-lg border bg-white p-3">
                  <div className="text-xs font-semibold text-gray-700">Settlement vs estimate</div>

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
                        <div className="mt-1 text-xs text-gray-600">{financial.visual?.label}</div>
                        <div className="text-xs text-gray-600">
                          Difference:{' '}
                          <span className="font-medium">
                            {Number(financial.settlementVsEstimate) >= 0 ? '+' : ''}
                            ${Number(financial.settlementVsEstimate).toLocaleString()}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="mt-1 text-xs text-gray-500">
                        Add estimate & settlement amounts to see comparison.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Existing recommendation */}
              <div className="mt-2">
                <div className="text-xs font-semibold text-gray-700">Recommendation</div>
                <div className="mt-1">
                  <span className="rounded-full border px-2 py-1 sm:py-0.5 text-xs min-h-[44px] sm:min-h-0 inline-flex items-center">
                    {insights.recommendation.decision}
                  </span>
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
