// apps/backend/src/services/claims/claims.transitions.ts
import { ClaimStatus } from '../../types/claims.types';

const ALLOWED_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  DRAFT: ['IN_PROGRESS', 'SUBMITTED', 'CLOSED'],
  IN_PROGRESS: ['SUBMITTED', 'UNDER_REVIEW', 'CLOSED'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'DENIED', 'CLOSED'],
  UNDER_REVIEW: ['APPROVED', 'DENIED', 'CLOSED'],
  APPROVED: ['CLOSED'],
  DENIED: ['CLOSED'],
  CLOSED: [], // terminal
};

export function isValidTransition(from: ClaimStatus, to: ClaimStatus) {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export function assertValidTransition(from: ClaimStatus, to: ClaimStatus) {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid status transition: ${from} → ${to}`);
  }
}
