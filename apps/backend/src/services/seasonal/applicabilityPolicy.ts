import type {
  FeatureDecision,
  PropertyContextSnapshot,
  PropertyFact,
} from '../../modules/propertyContext/domain/contracts';

export interface SeasonalTemplatePolicyInput {
  taskKey: string;
  priority: string;
  requiredAssetCheck: string | null;
  requiredAssetType: string | null;
}

interface MaintenanceContextTask {
  seasonalTaskKey: string | null;
  status: string;
  lastCompletedDate: string | null;
  updatedAt: string;
}

type ResponsibilityFactKey =
  | 'responsibility.roof'
  | 'responsibility.buildingExterior'
  | 'responsibility.landscaping'
  | 'responsibility.treesShrubs'
  | 'responsibility.drivewayWalkways'
  | 'responsibility.deckPatioBalcony'
  | 'responsibility.plumbing'
  | 'responsibility.hvac'
  | 'responsibility.snowIce'
  | 'responsibility.pestControl'
  | 'responsibility.sharedSystems';

const responsibilityByAssetCheck: Record<string, ResponsibilityFactKey | undefined> = {
  has_ac: 'responsibility.hvac',
  has_deck: 'responsibility.deckPatioBalcony',
  has_driveway: 'responsibility.drivewayWalkways',
  has_fireplace: 'responsibility.buildingExterior',
  has_lawn: 'responsibility.landscaping',
  has_sprinkler_system: 'responsibility.landscaping',
};

const responsibilityByAssetType: Record<string, ResponsibilityFactKey | undefined> = {
  CHIMNEY: 'responsibility.buildingExterior',
  FURNACE: 'responsibility.hvac',
  HVAC: 'responsibility.hvac',
  IRRIGATION: 'responsibility.landscaping',
  ROOF: 'responsibility.roof',
  WATER_HEATER: 'responsibility.plumbing',
};

function responsibilityForTask(template: SeasonalTemplatePolicyInput): ResponsibilityFactKey | undefined {
  const explicit = template.requiredAssetCheck
    ? responsibilityByAssetCheck[template.requiredAssetCheck]
    : template.requiredAssetType
      ? responsibilityByAssetType[template.requiredAssetType]
      : undefined;
  if (explicit) return explicit;
  if (/GUTTER|ROOF|ICE_DAM/.test(template.taskKey)) return 'responsibility.roof';
  if (/SIDING|EXTERIOR_PAINT/.test(template.taskKey)) return 'responsibility.buildingExterior';
  if (/TREE/.test(template.taskKey)) return 'responsibility.treesShrubs';
  if (/PEST/.test(template.taskKey)) return 'responsibility.pestControl';
  if (/SNOW/.test(template.taskKey)) return 'responsibility.snowIce';
  if (/FURNACE|HVAC|_AC_/.test(template.taskKey)) return 'responsibility.hvac';
  if (/PIPE|SINK|WATER_HEATER|OUTDOOR_FAUCET/.test(template.taskKey)) return 'responsibility.plumbing';
  return undefined;
}

class DecisionFacts {
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
}

function evaluateRecentOrActiveTask(
  facts: DecisionFacts,
  template: SeasonalTemplatePolicyInput,
  now: Date,
): FeatureDecision | null {
  const tasks = facts.read<MaintenanceContextTask[]>('maintenance.tasks');
  if (!tasks) return null;
  const matching = tasks.filter((task) => task.seasonalTaskKey === template.taskKey);
  if (matching.some((task) => ['PENDING', 'IN_PROGRESS', 'NEEDS_REVIEW'].includes(task.status))) {
    return facts.decision('NOT_APPLICABLE', ['ACTIVE_TASK_EXISTS']);
  }
  const recentCutoff = now.getTime() - 270 * 24 * 60 * 60 * 1000;
  const recentlyCompleted = matching.some((task) => {
    if (task.status !== 'COMPLETED') return false;
    const completedAt = task.lastCompletedDate ?? task.updatedAt;
    return new Date(completedAt).getTime() >= recentCutoff;
  });
  return recentlyCompleted
    ? facts.decision('NOT_APPLICABLE', ['RECENTLY_COMPLETED'])
    : null;
}

