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
  