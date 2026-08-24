// Home Intelligence Graph — Ask Intelligence FRD §15. A typed read
// abstraction over existing canonical relational identifiers, explicitly NOT
// a graph database (§15.1: "New graph infrastructure is prohibited until
// query volume, latency, or relational complexity demonstrates a need").
// Every supported edge declares the §15.2 metadata below; an LLM cannot
// create an authoritative edge — only these registered, code-defined edges
// exist. Not wired into any existing call site this phase (Phase 8C) — this
// is standalone, tested infrastructure for Phase 9A (Change Intelligence)
// and beyond to consume.
//
// Every read function takes propertyId first and scopes its `where` clause
// with it — defense in depth, even though every existing/future caller is
// already authorized upstream (propertyAuthMiddleware / executeOperationCore).

import { prisma } from '../../lib/prisma';
import type { HomeIntelligenceGraphEdge } from '../../productFramework/decisionPlatform/decisionPlatform.contract';

export type HomeIntelligenceGraphEdgeType =
  | 'DECISION_THREAD_FACT_REFERENCE'
  | 'DECISION_THREAD_PRIMARY_ENTITY'
  | 'RECOMMENDATION_SNAPSHOT_FACT_LINEAGE'
  | 'INVENTORY_ITEM_WARRANTY_AND_FUTURE_EXPENSE';

const edge = (overrides: HomeIntelligenceGraphEdge): HomeIntelligenceGraphEdge => overrides;

export const HOME_INTELLIGENCE_GRAPH_EDGES: Readonly<Record<HomeIntelligenceGraphEdgeType, HomeIntelligenceGraphEdge>> = Object.freeze({
  // "which records/evidence apply to this item" — DecisionThreadFactReference
  // rows are written by decisionThreadService.ts at snapshot-creation time
  // (§10.4); this edge answers the reverse lookup.
  DECISION_THREAD_FACT_REFERENCE: edge({
    edgeType: 'DECISION_THREAD_FACT_REFERENCE',
    version: '1.0',
    sourceEntityType: 'InventoryItem',
    targetEntityType: 'DecisionThreadFactReference',
    canonicalSourceOwner: 'DecisionPlatform',
    derivationMethod: 'POLYMORPHIC_REFERENCE',
    direction: 'FORWARD',
    temporalValidity: 'HISTORICAL',
    authorizationPropagationRule: 'Scoped by the owning DecisionThread.propertyId; caller must already hold property access.',
    freshnessPolicy: 'Rows are append-only lineage records, not live facts — always reflect what a snapshot actually referenced, never re-derived.',
    requiresHomeownerConfirmation: false,
  }),
  // "which decision threads depend on this item" — DecisionThread rows whose
  // primaryEntityType/primaryEntityId point at the item (§10.1).
  DECISION_THREAD_PRIMARY_ENTITY: edge({
    edgeType: 'DECISION_THREAD_PRIMARY_ENTITY',
    version: '1.0',
    sourceEntityType: 'InventoryItem',
    targetEntityType: 'DecisionThread',
    canonicalSourceOwner: 'DecisionPlatform',
    derivationMethod: 'POLYMORPHIC_REFERENCE',
    direction: 'FORWARD',
    temporalValidity: 'HISTORICAL',
    authorizationPropagationRule: 'Scoped by DecisionThread.propertyId; caller must already hold property access.',
    freshnessPolicy: 'Live read of current DecisionThread rows — reflects lifecycleStatus/contextStatus as of read time.',
    requiresHomeownerConfirmation: false,
  }),
  // "which snapshots reference the corrected fact" — RecommendationSnapshot's
  // Json canonicalFactReferences lineage, used e.g. when a fact correction
  // needs to identify every downstream recommendation that relied on it.
  RECOMMENDATION_SNAPSHOT_FACT_LINEAGE: edge({
    edgeType: 'RECOMMENDATION_SNAPSHOT_FACT_LINEAGE',
    version: '1.0',
    sourceEntityType: 'CanonicalFact',
    targetEntityType: 'RecommendationSnapshot',
    canonicalSourceOwner: 'DecisionPlatform',
    derivationMethod: 'JSON_LINEAGE_SCAN',
    direction: 'FORWARD',
    temporalValidity: 'HISTORICAL',
    authorizationPropagationRule: 'Scoped by RecommendationSnapshot.propertyId; caller must already hold property access.',
    freshnessPolicy: 'Snapshots are immutable once created (FRD §10.4) — a match here is permanent lineage, never stale in itself.',
    requiresHomeownerConfirmation: false,
  }),
  // "which future expense or warranty records are directly linked" — both
  // Warranty relations (primary InventoryItem.warrantyId and the reverse
  // linkedWarranties) plus HomeCapitalTimelineItem rows, owned by separate
  // features (Coverage, Home Capital Timeline) and only optionally linked.
  INVENTORY_ITEM_WARRANTY_AND_FUTURE_EXPENSE: edge({
    edgeType: 'INVENTORY_ITEM_WARRANTY_AND_FUTURE_EXPENSE',
    version: '1.0',
    sourceEntityType: 'InventoryItem',
    targetEntityType: 'Warranty|HomeCapitalTimelineItem',
    canonicalSourceOwner: 'CoverageAndHomeCapitalTimeline',
    derivationMethod: 'DIRECT_FOREIGN_KEY',
    direction: 'FORWARD',
    temporalValidity: 'CURRENT_ONLY',
    authorizationPropagationRule: 'Scoped by InventoryItem.propertyId; caller must already hold property access. Both link kinds are optional and may be empty.',
    freshnessPolicy: 'Live read of current rows — no caching, no derived-range fabrication (see hvacRepairReplaceEngine.service.ts comment on why an unsourced replacement-cost range is never synthesized here either).',
    requiresHomeownerConfirmation: false,
  }),
});

