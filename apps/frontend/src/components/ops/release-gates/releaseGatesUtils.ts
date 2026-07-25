// apps/frontend/src/components/ops/release-gates/releaseGatesUtils.ts
//
// Shared labels, badge colors, and formatters for the Release Gates admin
// console (apps/frontend/src/app/(dashboard)/dashboard/admin/release-gates).

import type {
  CapabilityGovernanceReviewRole,
  CapabilityLaunchReviewState,
} from '@/lib/api/adminPlatformOps';

export const STATE_ORDER: CapabilityLaunchReviewState[] = ['BLOCKED', 'HELD', 'READY'];

export const STATE_LABELS: Record<CapabilityLaunchReviewState, string> = {
  BLOCKED: 'Blocked',
  HELD: 'Held',
  READY: 'Ready',
};

export const STATE_DOT: Record<CapabilityLaunchReviewState, string> = {
  BLOCKED: 'bg-rose-500',
  HELD: 'bg-slate-400',
  READY: 'bg-emerald-400',
};

export const STATE_BADGE: Record<string, string> = {
  BLOCKED: 'bg-rose-50 text-rose-700',
  HELD: 'bg-slate-100 text-slate-700',
  READY: 'bg-emerald-50 text-emerald-700',
};

export const COHORT_BADGE: Record<string, string> = {
  DISABLED: 'bg-slate-100 text-slate-600',
  INTERNAL: 'bg-indigo-50 text-indigo-700',
  BETA: 'bg-amber-50 text-amber-700',
  FULL: 'bg-emerald-50 text-emerald-700',
};

export const ROLE_LABELS: Record<CapabilityGovernanceReviewRole, string> = {
  PRODUCT: 'Product',
  DOMAIN: 'Domain',
  TRUST: 'Trust',
  LEGAL_COMPLIANCE: 'Legal',
  COMMERCIAL_INTEGRITY: 'Comm.',
};

export function fmtDate(value: string): string {
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/** RELEASE_GATES_NOT_ENFORCED -> "Release gates not enforced" */
export function humanizeBlockerCode(code: string): string {
  const words = code.toLowerCase().split('_');
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + ' ' + words.slice(1).join(' ');
}

export type RoleApprovalStatus = 'approved' | 'rejected' | 'pending';

export function roleStatus(
  role: CapabilityGovernanceReviewRole,
  approvedRoles: CapabilityGovernanceReviewRole[],
  rejectedRoles: CapabilityGovernanceReviewRole[],
): RoleApprovalStatus {
  if (approvedRoles.includes(role)) return 'approved';
  if (rejectedRoles.includes(role)) return 'rejected';
  return 'pending';
}

export const ROLE_DOT_CLASS: Record<RoleApprovalStatus, string> = {
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
  pending: 'bg-amber-50 text-amber-700',
};
