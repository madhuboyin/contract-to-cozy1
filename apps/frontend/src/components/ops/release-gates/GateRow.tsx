// apps/frontend/src/components/ops/release-gates/GateRow.tsx

'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CapabilityGovernanceReviewRole, CapabilityLaunchReview } from '@/lib/api/adminPlatformOps';
import { COHORT_BADGE, fmtDate, ROLE_DOT_CLASS, ROLE_LABELS, roleStatus, STATE_BADGE } from './releaseGatesUtils';

export function GateRow({
  review,
  onRecordReview,
  reviewPending,
}: {
  review: CapabilityLaunchReview;
  onRecordReview: (capabilityId: string, role: CapabilityGovernanceReviewRole, decision: 'APPROVED' | 'REJECTED') => void;
  reviewPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/70"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <td className="w-5 px-3 py-2.5">
          <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </td>
        <td className="px-3 py-2.5">
          <p className="font-semibold text-slate-800">{review.label}</p>
          <p className="text-[10px] text-slate-400">{review.capabilityId} · {review.owner}</p>
        </td>
        <td className="px-3 py-2.5">
          <Badge className={`text-[10px] ${STATE_BADGE[review.state] ?? ''}`}>{review.state}</Badge>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex gap-1">
            {review.governanceReview.requiredRoles.map((role) => {
              const status = roleStatus(role, review.governanceReview.approvedRoles, review.governanceReview.rejectedRoles);
              return (
                <span
                  key={role}
                  title={`${ROLE_LABELS[role]}: ${status}`}
                  className={`grid h-5 w-5 place-items-center rounded text-[9px] font-extrabold ${ROLE_DOT_CLASS[status]}`}
                >
                  {role.charAt(0)}
                </span>
              );
            })}
          </div>
        </td>
        <td className="px-3 py-2.5">
          <Badge className={`text-[10px] ${COHORT_BADGE[review.rollout?.cohort ?? 'DISABLED'] ?? ''}`}>
            {review.rollout?.cohort ?? 'MISSING'}
          </Badge>
          <span className="ml-1.5 text-[10px] text-slate-400">{review.rollout?.rolloutPct ?? 0}%</span>
        </td>
        <td className={`px-3 py-2.5 font-semibold ${(review.incidentGate?.activeIncidentCount ?? 0) > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
          {review.incidentGate?.activeIncidentCount ?? 0}
        </td>
        <td className="px-3 py-2.5">
          {review.blockers.length === 0 ? (
            <span className="text-slate-300">—</span>
          ) : (
            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{review.blockers.length}</span>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-slate-50 bg-slate-50/60">
          <td colSpan={7} className="p-0">
            <div className="grid gap-x-6 gap-y-1 border-t border-dashed border-slate-200 px-4 py-3.5 pl-10 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Policy</p>
                <p className="text-[12px] text-slate-600">
                  <span className="font-semibold text-slate-800">{review.releaseStage}</span> · {review.recommendationMode}
                </p>
                <p className="text-[12px] text-slate-600">{review.safetyTier}</p>
                <p className="text-[12px] text-slate-600">
                  {review.governanceDefinition.dataSensitivity} · {review.governanceDefinition.policyVersion}
                </p>
                {!review.governanceDefinition.valid && review.governanceDefinition.issues.length > 0 ? (
                  <p className="mt-1 text-[11px] font-semibold text-rose-700">
                    {review.governanceDefinition.issues.join(', ')}
                  </p>
                ) : null}

                <p className="mb-1.5 mt-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Blockers</p>
                {review.blockers.length === 0 ? (
                  <p className="text-[12px] text-slate-400">None</p>
                ) : (
                  <p className="text-[11.5px] font-semibold text-rose-700">{review.blockers.join(', ')}</p>
                )}

                <p className="mt-3 text-[11px] text-slate-400">
                  Checked {review.incidentGate ? fmtDate(review.incidentGate.checkedAt) : '—'}
                </p>
              </div>

              <div>
                <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Governance approvals</p>
                <div className="space-y-1.5">
                  {review.governanceReview.requiredRoles.map((role) => {
                    const status = roleStatus(role, review.governanceReview.approvedRoles, review.governanceReview.rejectedRoles);
                    return (
                      <div key={role} className="flex items-center gap-2 text-[11.5px]">
                        <span className="w-16 shrink-0 font-semibold text-slate-600">{ROLE_LABELS[role]}</span>
                        <span
                          className={`font-bold ${
                            status === 'approved' ? 'text-emerald-600' : status === 'rejected' ? 'text-rose-600' : 'text-amber-600'
                          }`}
                        >
                          {status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending'}
                        </span>
                        <span className="ml-auto flex gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 rounded px-2 text-[10.5px] font-semibold"
                            disabled={reviewPending || status === 'approved'}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRecordReview(review.capabilityId, role, 'APPROVED');
                            }}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 rounded px-2 text-[10.5px] font-semibold text-rose-700"
                            disabled={reviewPending || status === 'rejected'}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRecordReview(review.capabilityId, role, 'REJECTED');
                            }}
                          >
                            Reject
                          </Button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
