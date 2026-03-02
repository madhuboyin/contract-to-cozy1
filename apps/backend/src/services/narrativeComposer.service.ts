import { NarrativePlan, NarrativePlanBlock } from './narrativeRules.service';
import { InsightSnapshotData } from './propertyInsight.service';

export interface NarrativePayloadBlock {
  id: string;
  type: string;
  title?: string;
  body?: string;
  bullets?: string[];
  data?: Record<string, unknown>;
  ctas?: Array<{ key: string; label: string; action: string }>;
}

export interface NarrativePayload {
  metadata: {
    runVersion: string;
    confidenceScore: number;
    propertyId: string;
    computedAt: string;
    heroVariant: string;
  };
  blocks: NarrativePayloadBlock[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizedPropertyType(propertyType: string | null): string {
  return String(propertyType || '').toUpperCase();
}

function moneyRange(snapshot: InsightSnapshotData): { min: number; max: number } {
  const sizeBase = {
    COMPACT: { min: 4000, max: 12000 },
    STANDARD: { min: 8000, max: 22000 },
    LARGE: { min: 15000, max: 42000 },
    UNKNOWN: { min: 6000, max: 18000 },
  } as const;

  const ageMultiplier = {
    EARLY: 0.75,
    MID: 1,
    HIGH_MAINT: 1.25,
    LEGACY: 1.4,
    UNKNOWN: 1,
  } as const;

  const base = sizeBase[snapshot.derived.sizeBand];
  const multiplier = ageMultiplier[snapshot.derived.ageBand];

  let min = Math.round((base.min * multiplier) / 100) * 100;
  let max = Math.round((base.max * multiplier) / 100) * 100;

  if (normalizedPropertyType(snapshot.inputs.propertyType).includes('CONDO')) {
    min = Math.round((min * 0.7) / 100) * 100;
    max = Math.round((max * 0.7) / 100) * 100;
  }

  return { min, max };
}

function heroBlock(planBlock: NarrativePlanBlock, snapshot: InsightSnapshotData): NarrativePayloadBlock {
  const ageText = snapshot.derived.propertyAgeYears != null
    ? `about ${snapshot.derived.propertyAgeYears} years old`
    : 'based on the details entered so far';

  switch (planBlock.variant) {
    case 'HIGH_MAINT_DECADE':
      return {
        id: planBlock.id,
        type: planBlock.type,
        title: 'Your home is entering a heavier maintenance cycle',
        body: `At ${ageText}, key systems often need tighter planning.`,
      };
    case 'OPTIMIZATION_PHASE':
      return {
        id: planBlock.id,
        type: planBlock.type,
        title: 'You are in a strong window to stay ahead',
        body: `This home is ${ageText}. Early planning keeps costs predictable.`,
      };
    case 'ACCELERATED_RISK_WINDOW':
      return {
        id: planBlock.id,
        type: planBlock.type,
        title: 'This home is in an accelerated risk window',
        body: `At ${ageText}, small issues can compound faster without a plan.`,
      };
    default:
      return {
        id: planBlock.id,
        type: planBlock.type,
        title: 'A focused snapshot of your home is ready',
        body: 'Based on the details you entered so far, here is what to prioritize next.',
      };
  }
}

function whyItMattersBlock(planBlock: NarrativePlanBlock, snapshot: InsightSnapshotData): NarrativePayloadBlock {
  const angleCopy: Record<string, string> = {
    MAINTENANCE_CLUSTERING: 'Several systems may age into maintenance at the same time.',
    ACCELERATED_CAPITAL_PHASE: 'Older homes often need larger capital decisions sooner.',
    SCALE_AMPLIFIES_COST: 'Larger square footage increases repair and replacement exposure.',
    IMPROVE_ACCURACY: 'Adding one missing detail will tighten your projections.',
    GENERAL_PLANNING: 'A small routine now can prevent larger surprises later.',
  };

  const bullets = snapshot.derived.topAngles.slice(0, 2).map((angle) => angleCopy[angle]);

  return {
    id: planBlock.id,
    type: planBlock.type,
    title: 'Why this matters now',
    bullets,
  };
}

function moneyAtRiskBlock(planBlock: NarrativePlanBlock, snapshot: InsightSnapshotData): NarrativePayloadBlock {
  const range = moneyRange(snapshot);

  const variantBody: Record<string, string> = {
    LARGE_HOME: 'Larger homes can absorb higher multi-system swings over short periods.',
    STANDARD_HOME: 'Typical system replacement cycles can still cluster over a few years.',
    CONDO_SHARED_RISK: 'Shared building systems help, but in-unit and shared assessments still matter.',
  };

  return {
    id: planBlock.id,
    type: planBlock.type,
    title: `${formatCurrency(range.min)} - ${formatCurrency(range.max)} potential 3-year exposure`,
    body: variantBody[planBlock.variant] || variantBody.STANDARD_HOME,
    data: {
      min: range.min,
      max: range.max,
      unit: 'USD',
      horizonYears: 3,
    },
  };
}

function next90DaysBlock(planBlock: NarrativePlanBlock): NarrativePayloadBlock {
  const actions = Array.isArray(planBlock.data?.actions)
    ? (planBlock.data?.actions as string[])
    : [];

  return {
    id: planBlock.id,
    type: planBlock.type,
    title: 'Next 90 days',
    bullets: actions,
  };
}

function confidenceNudgeBlock(planBlock: NarrativePlanBlock): NarrativePayloadBlock {
  const fieldKey = String(planBlock.data?.fieldKey || 'address');

  const nudgeMap: Record<string, { title: string; body: string; cta: string }> = {
    yearBuilt: {
      title: 'Add your year built for better timing estimates',
      body: 'This takes a moment and improves age-based maintenance guidance.',
      cta: 'Add year built',
    },
    propertySize: {
      title: 'Add square footage to tighten cost ranges',
      body: 'Home size is one of the strongest inputs for cost spread.',
      cta: 'Add square footage',
    },
    propertyType: {
      title: 'Confirm property type for sharper assumptions',
      body: 'Type helps calibrate shared vs in-unit exposure and actions.',
      cta: 'Add property type',
    },
    address: {
      title: 'Add one more detail to improve precision',
      body: 'A bit more information helps tailor this plan to your home.',
      cta: 'Update details',
    },
  };

  const copy = nudgeMap[fieldKey] || nudgeMap.address;

  return {
    id: planBlock.id,
    type: planBlock.type,
    title: copy.title,
    body: copy.body,
    data: {
      fieldKey,
    },
    ctas: [
      {
        key: 'nudge',
        label: copy.cta,
        action: 'NUDGE',
      },
    ],
  };
}

function ctaBlock(planBlock: NarrativePlanBlock): NarrativePayloadBlock {
  const primaryLabel = String(planBlock.data?.primary || "See what's next for your home");
  const secondaryLabel = String(planBlock.data?.secondary || 'Skip for now');

  return {
    id: planBlock.id,
    type: planBlock.type,
    ctas: [
      {
        key: 'primary',
        label: primaryLabel,
        action: 'COMPLETE',
      },
      {
        key: 'secondary',
        label: secondaryLabel,
        action: 'DISMISS',
      },
    ],
  };
}

function composeBlock(planBlock: NarrativePlanBlock, snapshot: InsightSnapshotData): NarrativePayloadBlock {
  switch (planBlock.type) {
    case 'HERO':
      return heroBlock(planBlock, snapshot);
    case 'WHY_IT_MATTERS':
      return whyItMattersBlock(planBlock, snapshot);
    case 'MONEY_AT_RISK':
      return moneyAtRiskBlock(planBlock, snapshot);
    case 'NEXT_90_DAYS':
      return next90DaysBlock(planBlock);
    case 'CONFIDENCE_NUDGE':
      return confidenceNudgeBlock(planBlock);
    case 'CTA':
    default:
      return ctaBlock(planBlock);
  }
}

export function composeNarrativePayload(args: {
  plan: NarrativePlan;
  snapshot: InsightSnapshotData;
}): NarrativePayload {
  const blocks = args.plan.blocks.map((block) => composeBlock(block, args.snapshot));

  return {
    metadata: {
      runVersion: args.plan.version,
      confidenceScore: args.snapshot.derived.confidenceScore,
      propertyId: args.snapshot.propertyId,
      computedAt: args.snapshot.computedAt,
      heroVariant: args.plan.heroVariant,
    },
    blocks,
  };
}
