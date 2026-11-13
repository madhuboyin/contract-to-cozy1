// FR-DATA-10 shapes 7-9 (time series / comparison, absence, cross-entity). These shapes are NOT supported by the generic reader today, and this file does not add support: it fixes the declaration each entry must make
// BEFORE any question may be answered in that shape, and validates it. The three registries ship EMPTY on purpose: every entry is an owner-reviewed declaration (which history source is canonical, which requirement
// applies to which home, which relation may be joined), not something the implementation may invent. An entry that omits a required attribute fails validation, so it can never be enabled by accident.
import { DATA_POINT_BY_ID, type DataPointEntity } from './dataPointCatalogue';

/** Shape 7: only a catalogued data point with a canonical HISTORICAL source, a defined timestamp, ordering, de-duplication and supersession behaviour. */
export interface TimeSeriesDeclaration {
  readonly dataPointId: string;
  readonly historyEntity: DataPointEntity;
  /** The column that orders and dates observations (never a mutable "updatedAt"). */
  readonly timestampColumn: string;
  readonly ordering: 'OBSERVED_AT_ASC' | 'OBSERVED_AT_DESC';
  /** How two observations for the same moment are reduced to one. */
  readonly deduplication: 'LATEST_RECORDED_WINS' | 'HIGHEST_CONFIDENCE_WINS';
  /** What happens to an observation a later one replaces (the tax records' supersededById is the model). */
  readonly supersession: 'EXCLUDE_SUPERSEDED' | 'KEEP_AND_FLAG';
  readonly maxPeriods: number;
  readonly reviewedBy: string;
  readonly reviewedOn: string;
}
/** Shape 8: a requirement with an applicability rule, a responsible source and the four distinct outcomes. */
export interface AbsenceRequirementDeclaration {
  readonly requirementId: string;
  /** The catalogued point whose absence is asked about. */
  readonly dataPointId?: string;
  /** Extra wording that names the field in a question, beyond the point's own aliases. */
  readonly words?: readonly string[];
  readonly label: string;
  /** When the requirement applies to a home at all (a declared rule id, evaluated deterministically, never free text). */
  readonly applicabilityRuleId: string;
  /** The entity whose records satisfy it. */
  readonly responsibleSource: DataPointEntity;
  /** The answer must keep these four apart: not recorded, not applicable, not authorized, not found. */
  readonly outcomes: readonly ['NOT_RECORDED', 'NOT_APPLICABLE', 'NOT_AUTHORIZED', 'NOT_FOUND'];
  readonly audienceFloor: 'VIEWER' | 'CONTRIBUTOR' | 'OWNER';
  readonly reviewedBy: string;
  readonly reviewedOn: string;
}
/** Shape 9: an explicit relation path with authorization on EVERY participating entity, a bounded join and a declared cardinality. */
export interface CrossEntityRelationDeclaration {
  readonly relationId: string;
  readonly from: DataPointEntity;
  readonly to: DataPointEntity;
  readonly viaColumn: string;
  readonly cardinality: 'ONE_TO_ONE' | 'ONE_TO_MANY';
  readonly maxJoinedRows: number;
  /** The floor of each participating entity: the strictest applies, and neither entity may broaden the other. */
  readonly audienceFloors: Readonly<Record<string, 'VIEWER' | 'CONTRIBUTOR' | 'OWNER'>>;
  readonly propertyScopedBothSides: true;
  readonly reviewedBy: string;
  readonly reviewedOn: string;
}

