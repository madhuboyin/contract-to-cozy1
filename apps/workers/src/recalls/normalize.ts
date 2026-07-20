// apps/workers/src/recalls/normalize.ts
export function normManufacturer(s?: string | null): string {
    if (!s) return '';
    return s
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9 ]/g, '')
      .trim();
  }
  
  export function normModel(s?: string | null): string {
    if (!s) return '';
    return s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, ''); // aggressive: remove punctuation/spaces
  }
  
  export function includesEither(a: string, b: string): boolean {
    if (!a || !b) return false;
    return a.includes(b) || b.includes(a);
  }

  /**
   * W3 (recall): model numbers are precise identifiers, not fuzzy text —
   * naive substring containment (includesEither) lets a short recall model
   * like "5024" false-match an unrelated asset model like "125024",
   * producing a 95%-confidence match that (for a verified inventory item)
   * gets auto-marked APPLICABLE with no homeowner confirmation. Model
   * comparison requires exact equality after normalization; manufacturer
   * names keep the looser includesEither check (brand-name variants like
   * "GE" vs "GE Appliances" are a legitimate case there, and a
   * manufacturer-only match already falls into the safer
   * NEEDS_CONFIRMATION bucket regardless of this function).
   */
  export function exactModelMatch(a: string, b: string): boolean {
    return !!a && !!b && a === b;
  }
