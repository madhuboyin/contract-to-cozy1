import type {
  FeatureDecision,
  PropertyContextSnapshot,
  PropertyFact,
} from '../modules/propertyContext/domain/contracts';

export class PropertyContextDecisionBuilder {
  readonly used = new Set<string>();
  readonly missing = new Set<string>();
  readonly conflicted = new Set<string>();
  readonly validUntil: string[] = [];

  constructor(private readonly context: PropertyContextSnapshot) {}

  read<T>(key: string): T | undefined {
    const fact = this.context.facts[key] as PropertyFact<T> | undefined;
    if (!fact || fact.state === 'UNKNOWN' || fact.state === 'STALE') {
      this.missing.add(key);
      return undefined;
    }
    if (fact.state === 'CONFLICTED') {
      this.conflicted.add(key);
      return undefined;
    }
    this.used.add(key);
    if (fact.validUntil) this.validUntil.push(fact.validUntil);
    return fact.value === null ? undefined : fact.value;
  }

  decision(status: FeatureDecision['status'], reasonCodes: string[]): FeatureDecision {
    return {
      status,
      reasonCodes,
      usedFactKeys: [...this.used],
      missingFactKeys: [...this.missing],
      conflictedFactKeys: [...this.conflicted],
      validUntil: this.validUntil.sort()[0] ?? null,
    };
  }

  unknown(reasonCode: string): FeatureDecision {
    return this.decision('UNKNOWN', [this.conflicted.size ? 'CONTEXT_CONFLICT' : reasonCode]);
  }
}

export function knownContextValue<T>(context: PropertyContextSnapshot, key: string): T | undefined {
  const fact = context.facts[key] as PropertyFact<T> | undefined;
  return fact?.state === 'KNOWN' && fact.value !== null ? fact.value : undefined;
}