function evaluateAssetCheck(
  facts: DecisionFacts,
  template: SeasonalTemplatePolicyInput,
): FeatureDecision | null {
  switch (template.requiredAssetCheck) {
    case null:
      return null;
    case 'has_ac': {
      const value = facts.read<boolean>('systems.hasCooling');
      if (value === undefined) return facts.decision('UNKNOWN', ['COOLING_PRESENCE_UNKNOWN']);
      return value ? null : facts.decision('NOT_APPLICABLE', ['COOLING_NOT_PRESENT']);
    }
    case 'has_lawn': {
      const value = facts.read<boolean>('exterior.hasLawn');
      if (value === undefined) return facts.decision('UNKNOWN', ['LAWN_PRESENCE_UNKNOWN']);
      return value ? null : facts.decision('NOT_APPLICABLE', ['LAWN_NOT_PRESENT']);
    }
    case 'has_pool': {
      const value = facts.read<boolean>('exterior.hasPoolOrSpa');
      if (value === undefined) return facts.decision('UNKNOWN', ['POOL_SPA_PRESENCE_UNKNOWN']);
      return value ? null : facts.decision('NOT_APPLICABLE', ['POOL_SPA_NOT_PRESENT']);
    }
    case 'has_driveway': {
      const value = facts.read<boolean>('exterior.hasDriveway');
      if (value === undefined) return facts.decision('UNKNOWN', ['DRIVEWAY_PRESENCE_UNKNOWN']);
      return value ? null : facts.decision('NOT_APPLICABLE', ['DRIVEWAY_NOT_PRESENT']);
    }
    case 'has_sprinkler_system': {
      const value = facts.read<boolean>('exterior.hasIrrigation');
      if (value === undefined) return facts.decision('UNKNOWN', ['IRRIGATION_PRESENCE_UNKNOWN']);
      return value ? null : facts.decision('NOT_APPLICABLE', ['IRRIGATION_NOT_PRESENT']);
    }
    case 'has_deck': {
      const types = facts.read<string[]>('exterior.outdoorSpaceTypes');
      if (types?.includes('DECK')) return null;
      const hasPrivateSpace = facts.read<boolean>('exterior.hasPrivateOutdoorSpace');
      if (hasPrivateSpace === false || (hasPrivateSpace === true && types)) {
        return facts.decision('NOT_APPLICABLE', ['DECK_NOT_PRESENT']);
      }
      return facts.decision('UNKNOWN', ['DECK_PRESENCE_UNKNOWN']);
    }
    case 'has_fireplace': {
      const installed = facts.read<string[]>('systems.installedItemTypes');
      if (installed?.includes('CHIMNEY')) return null;
      return facts.decision('UNKNOWN', ['FIREPLACE_PRESENCE_UNKNOWN']);
    }
    case 'is_coastal': {
      const value = facts.read<boolean>('location.isCoastal');
      if (value === undefined) return facts.decision('UNKNOWN', ['COASTAL_EXPOSURE_UNKNOWN']);
      return value ? null : facts.decision('NOT_APPLICABLE', ['NOT_COASTAL']);
    }
    default:
      return facts.decision('UNKNOWN', ['UNSUPPORTED_ASSET_CHECK']);
  }
}

function evaluateRequiredAssetType(
  facts: DecisionFacts,
  template: SeasonalTemplatePolicyInput,
): FeatureDecision | null {
  if (!template.requiredAssetType || template.requiredAssetCheck) return null;
  if (template.requiredAssetType === 'ROOF') {
    const roofType = facts.read<string>('structure.roofType');
    return roofType === undefined ? facts.decision('UNKNOWN', ['ROOF_PRESENCE_UNKNOWN']) : null;
  }
  const installed = facts.read<string[]>('systems.installedItemTypes');
  if (installed?.includes(template.requiredAssetType)) return null;
  return facts.decision('UNKNOWN', [`${template.requiredAssetType}_PRESENCE_UNKNOWN`]);
}

