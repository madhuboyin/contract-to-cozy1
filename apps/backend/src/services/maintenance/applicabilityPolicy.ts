import type { FeatureDecision, PropertyContextSnapshot, PropertyFact } from '../../modules/propertyContext/domain/contracts';

export interface MaintenanceTemplatePolicyInput {
  id: string;
  title: string;
  serviceCategory: string | null;
  defaultFrequency: string;
}

interface MaintenanceContextTask {
  actionKey: string | null;
  status: string;
  lastCompletedDate: string | null;
  updatedAt: string;
}

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

const responsibilityByCategory: Record<string, string | undefined> = {
  HVAC: 'responsibility.hvac',
  PLUMBING: 'responsibility.plumbing',
  WATER_HEATER: 'responsibility.plumbing',
  ROOFING: 'responsibility.roof',
  GUTTERS: 'responsibility.roof',
  LANDSCAPING: 'responsibility.landscaping',
  LANDSCAPING_DRAINAGE: 'responsibility.landscaping',
  PEST_CONTROL: 'responsibility.pestControl',
  SECURITY_SAFETY: 'responsibility.commonSafety',
};

const cadenceCooldownDays: Record<string, number> = {
  MONTHLY: 25,
  QUARTERLY: 75,
  SEMI_ANNUALLY: 150,
  ANNUALLY: 300,
};

export function maintenanceTemplateActionKey(templateId: string): string {
  return `MAINTENANCE_TEMPLATE:${templateId}`;
}

function evaluateDedupe(
  facts: DecisionFacts,
  template: MaintenanceTemplatePolicyInput,
  now: Date,
): FeatureDecision | null {
  const tasks = facts.read<MaintenanceContextTask[]>('maintenance.tasks');
  if (!tasks) return null;
  const actionKey = maintenanceTemplateActionKey(template.id);
  const matching = tasks.filter((task) => task.actionKey === actionKey);
  if (matching.some((task) => ['PENDING', 'IN_PROGRESS', 'NEEDS_REVIEW'].includes(task.status))) {
    return facts.decision('NOT_APPLICABLE', ['ACTIVE_TASK_EXISTS']);
  }
  const cooldownDays = cadenceCooldownDays[template.defaultFrequency] ?? 0;
  const cutoff = now.getTime() - cooldownDays * 86_400_000;
  if (cooldownDays > 0 && matching.some((task) => {
    if (task.status !== 'COMPLETED') return false;
    return new Date(task.lastCompletedDate ?? task.updatedAt).getTime() >= cutoff;
  })) {
    return facts.decision('NOT_APPLICABLE', ['RECENTLY_COMPLETED']);
  }
  return null;
}