// Owner-path declarations (2026-11-13). The reviewer field records the owner's session approval, not a named external reviewer (D8 is still open): replace it when one is named.
export const TIME_SERIES_REGISTRY: readonly TimeSeriesDeclaration[] = Object.freeze([
  { dataPointId: 'taxBill.amount', historyEntity: 'PropertyTaxBillRecord', timestampColumn: 'taxYear', ordering: 'OBSERVED_AT_ASC', deduplication: 'LATEST_RECORDED_WINS', supersession: 'EXCLUDE_SUPERSEDED', maxPeriods: 10, reviewedBy: 'product owner (approved in session 2026-11-13: shapes 7-9 for the owner path)', reviewedOn: '2026-11-13' },
  { dataPointId: 'taxAssessment.totalAssessedValue', historyEntity: 'PropertyTaxAssessmentRecord', timestampColumn: 'taxYear', ordering: 'OBSERVED_AT_ASC', deduplication: 'LATEST_RECORDED_WINS', supersession: 'EXCLUDE_SUPERSEDED', maxPeriods: 10, reviewedBy: 'product owner (approved in session 2026-11-13: shapes 7-9 for the owner path)', reviewedOn: '2026-11-13' },
] as TimeSeriesDeclaration[]);
export const ABSENCE_REQUIREMENT_REGISTRY: readonly AbsenceRequirementDeclaration[] = Object.freeze([
  { requirementId: 'item.serial.recorded', dataPointId: 'item.serial', label: 'item.serial', applicabilityRuleId: 'EVERY_INVENTORY_ITEM', responsibleSource: 'InventoryItem', outcomes: ['NOT_RECORDED', 'NOT_APPLICABLE', 'NOT_AUTHORIZED', 'NOT_FOUND'], audienceFloor: 'VIEWER', reviewedBy: 'product owner (approved in session 2026-11-13: shapes 7-9 for the owner path)', reviewedOn: '2026-11-13' },
  { requirementId: 'item.model.recorded', dataPointId: 'item.model', label: 'item.model', applicabilityRuleId: 'EVERY_INVENTORY_ITEM', responsibleSource: 'InventoryItem', outcomes: ['NOT_RECORDED', 'NOT_APPLICABLE', 'NOT_AUTHORIZED', 'NOT_FOUND'], audienceFloor: 'VIEWER', reviewedBy: 'product owner (approved in session 2026-11-13: shapes 7-9 for the owner path)', reviewedOn: '2026-11-13' },
  { requirementId: 'item.installedOn.recorded', dataPointId: 'item.installedOn', label: 'item.installedOn', applicabilityRuleId: 'EVERY_INVENTORY_ITEM', responsibleSource: 'InventoryItem', outcomes: ['NOT_RECORDED', 'NOT_APPLICABLE', 'NOT_AUTHORIZED', 'NOT_FOUND'], audienceFloor: 'VIEWER', reviewedBy: 'product owner (approved in session 2026-11-13: shapes 7-9 for the owner path)', reviewedOn: '2026-11-13' },
  { requirementId: 'item.purchasedOn.recorded', dataPointId: 'item.purchasedOn', label: 'item.purchasedOn', applicabilityRuleId: 'EVERY_INVENTORY_ITEM', responsibleSource: 'InventoryItem', outcomes: ['NOT_RECORDED', 'NOT_APPLICABLE', 'NOT_AUTHORIZED', 'NOT_FOUND'], audienceFloor: 'VIEWER', reviewedBy: 'product owner (approved in session 2026-11-13: shapes 7-9 for the owner path)', reviewedOn: '2026-11-13' },
  { requirementId: 'item.purchaseCost.recorded', dataPointId: 'item.purchaseCost', label: 'item.purchaseCost', applicabilityRuleId: 'EVERY_INVENTORY_ITEM', responsibleSource: 'InventoryItem', outcomes: ['NOT_RECORDED', 'NOT_APPLICABLE', 'NOT_AUTHORIZED', 'NOT_FOUND'], audienceFloor: 'VIEWER', reviewedBy: 'product owner (approved in session 2026-11-13: shapes 7-9 for the owner path)', reviewedOn: '2026-11-13' },
  { requirementId: 'item.replacementCost.recorded', dataPointId: 'item.replacementCost', words: ['replacement cost', 'replacement price', 'replacement value', 'cost to replace'], label: 'item.replacementCost', applicabilityRuleId: 'EVERY_INVENTORY_ITEM', responsibleSource: 'InventoryItem', outcomes: ['NOT_RECORDED', 'NOT_APPLICABLE', 'NOT_AUTHORIZED', 'NOT_FOUND'], audienceFloor: 'VIEWER', reviewedBy: 'product owner (approved in session 2026-11-13: shapes 7-9 for the owner path)', reviewedOn: '2026-11-13' },
  { requirementId: 'item.lastServicedOn.recorded', dataPointId: 'item.lastServicedOn', label: 'item.lastServicedOn', applicabilityRuleId: 'EVERY_INVENTORY_ITEM', responsibleSource: 'InventoryItem', outcomes: ['NOT_RECORDED', 'NOT_APPLICABLE', 'NOT_AUTHORIZED', 'NOT_FOUND'], audienceFloor: 'VIEWER', reviewedBy: 'product owner (approved in session 2026-11-13: shapes 7-9 for the owner path)', reviewedOn: '2026-11-13' },
] as AbsenceRequirementDeclaration[]);
// The warranty side is reached THROUGH the property-scoped item (Warranty.inventoryItemId), so it can never be another home's record.
export const CROSS_ENTITY_RELATION_REGISTRY: readonly CrossEntityRelationDeclaration[] = Object.freeze([
  { relationId: 'item-warranty', from: 'InventoryItem', to: 'Warranty', viaColumn: 'inventoryItemId', cardinality: 'ONE_TO_MANY', maxJoinedRows: 100, audienceFloors: { InventoryItem: 'VIEWER', Warranty: 'VIEWER' }, propertyScopedBothSides: true, reviewedBy: 'product owner (approved in session 2026-11-13: shapes 7-9 for the owner path)', reviewedOn: '2026-11-13' },
] as CrossEntityRelationDeclaration[]);

