// apps/frontend/src/components/ops/release-gates/StateSection.tsx

'use client';

import { ChevronDown } from 'lucide-react';
import type { CapabilityGovernanceReviewRole, CapabilityLaunchReview, CapabilityLaunchReviewState } from '@/lib/api/adminPlatformOps';
import { STATE_DOT, STATE_LABELS } from './releaseGatesUtils';
import { GateRow } from './GateRow';

export function StateSection({
  state,
  reviews,
  collapsed,
  onToggleCollapsed,
  onRecordReview,
  reviewPending,
}: {
  state: CapabilityLaunchReviewState;
  reviews: CapabilityLaunchReview[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRecordReview: (capabilityId: string, role: CapabilityGovernanceReviewRole, decision: 'APPROVED' | 'REJECTED') => void;
  reviewPending: boolean;
}) {
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-slate-100/70"
      >
        <ChevronDown className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        <span className={`h-2 w-2 rounded-full ${STATE_DOT[state]}`} />
        <h2 className="text-[13px] font-semibold text-slate-700">{STATE_LABELS[state]}</h2>
        <span className="text-[11px] text-slate-400">{reviews.length}</span>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5" />
                <th className="px-3 py-2.5">Capability</th>
                <th className="px-3 py-2.5">State</th>
                <th className="px-3 py-2.5">Approvals</th>
                <th className="px-3 py-2.5">Cohort</th>
                <th className="px-3 py-2.5">Incidents</th>
                <th className="px-3 py-2.5">Blockers</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((review) => (
                <GateRow
                  key={review.capabilityId}
                  review={review}
                  onRecordReview={onRecordReview}
                  reviewPending={reviewPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