function evaluatePresence(
  facts: DecisionFacts,
  template: MaintenanceTemplatePolicyInput,
): FeatureDecision | null {
  const title = template.title.toUpperCase();
  if (/SMOKE.*DETECTOR/.test(title)) {
    const present = facts.read<boolean>('safety.hasSmokeDetectors');
    if (present === undefined) return facts.decision('UNKNOWN', ['SMOKE_DETECTOR_PRESENCE_UNKNOWN']);
    if (!present) return facts.decision('NOT_APPLICABLE', ['SMOKE_DETECTORS_NOT_PRESENT']);
  }
  if (/\b(CO|CARBON MONOXIDE).*DETECTOR/.test(title)) {
    const present = facts.read<boolean>('safety.hasCoDetectors');
    if (present === undefined) return facts.decision('UNKNOWN', ['CO_DETECTOR_PRESENCE_UNKNOWN']);
    if (!present) return facts.decision('NOT_APPLICABLE', ['CO_DETECTORS_NOT_PRESENT']);
  }
  if (/LAWN/.test(title)) {
    const present = facts.read<boolean>('exterior.hasLawn');
    if (present === undefined) return facts.decision('UNKNOWN', ['LAWN_PRESENCE_UNKNOWN']);
    if (!present) return facts.decision('NOT_APPLICABLE', ['LAWN_NOT_PRESENT']);
  }
  if (/TREE|SHRUB/.test(title)) {
    const present = facts.read<boolean>('exterior.hasTreesOrShrubs');
    if (present === undefined) return facts.decision('UNKNOWN', ['TREES_SHRUBS_PRESENCE_UNKNOWN']);
    if (!present) return facts.decision('NOT_APPLICABLE', ['TREES_SHRUBS_NOT_PRESENT']);
  }
  if (/IRRIGATION|SPRINKLER/.test(title)) {
    const present = facts.read<boolean>('exterior.hasIrrigation');
    if (present === undefined) return facts.decision('UNKNOWN', ['IRRIGATION_PRESENCE_UNKNOWN']);
    if (!present) return facts.decision('NOT_APPLICABLE', ['IRRIGATION_NOT_PRESENT']);
  }
  if (/GUTTER/.test(title)) {
    const installed = facts.read<string[]>('systems.installedItemTypes');
    if (installed?.includes('GUTTER')) return null;
    return facts.decision('UNKNOWN', ['GUTTER_PRESENCE_UNKNOWN']);
  }

  const requiredItem: Array<[RegExp, string]> = [
    [/DRYER/, 'DRYER'],
    [/DISHWASHER/, 'DISHWASHER'],
    [/REFRIGERATOR|FRIDGE/, 'REFRIGERATOR'],
    [/CHIMNEY|FIREPLACE/, 'CHIMNEY'],
  ];
  for (const [pattern, type] of requiredItem) {
    if (!pattern.test(title)) continue;
    const installed = facts.read<string[]>('systems.installedItemTypes');
    if (installed?.includes(type)) return null;
    return facts.decision('UNKNOWN', [`${type}_PRESENCE_UNKNOWN`]);
  }

  if (template.serviceCategory === 'HVAC') {
    const heating = facts.read<string>('systems.heatingType');
    const cooling = facts.read<string>('systems.coolingType');
    const installed = facts.read<string[]>('systems.installedItemTypes');
    if (!heating && !cooling && !installed?.some((type) => ['HVAC', 'FURNACE', 'AIR_CONDITIONER'].includes(type))) {
      return facts.decision('UNKNOWN', ['HVAC_PRESENCE_UNKNOWN']);
    }
  }
  if (template.serviceCategory === 'WATER_HEATER' || /WATER HEATER/.test(title)) {
    const type = facts.read<string>('systems.waterHeaterType');
    const installed = facts.read<string[]>('systems.installedItemTypes');
    if (!type && !installed?.includes('WATER_HEATER')) {
      return facts.decision('UNKNOWN', ['WATER_HEATER_PRESENCE_UNKNOWN']);
    }
  }
  return null;
}

function evaluateResponsibility(
  facts: DecisionFacts,
  template: MaintenanceTemplatePolicyInput,
): FeatureDecision | null {
  const key = template.serviceCategory ? responsibilityByCategory[template.serviceCategory] : undefined;
  if (!key) return null;
  const party = facts.read<string>(key);
  if (party === undefined || party === 'UNKNOWN') return facts.decision('UNKNOWN', ['RESPONSIBILITY_UNKNOWN']);
  if (party === 'ASSOCIATION') return facts.decision('NOT_APPLICABLE', ['ASSOCIATION_RESPONSIBLE']);
  if (party === 'LANDLORD') return facts.decision('NOT_APPLICABLE', ['LANDLORD_RESPONSIBLE']);
  return null;
}

export function evaluateMaintenanceTemplateApplicability(
  context: PropertyContextSnapshot,
  template: MaintenanceTemplatePolicyInput,
  now: Date = new Date(),
): FeatureDecision {
  const facts = new DecisionFacts(context);
  return evaluateDedupe(facts, template, now)
    ?? evaluatePresence(facts, template)
    ?? evaluateResponsibility(facts, template)
    ?? facts.decision('APPLICABLE', ['PROPERTY_CONTEXT_MATCH']);
}
