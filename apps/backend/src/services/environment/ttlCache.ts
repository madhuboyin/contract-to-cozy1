// apps/backend/src/services/environment/ttlCache.ts
//
// Generic in-memory TTL cache, extracted from the Map<string, CacheEntry>
// pattern used by weather.service.ts. Each Environment-report sub-service
// gets its own instance (with its own TTL) rather than hand-rolling this
// again — weather.service.ts itself is left untouched.

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}