const reviewed = (e: { reviewedBy: string; reviewedOn: string }, id: string, issues: string[]) => {
  if (!e.reviewedBy?.trim()) issues.push(`${id}: no named reviewer`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.reviewedOn ?? '')) issues.push(`${id}: no review date`);
};
export function validateTimeSeries(entries: readonly TimeSeriesDeclaration[] = TIME_SERIES_REGISTRY): string[] {
  const issues: string[] = []; const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.dataPointId)) issues.push(`${e.dataPointId}: declared twice`); seen.add(e.dataPointId);
    if (!DATA_POINT_BY_ID.has(e.dataPointId)) issues.push(`${e.dataPointId}: not a catalogued data point`);
    if (!e.timestampColumn?.trim() || /updatedAt|modifiedAt/i.test(e.timestampColumn)) issues.push(`${e.dataPointId}: the timestamp must be an observation time, not an edit time`);
    if (!Number.isInteger(e.maxPeriods) || e.maxPeriods < 1 || e.maxPeriods > 120) issues.push(`${e.dataPointId}: maxPeriods must be 1-120`);
    reviewed(e, e.dataPointId, issues);
  }
  return issues;
}
export function validateAbsence(entries: readonly AbsenceRequirementDeclaration[] = ABSENCE_REQUIREMENT_REGISTRY): string[] {
  const issues: string[] = []; const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.requirementId)) issues.push(`${e.requirementId}: declared twice`); seen.add(e.requirementId);
    if (!e.applicabilityRuleId?.trim()) issues.push(`${e.requirementId}: no applicability rule`);
    if (!e.responsibleSource) issues.push(`${e.requirementId}: no responsible source`);
    if (e.dataPointId !== undefined && !DATA_POINT_BY_ID.has(e.dataPointId)) issues.push(`${e.requirementId}: ${e.dataPointId} is not a catalogued data point`);
    const need = ['NOT_RECORDED', 'NOT_APPLICABLE', 'NOT_AUTHORIZED', 'NOT_FOUND'];
    if (!Array.isArray(e.outcomes) || need.some((o, i) => e.outcomes[i] !== o)) issues.push(`${e.requirementId}: the four outcomes must be kept distinct`);
    reviewed(e, e.requirementId, issues);
  }
  return issues;
}
export function validateCrossEntity(entries: readonly CrossEntityRelationDeclaration[] = CROSS_ENTITY_RELATION_REGISTRY): string[] {
  const issues: string[] = []; const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.relationId)) issues.push(`${e.relationId}: declared twice`); seen.add(e.relationId);
    if (e.propertyScopedBothSides !== true) issues.push(`${e.relationId}: both sides must be property-scoped`);
    if (!e.audienceFloors?.[e.from] || !e.audienceFloors?.[e.to]) issues.push(`${e.relationId}: an audience floor is required for EVERY participating entity`);
    if (!Number.isInteger(e.maxJoinedRows) || e.maxJoinedRows < 1 || e.maxJoinedRows > 100) issues.push(`${e.relationId}: the join must be bounded (1-100 rows)`);
    if (e.cardinality !== 'ONE_TO_ONE' && e.cardinality !== 'ONE_TO_MANY') issues.push(`${e.relationId}: cardinality must be declared`);
    reviewed(e, e.relationId, issues);
  }
  return issues;
}
/** True when the generic reader may answer a question in shape 7, 8 or 9. Today it is false for all three because every registry is empty. */
export const queryShapesEnabled = (): { timeSeries: boolean; absence: boolean; crossEntity: boolean } => ({
  timeSeries: TIME_SERIES_REGISTRY.length > 0 && validateTimeSeries().length === 0,
  absence: ABSENCE_REQUIREMENT_REGISTRY.length > 0 && validateAbsence().length === 0,
  crossEntity: CROSS_ENTITY_RELATION_REGISTRY.length > 0 && validateCrossEntity().length === 0,
});
