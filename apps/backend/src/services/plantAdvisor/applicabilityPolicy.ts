import type { FeatureDecision, PropertyContextSnapshot, PropertyFact } from '../../modules/propertyContext/domain/contracts';

export type PlantAdvisorTarget = 'FEATURE' | 'INDOOR' | 'OUTDOOR';

class DecisionFacts {
  readonly used = new Set<string>();
  readonly missing = new Set<string>();
  readonly conflicted = new Set<string>();

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
    return fact.value === null ? undefined : fact.value;
  }

  decision(status: FeatureDecision['status'], reasonCodes: string[]): FeatureDecision {
    return {
      status,
      reasonCodes,
      usedFactKeys: [...this.used],
      missingFactKeys: [...this.missing],
      conflictedFactKeys: [...this.conflicted],
      validUntil: null,
    };
  }
}

export function evaluatePlantAdvisorApplicability(
  context: PropertyContextSnapshot,
  target: PlantAdvisorTarget,
): FeatureDecision {
  const facts = new DecisionFacts(context);
  if (target === 'FEATURE') return facts.decision('APPLICABLE', ['INDOOR_PLANT_ADVISOR_AVAILABLE']);
  if (target === 'INDOOR') return facts.decision('APPLICABLE', ['INDOOR_PLANT_ADVISOR_AVAILABLE']);

  const hasPrivateOutdoorSpace = facts.read<boolean>('exterior.hasPrivateOutdoorSpace');
  if (hasPrivateOutdoorSpace === undefined) {
    return facts.decision('UNKNOWN', [facts.conflicted.size ? 'OUTDOOR_SPACE_CONFLICT' : 'OUTDOOR_SPACE_UNKNOWN']);
  }
  if (!hasPrivateOutdoorSpace) return facts.decision('NOT_APPLICABLE', ['NO_PRIVATE_OUTDOOR_SPACE']);

  const responsibility = facts.read<string>('responsibility.landscaping');
  if (responsibility === undefined || responsibility === 'UNKNOWN') {
    return facts.decision('UNKNOWN', [facts.conflicted.size ? 'LANDSCAPING_RESPONSIBILITY_CONFLICT' : 'LANDSCAPING_RESPONSIBILITY_UNKNOWN']);
  }
  if (responsibility === 'ASSOCIATION') return facts.decision('NOT_APPLICABLE', ['ASSOCIATION_RESPONSIBLE']);
  if (responsibility === 'LANDLORD') return facts.decision('NOT_APPLICABLE', ['LANDLORD_RESPONSIBLE']);
  return facts.decision('APPLICABLE', ['PRIVATE_OUTDOOR_SPACE_CONFIRMED']);
}
