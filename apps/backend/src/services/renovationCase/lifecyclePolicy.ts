import type {
  RenovationCaseLifecycle,
  RenovationScopeApprovalStatus,
} from '@prisma/client';

const FORWARD_TRANSITIONS: Record<RenovationCaseLifecycle, readonly RenovationCaseLifecycle[]> = {
  IDEA: ['FEASIBILITY', 'SCOPE_DEFINITION', 'HISTORICAL_RESEARCH'],
  FEASIBILITY: ['IDEA', 'SCOPE_DEFINITION', 'REQUIREMENTS_RESEARCH'],
  SCOPE_DEFINITION: ['FEASIBILITY', 'REQUIREMENTS_RESEARCH'],
  REQUIREMENTS_RESEARCH: ['SCOPE_DEFINITION', 'APPROVALS_IN_PROGRESS', 'PREPARING_TO_START'],
  APPROVALS_IN_PROGRESS: ['REQUIREMENTS_RESEARCH', 'PREPARING_TO_START'],
  PREPARING_TO_START: ['REQUIREMENTS_RESEARCH', 'APPROVALS_IN_PROGRESS', 'READY_TO_START'],
  READY_TO_START: ['PREPARING_TO_START', 'IN_EXECUTION'],
  IN_EXECUTION: ['INSPECTION_AND_CLOSEOUT', 'COMPLETED_WITH_OPEN_ITEMS'],
  INSPECTION_AND_CLOSEOUT: ['IN_EXECUTION', 'VERIFIED_COMPLETE', 'COMPLETED_WITH_OPEN_ITEMS'],
  VERIFIED_COMPLETE: [],
  ON_HOLD: [],
  CANCELLED: [],
  COMPLETED_WITH_OPEN_ITEMS: ['INSPECTION_AND_CLOSEOUT', 'VERIFIED_COMPLETE'],
  HISTORICAL_RESEARCH: ['REQUIREMENTS_RESEARCH', 'COMPLETED_WITH_OPEN_ITEMS', 'VERIFIED_COMPLETE'],
};

const TERMINAL_STATES = new Set<RenovationCaseLifecycle>(['VERIFIED_COMPLETE', 'CANCELLED']);

export function canTransitionRenovationCase(
  current: RenovationCaseLifecycle,
  next: RenovationCaseLifecycle,
  resumeLifecycle?: RenovationCaseLifecycle | null,
): boolean {
  if (current === next) return true;
  if (next === 'CANCELLED' || next === 'ON_HOLD') return !TERMINAL_STATES.has(current);
  if (current === 'ON_HOLD') {
    return resumeLifecycle === next && !TERMINAL_STATES.has(next);
  }
  return FORWARD_TRANSITIONS[current].includes(next);
}

export type ScopeSnapshot = {
  summary?: string | null;
  workItems: unknown;
  spacesAffected: string[];
  systemsAffected: string[];
  intendedUse?: string | null;
  dimensions?: unknown;
  structuralEffects: boolean;
  exteriorEffects: boolean;
  drawingDocumentIds: string[];
  specificationDocumentIds: string[];
  estimatedCostCents?: number | null;
  contractCostCents?: number | null;
  approvalStatus: RenovationScopeApprovalStatus;
};

export type ScopeInvalidationKey =
  | 'REQUIREMENTS'
  | 'PERMIT'
  | 'HOA'
  | 'SAFETY'
  | 'COST'
  | 'SCHEDULE'
  | 'MATERIALS';

function normalize(value: unknown): unknown {
  if (value === undefined) return '__undefined__';
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}

function stable(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function diffRenovationScope(previous: ScopeSnapshot, next: ScopeSnapshot) {
  const changedFields = (Object.keys(next) as Array<keyof ScopeSnapshot>)
    .filter((field) => stable(previous[field]) !== stable(next[field]));
  const invalidates = new Set<ScopeInvalidationKey>();

  for (const field of changedFields) {
    if (['workItems', 'spacesAffected', 'systemsAffected', 'intendedUse'].includes(field)) {
      invalidates.add('REQUIREMENTS');
      invalidates.add('PERMIT');
      invalidates.add('HOA');
      invalidates.add('SAFETY');
      invalidates.add('COST');
      invalidates.add('SCHEDULE');
      invalidates.add('MATERIALS');
    }
    if (['dimensions', 'structuralEffects', 'exteriorEffects'].includes(field)) {
      invalidates.add('REQUIREMENTS');
      invalidates.add('PERMIT');
      invalidates.add('HOA');
      invalidates.add('SAFETY');
    }
    if (['estimatedCostCents', 'contractCostCents'].includes(field)) {
      invalidates.add('COST');
    }
    if (['drawingDocumentIds', 'specificationDocumentIds'].includes(field)) {
      invalidates.add('REQUIREMENTS');
      invalidates.add('PERMIT');
      invalidates.add('HOA');
      invalidates.add('MATERIALS');
    }
  }

  return {
    changedFields,
    invalidates: [...invalidates].sort(),
    requiresRecheck: invalidates.size > 0,
  };
}
