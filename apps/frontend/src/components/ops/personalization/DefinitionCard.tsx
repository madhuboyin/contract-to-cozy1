// apps/frontend/src/components/ops/personalization/DefinitionCard.tsx

'use client';

import { Button } from '@/components/ui/button';
import type { PersonalizationCatalogDefinition, RecommendationReviewRole } from '@/lib/api/personalizationAdminApi';
import { DEFINITION_STATUS_CHIP, humanize, isSafetyFlavored } from './personalizationUtils';

export function DefinitionCard({
  definition,
  onActivate,
  activatePending,
  onSetPause,
  pausePending,
  onReviewGovernance,
  reviewPending,
  onReportIncident,
  incidentPending,
}: {
  definition: PersonalizationCatalogDefinition;
  onActivate: (code: string, ruleVersion: number, contentVersion: number) => void;
  activatePending: boolean;
  onSetPause: (code: string, paused: boolean) => void;
  pausePending: boolean;
  onReviewGovernance: (code: string, role: RecommendationReviewRole, decision: 'APPROVED' | 'REJECTED') => void;
  reviewPending: boolean;
  onReportIncident: (code: string) => void;
  incidentPending: boolean;
}) {
  const rule = definition.rules[0];
  const content = definition.contentVersions.find((item) => item.locale === 'en-US');
  const hasBundle = Boolean(rule && content);
  const bundleActive = Boolean(rule?.status === 'ACTIVE' && content?.status === 'ACTIVE');
  const ready = Boolean(hasBundle && !bundleActive);
  const canPause = definition.status === 'ACTIVE' || Boolean(definition.pausedAt);
  const safetyFlavored = isSafetyFlavored(definition.safetyClass);

  const borderColor = definition.pausedAt
    ? 'border-l-amber-500'
    : !hasBundle
      ? 'border-l-rose-500'
      : 'border-l-emerald-500';

  return (
    <div className={`rounded-2xl border border-slate-200/80 border-l-[3px] ${borderColor} bg-white p-3.5 shadow-sm`}>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${DEFINITION_STATUS_CHIP[definition.status] ?? 'bg-slate-100 text-slate-600'}`}>
          {definition.status}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${safetyFlavored ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
          {definition.safetyClass}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-400">
          {humanize(definition.safetyTier)}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-400">
          {definition.governancePolicyVersion}
        </span>
        {!hasBundle ? <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">INCOMPLETE</span> : null}
        {hasBundle && !bundleActive ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">READY FOR REVIEW</span> : null}
        {bundleActive ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">ACTIVE BUNDLE</span> : null}
        {definition.pausedAt ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">PAUSED</span> : null}
      </div>

      <h3 className="text-[14px] font-semibold leading-snug text-slate-900">{content?.title || definition.code}</h3>
      <p className="mb-2 font-mono text-[10.5px] text-slate-400">{definition.code}</p>
      <p className="mb-3 text-[11px] text-slate-500">
        Rule <b className="text-slate-700">v{rule?.version ?? '—'}</b> · {rule?.status ?? 'missing'} &nbsp;·&nbsp; Content{' '}
        <b className="text-slate-700">v{content?.version ?? '—'}</b> · {content?.status ?? 'missing'}
      </p>

      {definition.launchReadiness ? (
        <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-600">Trust review</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase ${
                definition.launchReadiness.ready
                  ? 'bg-emerald-50 text-emerald-700'
                  : definition.launchReadiness.humanPolicyApprovalEnforced
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-purple-50 text-purple-700'
              }`}
            >
              {definition.launchReadiness.ready
                ? 'Policy approved'
                : definition.launchReadiness.humanPolicyApprovalEnforced
                  ? 'Review required'
                  : 'Beta advisory'}
            </span>
          </div>

          {definition.launchReadiness.requiredRoles.length > 0 ? (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {definition.launchReadiness.requiredRoles.map((role) => {
                const approved = definition.launchReadiness!.approvedRoles.includes(role);
                const rejected = definition.governanceReviews.some(
                  (review) => review.role === role && review.decision === 'REJECTED' && review.policyVersion === definition.governancePolicyVersion,
                );
                return (
                  <span
                    key={role}
                    className={`inline-flex items-center gap-1 rounded-md py-0.5 pl-2 pr-1 text-[10px] font-bold ${
                      approved ? 'bg-emerald-50 text-emerald-700' : rejected ? 'bg-rose-50 text-rose-700' : 'border border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    {humanize(role)}
                    {approved ? ' ✓' : null}
                    {!approved ? (
                      <button
                        type="button"
                        disabled={reviewPending}
                        onClick={() => onReviewGovernance(definition.code, role, 'APPROVED')}
                        className="rounded px-1 text-[9.5px] font-bold hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        Approve
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={reviewPending}
                        onClick={() => {
                          const notes = window.prompt('Reason for rejecting this approval?');
                          if (notes?.trim()) onReviewGovernance(definition.code, role, 'REJECTED');
                        }}
                        className="rounded px-1 text-[9.5px] font-bold hover:bg-rose-50 hover:text-rose-700"
                      >
                        Reject
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          ) : null}

          {!definition.launchReadiness.ready ? (
            <p className="text-[10.5px] leading-relaxed text-slate-400">
              {definition.launchReadiness.humanPolicyApprovalEnforced
                ? 'Activation remains blocked until every tier-required role approves the current governance policy.'
                : 'Human approvals are advisory in beta. Technical safety, evidence, disclosure, and escalation validation remains enforced.'}
            </p>
          ) : null}
        </div>
      ) : null}

      {!hasBundle ? (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
          This implemented definition is missing its rule or en-US content. Run the canonical catalog bootstrap before review.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {hasBundle && !bundleActive ? (
          <Button
            type="button"
            size="sm"
            className="h-7 rounded px-2.5 text-[11px] font-semibold"
            disabled={!ready || !definition.launchReadiness?.activationAllowed || activatePending}
            onClick={() => {
              const warning = safetyFlavored
                ? `Activate safety-sensitive rule and content for ${definition.code}? Confirm that you reviewed both versions.`
                : `Activate reviewed rule and content for ${definition.code}?`;
              if (window.confirm(warning)) {
                onActivate(definition.code, rule!.version, content!.version);
              }
            }}
          >
            Review and activate
          </Button>
        ) : null}
        {bundleActive && !definition.pausedAt ? (
          <Button type="button" size="sm" disabled className="h-7 rounded bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-700">
            Active
          </Button>
        ) : null}
        {canPause ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded px-2.5 text-[11px] font-semibold text-amber-700"
            disabled={pausePending}
            onClick={() => onSetPause(definition.code, Boolean(definition.pausedAt))}
          >
            {definition.pausedAt ? 'Resume' : 'Pause'}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 rounded px-2.5 text-[11px] font-semibold text-rose-700"
          disabled={incidentPending}
          onClick={() => onReportIncident(definition.code)}
        >
          Report incident
        </Button>
      </div>
    </div>
  );
}
