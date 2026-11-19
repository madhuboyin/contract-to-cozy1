/**
 * The inventory fields INVENTORY_ITEM_CORRECT can fill in, and the one judgement of which of them an item is missing.
 * Leaf module (no imports) so the dedicated inventory reader, the Suggested Next Action candidates and the semantic slice's row enrichment all
 * share one definition. Documents and coverage evidence are deliberately NOT here: the correction form cannot fill them (different workflows).
 */
export type MissingCorrectableField = 'brand' | 'model' | 'serialNo' | 'purchasedOn';

export interface MissingCorrectableFieldsInput {
  readonly brand?: string | null;
  readonly manufacturer?: string | null;
  readonly model?: string | null;
  readonly modelNumber?: string | null;
  readonly serialNo?: string | null;
  readonly serialNumber?: string | null;
  readonly purchasedOn?: Date | string | null;
}

/** Fixed order: purchase date, brand, model, serial number. */
export function missingCorrectableFields(item: MissingCorrectableFieldsInput): MissingCorrectableField[] {
  return [
    ...(!item.purchasedOn ? ['purchasedOn' as const] : []),
    ...(!item.brand && !item.manufacturer ? ['brand' as const] : []),
    ...(!item.model && !item.modelNumber ? ['model' as const] : []),
    ...(!item.serialNo && !item.serialNumber ? ['serialNo' as const] : []),
  ];
}
