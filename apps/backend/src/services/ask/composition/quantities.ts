// Composition FRD §6.3: one basis per quantity. A "quantity" is a named figure (the replacement cost of an item). An operation declares the quantities it
// states in `result.parameters.quantities`; the authority table says which operation owns each quantity, so a composed answer never shows two unlabeled
// figures for one thing. Pure: no database.
import type { AskOperationId } from '../askOperationRegistry';

export type QuantityBasis = 'TODAY' | 'WINDOW' | 'TARGET';
export interface Quantity {
  key: 'item.replacementCost';
  /** Which item, e.g. "ROOF". */
  itemKey: string;
  basis: QuantityBasis;
  minCents: number;
  maxCents: number;
  /** For TARGET: the homeowner's own words for the date ("in 5 years"). */
  targetLabel?: string;
}

/** Quantities a result declares; anything else in `parameters` is ignored. */
export function quantitiesOf(parameters: unknown): Quantity[] {
  const raw = parameters && typeof parameters === 'object' ? (parameters as Record<string, unknown>).quantities : null;
  if (!Array.isArray(raw)) return [];
  return raw.filter((q): q is Quantity => !!q && typeof q === 'object' && (q as Quantity).key === 'item.replacementCost'
    && typeof (q as Quantity).itemKey === 'string' && ['TODAY', 'WINDOW', 'TARGET'].includes((q as Quantity).basis)
    && Number.isFinite((q as Quantity).minCents) && Number.isFinite((q as Quantity).maxCents));
}

/** §6.3.1: the authority for a quantity, by whether the question named a date. Adding a row is a registry change with a test. */
export const QUANTITY_AUTHORITY: Readonly<Record<Quantity['key'], { undated: { operationId: AskOperationId; basis: QuantityBasis }; dated: { operationId: AskOperationId; basis: QuantityBasis } }>> = Object.freeze({
  'item.replacementCost': { undated: { operationId: 'ITEM_REPLACEMENT_COST', basis: 'TODAY' }, dated: { operationId: 'ITEM_REPLACEMENT_COST', basis: 'TARGET' } },
});

/**
 * FR-DEC-7 contractual coverage: quantities an operation ALWAYS answers, per mode, declared here and nowhere else. Inactive in v1 (no declarations), so both
 * components run. Coverage is never inferred from prose or block contents.
 */
export interface CoverageDeclaration { quantityKey: Quantity['key']; mode: 'UNDATED' | 'DATED'; clauseMatches: (clause: string) => boolean }
export const COVERAGE_DECLARATIONS: Readonly<Partial<Record<AskOperationId, readonly CoverageDeclaration[]>>> = Object.freeze({});

export function coverageSkips(firstOperationId: AskOperationId, secondClause: string): boolean {
  return (COVERAGE_DECLARATIONS[firstOperationId] ?? []).some((declaration) => declaration.clauseMatches(secondClause));
}

/** FR-ELG-7: every declared quantity key must exist in the authority table and name that operation as the authority for the declared mode. */
export function validateCoverageDeclarations(declarations: Readonly<Partial<Record<AskOperationId, readonly CoverageDeclaration[]>>> = COVERAGE_DECLARATIONS): string[] {
  const issues: string[] = [];
  for (const [operationId, list] of Object.entries(declarations)) {
    for (const declaration of list ?? []) {
      const authority = QUANTITY_AUTHORITY[declaration.quantityKey];
      if (!authority) { issues.push(`${operationId}: declares unknown quantity ${declaration.quantityKey}`); continue; }
      const expected = declaration.mode === 'DATED' ? authority.dated : authority.undated;
      if (expected.operationId !== operationId) issues.push(`${operationId}: declares ${declaration.quantityKey} (${declaration.mode}) but the authority is ${expected.operationId}`);
    }
  }
  return issues;
}

export interface BasisLine { quantityKey: Quantity['key']; itemKey: string; basis: QuantityBasis; basisLabel: string; minCents: number; maxCents: number; authority: AskOperationId }
export interface BasisProjection { lines: BasisLine[]; notes: string[]; contradictions: string[] }

export const basisLabel = (quantity: Pick<Quantity, 'basis' | 'targetLabel'>): string => (
  quantity.basis === 'TODAY' ? 'in today’s dollars' : quantity.basis === 'WINDOW' ? 'at the expected replacement window' : `grown to ${quantity.targetLabel ?? 'the date you named'}`
);

const ROUNDING_CENTS = 100;
const sameFigure = (a: Quantity, b: Quantity) => Math.abs(a.minCents - b.minCents) <= ROUNDING_CENTS && Math.abs(a.maxCents - b.maxCents) <= ROUNDING_CENTS;

/**
 * FR-BAS-1..5 and §6.6. `sections` are the answered components with the quantities they declared. For a quantity that appears in more than one section:
 * the authority section's figure is the authoritative line; a duplicate on the same basis must agree within rounding (else a contradiction); a duplicate
 * on a different basis is simply labeled by its own basis; if no authority section stated the quantity, each figure is shown with its own label and a note.
 */
export function projectBasis(sections: ReadonlyArray<{ operationId: AskOperationId; quantities: Quantity[] }>, dated: boolean): BasisProjection {
  const lines: BasisLine[] = [];
  const notes: string[] = [];
  const contradictions: string[] = [];
  const groups = new Map<string, Array<{ operationId: AskOperationId; quantity: Quantity }>>();
  for (const section of sections) for (const quantity of section.quantities) {
    const key = `${quantity.key}|${quantity.itemKey}`;
    groups.set(key, [...(groups.get(key) ?? []), { operationId: section.operationId, quantity }]);
  }
  for (const entries of groups.values()) {
    const sample = entries[0].quantity;
    const authorityRow = QUANTITY_AUTHORITY[sample.key];
    const authority = dated ? authorityRow.dated : authorityRow.undated;
    const owner = entries.find((e) => e.operationId === authority.operationId && e.quantity.basis === authority.basis);
    if (owner) {
      lines.push({ quantityKey: sample.key, itemKey: sample.itemKey, basis: owner.quantity.basis, basisLabel: basisLabel(owner.quantity), minCents: owner.quantity.minCents, maxCents: owner.quantity.maxCents, authority: owner.operationId });
      for (const other of entries) {
        if (other === owner) continue;
        if (other.quantity.basis === owner.quantity.basis && !sameFigure(other.quantity, owner.quantity)) {
          contradictions.push(`${other.operationId} gives a different ${sample.itemKey.toLowerCase()} cost ${basisLabel(other.quantity)} than ${owner.operationId}.`);
        }
      }
    } else if (entries.length > 1) {
      for (const e of entries) lines.push({ quantityKey: e.quantity.key, itemKey: e.quantity.itemKey, basis: e.quantity.basis, basisLabel: basisLabel(e.quantity), minCents: e.quantity.minCents, maxCents: e.quantity.maxCents, authority: e.operationId });
      notes.push(`The ${sample.itemKey.toLowerCase()} cost appears with different bases, each labeled.`);
    }
  }
  return { lines, notes, contradictions };
}