function evaluateTaskSpecificPresence(
  facts: DecisionFacts,
  template: SeasonalTemplatePolicyInput,
): FeatureDecision | null {
  if (template.requiredAssetCheck || template.requiredAssetType) return null;
  if (/SMOKE_CO_DETECTOR_TEST/.test(template.taskKey)) {
    const smoke = facts.read<boolean>('safety.hasSmokeDetectors');
    const co = facts.read<boolean>('safety.hasCoDetectors');
    if (smoke === true || co === true) return null;
    if (smoke === false && co === false) return facts.decision('NOT_APPLICABLE', ['DETECTORS_NOT_PRESENT']);
    return facts.decision('UNKNOWN', ['DETECTOR_PRESENCE_UNKNOWN']);
  }
  if (/CO_DETECTOR/.test(template.taskKey)) {
    const co = facts.read<boolean>('safety.hasCoDetectors');
    if (co === undefined) return facts.decision('UNKNOWN', ['CO_DETECTOR_PRESENCE_UNKNOWN']);
    return co ? null : facts.decision('NOT_APPLICABLE', ['CO_DETECTOR_NOT_PRESENT']);
  }
  if (/OUTDOOR_FAUCET/.test(template.taskKey)) {
    const faucet = facts.read<boolean>('exterior.hasOutdoorFaucets');
    if (faucet === undefined) return facts.decision('UNKNOWN', ['OUTDOOR_FAUCET_PRESENCE_UNKNOWN']);
    return faucet ? null : facts.decision('NOT_APPLICABLE', ['OUTDOOR_FAUCET_NOT_PRESENT']);
  }
  if (/TREE/.test(template.taskKey)) {
    const trees = facts.read<boolean>('exterior.hasTreesOrShrubs');
    if (trees === undefined) return facts.decision('UNKNOWN', ['TREES_SHRUBS_PRESENCE_UNKNOWN']);
    return trees ? null : facts.decision('NOT_APPLICABLE', ['TREES_SHRUBS_NOT_PRESENT']);
  }
  return null;
}

function evaluateResponsibility(
  facts: DecisionFacts,
  template: SeasonalTemplatePolicyInput,
): FeatureDecision | null {
  const key = responsibilityForTask(template);
  if (!key) return null;
  const party = facts.read<string>(key);
  if (party === undefined || party === 'UNKNOWN') {
    return facts.decision('UNKNOWN', ['RESPONSIBILITY_UNKNOWN']);
  }
  if (party === 'ASSOCIATION') return facts.decision('NOT_APPLICABLE', ['ASSOCIATION_RESPONSIBLE']);
  if (party === 'LANDLORD') return facts.decision('NOT_APPLICABLE', ['LANDLORD_RESPONSIBLE']);
  return null;
}

export function evaluateSeasonalTemplateApplicability(
  context: PropertyContextSnapshot,
  template: SeasonalTemplatePolicyInput,
  now: Date = new Date(),
): FeatureDecision {
  const facts = new DecisionFacts(context);
  const existingTaskDecision = evaluateRecentOrActiveTask(facts, template, now);
  if (existingTaskDecision) return existingTaskDecision;
  const presenceDecision = evaluateAssetCheck(facts, template)
    ?? evaluateRequiredAssetType(facts, template)
    ?? evaluateTaskSpecificPresence(facts, template);
  if (presenceDecision) return presenceDecision;
  const responsibilityDecision = evaluateResponsibility(facts, template);
  if (responsibilityDecision) return responsibilityDecision;
  return facts.decision('APPLICABLE', ['SEASONAL_TASK_APPLICABLE']);
}
