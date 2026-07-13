// apps/backend/src/modules/personalization/infrastructure/suppressionRepository.ts
//
// Prisma-backed repository for RecommendationSuppression — schema existed
// (additive, migration steps 4-6 plan) but nothing read or wrote it until
// this file. Wires it into the one place that creates recommendations
// (shadowEvaluateHvacFilterProof.usecase.ts).
import { prisma } from '../../../lib/prisma';
import { SuppressionReason, SuppressionScope } from '../domain/feedbackPolicy';

export type { SuppressionReason, SuppressionScope };

export interface SuppressionScopeKeys {
  definitionCode: string;
  category: string;
  dedupeKey: string;
}

/**
 * Finds the first still-active suppression covering any of the 3 scopes for
 * this property. `until` is filtered in application code, not a Prisma
 * `where`, so this stays testable against plain object mocks — same
 * convention loadActiveRule (evaluationRunRepository.ts) established.
 */
export async function findActiveSuppression(
  propertyId: string,
  keys: SuppressionScopeKeys,
): Promise<{ scope: SuppressionScope; scopeKey: string } | null> {
  const now = new Date();
  const rows = await prisma.recommendationSuppression.findMany({
    where: {
      propertyId,
      OR: [
        { scope: 'DEFINITION', scopeKey: keys.definitionCode },
        { scope: 'CATEGORY', scopeKey: keys.category },
        { scope: 'DEDUPE_KEY', scopeKey: keys.dedupeKey },
      ],
    },
  });

  const active = (rows as Array<{ scope: string; scopeKey: string; until: Date | null }>).find(
    (row) => !row.until || row.until > now,
  );

  return active ? { scope: active.scope as SuppressionScope, scopeKey: active.scopeKey } : null;
}

export interface CreateOrExtendSuppressionParams {
  propertyId: string;
  householdId?: string | null;
  scope: SuppressionScope;
  scopeKey: string;
  reason: SuppressionReason;
  /** null = indefinite. */
  until: Date | null;
}

/**
 * Upserts a suppression, extending `until` to whichever is later between the
 * existing row and the incoming value — null (indefinite) always wins over
 * any concrete date, on either side.
 */
export async function createOrExtendSuppression(params: CreateOrExtendSuppressionParams): Promise<void> {
  const existing = await prisma.recommendationSuppression.findUnique({
    where: {
      propertyId_scope_scopeKey: {
        propertyId: params.propertyId,
        scope: params.scope,
        scopeKey: params.scopeKey,
      },
    },
  });

  // Only meaningful when `existing` is set — Prisma's upsert runs `create`
  // (using params.until directly) rather than `update` otherwise.
  const extendedUntil =
    existing && existing.until !== null && params.until !== null
      ? (params.until > existing.until ? params.until : existing.until)
      : null;

  await prisma.recommendationSuppression.upsert({
    where: {
      propertyId_scope_scopeKey: {
        propertyId: params.propertyId,
        scope: params.scope,
        scopeKey: params.scopeKey,
      },
    },
    create: {
      propertyId: params.propertyId,
      householdId: params.householdId ?? null,
      scope: params.scope,
      scopeKey: params.scopeKey,
      reason: params.reason,
      until: params.until,
    },
    update: {
      reason: params.reason,
      until: extendedUntil,
    },
  });
}
