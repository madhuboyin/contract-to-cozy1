import { InsightSnapshotData } from './propertyInsight.service';

export type NarrativeBlockType =
  | 'HERO'
  | 'WHY_IT_MATTERS'
  | 'MONEY_AT_RISK'
  | 'NEXT_90_DAYS'
  | 'CONFIDENCE_NUDGE'
  | 'CTA';

export type NarrativeVariantKey =
  | 'HIGH_MAINT_DECADE'
  | 'OPTIMIZATION_PHASE'
  | 'ACCELERATED_RISK_WINDOW'
  | 'GENERAL_WELCOME'
  | 'LARGE_HOME'
  | 'STANDARD_HOME'
  | 'CONDO_SHARED_RISK'
  | 'YEAR_BUILT_NUDGE'
  | 'SQFT_NUDGE'
  | 'PROPERTY_TYPE_NUDGE'
  | 'GENERAL_NUDGE'
  | 'DEFAULT';

export interface NarrativePlanBlock {
  id: string;
  type: NarrativeBlockType;
  variant: NarrativeVariantKey;
  data?: Record<string, unknown>;
}

export interface NarrativePlan {
  version: 'v1';
  heroVariant: NarrativeVariantKey;
  blocks: NarrativePlanBlock[];
  generatedAt: string;
}

function isCondo(propertyType: string | null): boolean {
  return String(propertyType || '').toUpperCase().includes('CONDO');
}

function chooseHeroVariant(snapshot: InsightSnapshotData): NarrativeVariantKey {
  switch (snapshot.derived.ageBand) {
    case 'HIGH_MAINT':
      return 'HIGH_MAINT_DECADE';
    case 'EARLY':
      return 'OPTIMIZATION_PHASE';
    case 'LEGACY':
      return 'ACCELERATED_RISK_WINDOW';
    default:
      return 'GENERAL_WELCOME';
  }
}

function chooseMoneyVariant(snapshot: InsightSnapshotData): NarrativeVariantKey {
  if (isCondo(snapshot.inputs.propertyType)) return 'CONDO_SHARED_RISK';
  if (snapshot.derived.sizeBand === 'LARGE') return 'LARGE_HOME';
  return 'STANDARD_HOME';
}

function chooseNudgeVariant(snapshot: InsightSnapshotData): NarrativePlanBlock | null {
  if (snapshot.derived.confidenceScore >= 70) return null;

  const missing = snapshot.derived.missingFieldKeys;

  if (missing.includes('yearBuilt')) {
    return {
      id: 'confidence-nudge',
      type: 'CONFIDENCE_NUDGE',
      variant: 'YEAR_BUILT_NUDGE',
      data: { fieldKey: 'yearBuilt' },
    };
  }

  if (missing.includes('propertySize')) {
    return {
      id: 'confidence-nudge',
      type: 'CONFIDENCE_NUDGE',
      variant: 'SQFT_NUDGE',
      data: { fieldKey: 'propertySize' },
    };
  }

  if (missing.includes('propertyType')) {
    return {
      id: 'confidence-nudge',
      type: 'CONFIDENCE_NUDGE',
      variant: 'PROPERTY_TYPE_NUDGE',
      data: { fieldKey: 'propertyType' },
    };
  }

  return {
    id: 'confidence-nudge',
    type: 'CONFIDENCE_NUDGE',
    variant: 'GENERAL_NUDGE',
    data: { fieldKey: 'address' },
  };
}

function buildNext90DaysData(snapshot: InsightSnapshotData): Record<string, unknown> {
  const actions: string[] = [];

  if (snapshot.derived.ageBand === 'LEGACY' || snapshot.derived.ageBand === 'HIGH_MAINT') {
    actions.push('Review roof, HVAC, and water heater maintenance records.');
    actions.push('Schedule one whole-home preventative check.');
  } else {
    actions.push('Set seasonal maintenance reminders for the next quarter.');
    actions.push('Confirm warranty and insurance expiration dates.');
  }

  if (snapshot.derived.sizeBand === 'LARGE') {
    actions.push('Prioritize high-use systems to reduce surprise repair costs.');
  } else {
    actions.push('Capture 1-2 core home system details to improve planning accuracy.');
  }

  return { actions: actions.slice(0, 3) };
}

export function buildNarrativePlan(snapshot: InsightSnapshotData): NarrativePlan {
  const heroVariant = chooseHeroVariant(snapshot);
  const moneyVariant = chooseMoneyVariant(snapshot);
  const confidenceNudge = chooseNudgeVariant(snapshot);

  const blocks: NarrativePlanBlock[] = [
    {
      id: 'hero',
      type: 'HERO',
      variant: heroVariant,
      data: { regionKey: snapshot.derived.regionKey },
    },
    {
      id: 'why-it-matters',
      type: 'WHY_IT_MATTERS',
      variant: 'DEFAULT',
      data: {
        topAngles: snapshot.derived.topAngles,
      },
    },
    {
      id: 'money-at-risk',
      type: 'MONEY_AT_RISK',
      variant: moneyVariant,
    },
    {
      id: 'next-90-days',
      type: 'NEXT_90_DAYS',
      variant: 'DEFAULT',
      data: buildNext90DaysData(snapshot),
    },
  ];

  if (confidenceNudge) {
    blocks.push(confidenceNudge);
  }

  blocks.push({
    id: 'cta',
    type: 'CTA',
    variant: 'DEFAULT',
    data: {
      primary: 'See what\'s next for your home',
      secondary: 'Skip for now',
    },
  });

  return {
    version: 'v1',
    heroVariant,
    blocks,
    generatedAt: new Date().toISOString(),
  };
}