export function validateHomeIntelligenceGraphEdges(): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const [mapKey, entry] of Object.entries(HOME_INTELLIGENCE_GRAPH_EDGES)) {
    if (mapKey !== entry.edgeType) issues.push(`${mapKey}: edgeType mismatch`);
    if (seen.has(entry.edgeType)) issues.push(`${mapKey}: duplicate edgeType`);
    seen.add(entry.edgeType);
    if (!entry.sourceEntityType || !entry.targetEntityType) issues.push(`${mapKey}: missing source/target entity type`);
    if (!entry.canonicalSourceOwner) issues.push(`${mapKey}: missing canonicalSourceOwner`);
    if (!entry.authorizationPropagationRule) issues.push(`${mapKey}: missing authorizationPropagationRule`);
    if (!entry.freshnessPolicy) issues.push(`${mapKey}: missing freshnessPolicy`);
  }
  return issues;
}

// "which records/evidence apply to this item" (FRD §15.3) — every
// DecisionThreadFactReference row for threads whose primaryEntityId is this
// item.
export async function getFactReferencesForItem(propertyId: string, inventoryItemId: string) {
  return prisma.decisionThreadFactReference.findMany({
    where: {
      decisionThread: {
        propertyId,
        primaryEntityType: 'InventoryItem',
        primaryEntityId: inventoryItemId,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

// "which decision threads depend on this item" (FRD §15.3).
export async function getDecisionThreadsForItem(propertyId: string, inventoryItemId: string) {
  return prisma.decisionThread.findMany({
    where: {
      propertyId,
      primaryEntityType: 'InventoryItem',
      primaryEntityId: inventoryItemId,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

// "which snapshots reference the corrected fact" (FRD §15.3) — a Json-
// containment scan over RecommendationSnapshot.canonicalFactReferences,
// whose stored shape is {entityType, entityId, fieldPath} objects (see
// decisionThreadService.ts's snapshot-creation call sites). fieldPath is
// optional: omitting it matches any snapshot referencing the entity at all,
// regardless of which field.
export async function getSnapshotsReferencingFact(
  propertyId: string,
  entityType: string,
  entityId: string,
  fieldPath?: string,
) {
  return prisma.recommendationSnapshot.findMany({
    where: {
      propertyId,
      canonicalFactReferences: {
        array_contains: fieldPath ? [{ entityType, entityId, fieldPath }] : [{ entityType, entityId }],
      },
    },
    orderBy: { generatedAt: 'desc' },
  });
}

export async function getSnapshotsReferencingFactPage(
  propertyId: string,
  entityType: string,
  entityId: string,
  input: { cursor: string | null; pageSize: number; fieldPath?: string },
) {
  const rows = await prisma.recommendationSnapshot.findMany({
    where: {
      propertyId,
      canonicalFactReferences: {
        array_contains: input.fieldPath
          ? [{ entityType, entityId, fieldPath: input.fieldPath }]
          : [{ entityType, entityId }],
      },
    },
    orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
    take: input.pageSize + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const snapshots = rows.slice(0, input.pageSize);
  return {
    snapshots,
    nextCursor: rows.length > input.pageSize ? snapshots.at(-1)?.id ?? null : null,
  };
}

// "which future expense or warranty records are directly linked" (FRD
// §15.3). Both Warranty link kinds and HomeCapitalTimelineItem rows are
// optional and owned by other features — an empty result on either side is
// an expected, not exceptional, outcome.
export async function getWarrantyAndFutureExpenseForItem(propertyId: string, inventoryItemId: string) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: inventoryItemId, propertyId },
    select: {
      warranty: true,
      linkedWarranties: true,
    },
  });
  const futureExpenses = await prisma.homeCapitalTimelineItem.findMany({
    where: { propertyId, inventoryItemId },
    orderBy: { windowStart: 'asc' },
  });
  return {
    primaryWarranty: item?.warranty ?? null,
    linkedWarranties: item?.linkedWarranties ?? [],
    futureExpenses,
  };
}
