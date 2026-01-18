// apps/backend/src/services/cache/ttlCache.ts
type Entry<T> = { value: T; expiresAt: number };

export class TTLCache<T> {
  private store = new Map<string, Entry<T>>();
  constructor(private ttlMs: number) {}

  get(key: string): T | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return e.value;
  }

  set(key: string, value: T) {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  getOrSet(key: string, compute: () => T): T {
    const v = this.get(key);
    if (v !== null) return v;
    const next = compute();
    this.set(key, next);
    return next;
  }
}
