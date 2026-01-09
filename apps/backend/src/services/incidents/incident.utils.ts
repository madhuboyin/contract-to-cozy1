export function clampInt(n: any, min: number, max: number): number {
    const x = typeof n === 'number' ? n : parseInt(String(n), 10);
    if (Number.isNaN(x)) return min;
    return Math.max(min, Math.min(max, x));
  }
  
  export function toDateOrNull(v?: string | Date | null): Date | null {
    if (!v) return null;
    if (v instanceof Date) return v;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  