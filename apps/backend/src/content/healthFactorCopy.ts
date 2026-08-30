// Canonical homeowner copy for Property Health Score factors.
//
// One source of truth for the verbiage shown on health-factor Home Action
// cards (the Home "Plan ahead" feed) and, in Phase 2, the
// focus/health/[factor] page. See
// docs/product/HOME_ACTION_HEALTH_FACTOR_COPY_FRD.md.
//
// The canonical `factor` strings are the exact values emitted by
// calculateHealthScore() in utils/propertyScore.util.ts — they are matched
// against Booking.insightFactor for suppression, so they must not drift.
// Only the *display* name is remapped (displayHealthFactorName).

export const HEALTH_FACTOR_KEYS = [
  'Property Age (Year Built)',
  'Structure Factor',
  'Systems Factor',
  'Usage/Wear Factor',
  'Size Factor',
  'HVAC Age',
  'Water Heater Age',
  'Roof Age',
  'Safety',
  'Exterior',
  'Documents',
  'Appliances',
] as const;
export type HealthFactorKey = (typeof HEALTH_FACTOR_KEYS)[number];

export const HEALTH_FACTOR_STATUS_KEYS = [
  'Excellent',
  'Good',
  'Modern',
  'Optimal',
  'Complete',
  'Low Density',
  'Average',
  'Standard',
  'Aging',
  'High Density',
  'Partial',
  'Incomplete',
  'Action Pending',
  'Missing Data',
  'Needs Review',
  'Needs Inspection',
  'Needs Attention',
  'Needs Warranty',
] as const;
export type HealthFactorStatusKey = (typeof HEALTH_FACTOR_STATUS_KEYS)[number];

/**
 * Statuses that can be promoted into a Home Action card
 * (homeActionSourcePromotion.service.ts). Kept here so the emitter and the
 * copy live together. Canonical title-case — see normalizeHealthStatus.
 */
export const CARD_PRODUCING_HEALTH_STATUSES: readonly HealthFactorStatusKey[] = [
  'Needs Review',
  'Needs Inspection',
  'Needs Attention',
  'Missing Data',
  'Needs Warranty',
];

export type HealthFactorMode = 'MAINTENANCE' | 'DATA_GAP' | 'WARRANTY_GAP';

export interface HealthFactorCopyContext {
  propertyId: string;
  /** Property.yearBuilt, when this is an age/structure factor. */
  yearBuilt?: number | null;
  /** hvacInstallYear / waterHeaterInstallYear / roofReplacementYear, when relevant. */
  installYear?: number | null;
  /** Homeowner-facing appliance name for the dynamic "<Asset> aging" factor. */
  assetName?: string | null;
  /** ISO string — the evaluation time, for any date-derived fact. */
  observedAt: string;
}

export interface HealthFactorCopy {
  mode: HealthFactorMode;
  /** Task-phrased card headline. Imperative. Never matches ABSTRACT_HOME_HEADLINE. */
  headline: string;
  /** One-sentence plain-language situation. Card summary. */
  summary: string;
  /** Longer "why you're seeing this" for the expanded detail. */
  whyItMatters: string;
  /** Primary CTA label. */
  ctaLabel: string;
  /** Homeowner-friendly rendering of the raw status. */
  statusLabel: string;
  /** Optional extra key facts (typical lifespan, cost range, effort). */
  extraFacts?: (ctx: HealthFactorCopyContext) => Array<{ label: string; value: string }>;
}

// ── Display helpers ──────────────────────────────────────────────────────────

const DISPLAY_FACTOR_NAMES: Record<string, string> = {
  'Age Factor': 'Property Age (Year Built)',
  'Property Age (Year Built)': 'Property Age (Year Built)',
  'Structure Factor': 'Home Structure',
  'Systems Factor': 'Major Systems Health',
  'Usage/Wear Factor': 'Occupancy & Wear',
  'Size Factor': 'Home Size',
  'Safety': 'Home Safety Equipment',
  'Exterior': 'Exterior Drainage',
  'Documents': 'Property Documents',
  'Appliances': 'Appliance Records',
};

export function displayHealthFactorName(factor: string | undefined | null): string {
  const value = String(factor ?? '').trim();
  if (!value) return 'Home health item';
  if (DISPLAY_FACTOR_NAMES[value]) return DISPLAY_FACTOR_NAMES[value];
  // Dynamic "<Asset> aging" factor.
  const aging = value.match(/^(.+?)\s+aging$/i);
  if (aging) return `${aging[1]} (aging)`;
  return value;
}

const FRIENDLY_STATUS: Record<string, string> = {
  Modern: 'Up to date',
  Excellent: 'Excellent',
  Good: 'Good',
  Optimal: 'Well matched',
  Complete: 'Complete',
  'Low Density': 'Light usage',
  'High Density': 'Heavy usage',
  Average: 'Average',
  Standard: 'Standard',
  Aging: 'Getting older',
  Partial: 'Partly recorded',
  Incomplete: 'Incomplete',
  'Action Pending': 'Work in progress',
  'Missing Data': 'Not recorded yet',
  'Needs Review': 'Worth a look',
  'Needs Inspection': 'Inspection suggested',
  'Needs Attention': 'Worth addressing',
  'Needs Warranty': 'No coverage on file',
};

export function friendlyHealthStatus(status: string | undefined | null): string {
  const value = String(status ?? '').trim();
  return FRIENDLY_STATUS[value] ?? normalizeHealthStatus(value);
}

/**
 * Trim + canonicalize casing for the known `Needs *` statuses. The score util
 * has historically emitted `'Needs Attention'` while downstream filters used
 * `'Needs attention'`; this collapses that drift so a card is never dropped
 * on a casing mismatch.
 */
export function normalizeHealthStatus(status: string | undefined | null): string {
  const value = String(status ?? '').trim();
  const lower = value.toLowerCase();
  const canonical: Record<string, HealthFactorStatusKey> = {
    'needs review': 'Needs Review',
    'needs inspection': 'Needs Inspection',
    'needs attention': 'Needs Attention',
    'missing data': 'Missing Data',
    'needs warranty': 'Needs Warranty',
    'action pending': 'Action Pending',
  };
  return canonical[lower] ?? value;
}

// ── Copy map ─────────────────────────────────────────────────────────────────

const year = (n: number | null | undefined): string | null =>
  typeof n === 'number' && Number.isFinite(n) ? String(n) : null;

const PLAN_AHEAD_FACT = { label: 'Timing', value: 'No deadline — plan ahead' };

export const HEALTH_FACTOR_COPY = {
  'Property Age (Year Built)': {
    'Needs Review': {
      mode: 'MAINTENANCE',
      headline: 'Book a general home inspection for age-related items',
      summary: 'Older homes accumulate small deferred-maintenance items — a periodic walkthrough keeps you ahead of them.',
      whyItMatters:
        "Based on the year your home was built, it's old enough that age-related wear (plumbing, wiring, seals, grading) is worth a professional look. Catching these early is far cheaper than reacting to a failure.",
      ctaLabel: 'See age-related checklist',
      statusLabel: 'Worth a look',
      extraFacts: (ctx) => [
        ...(year(ctx.yearBuilt) ? [{ label: 'Year built', value: year(ctx.yearBuilt)! }] : []),
        { label: 'Typical inspection', value: '$300–500' },
        PLAN_AHEAD_FACT,
      ],
    },
    'Missing Data': {
      mode: 'DATA_GAP',
      headline: "Add your home's year built",
      summary: 'We use the year built to tailor age-based maintenance guidance and your health score.',
      whyItMatters:
        "Year built drives the age-related portion of your Property Health Score and the maintenance timeline we suggest. It takes about a minute to add.",
      ctaLabel: 'Add year built',
      statusLabel: 'Not recorded yet',
      extraFacts: () => [
        { label: "What's missing", value: 'Year built' },
        { label: 'Why it helps', value: 'Sharpens age-based maintenance and score' },
        { label: 'Effort', value: '~1 minute' },
      ],
    },
  },

  'Structure Factor': {
    'Missing Data': {
      mode: 'DATA_GAP',
      headline: 'Add your home type and roof type',
      summary: 'Structural basics let us judge weather exposure and long-term upkeep.',
      whyItMatters:
        'Knowing whether the home is detached, attached, or a unit — and what the roof is made of — lets us tailor exterior and weather-related guidance.',
      ctaLabel: 'Complete home details',
      statusLabel: 'Not recorded yet',
      extraFacts: () => [
        { label: "What's missing", value: 'Home type, roof type' },
        { label: 'Effort', value: '~1 minute' },
      ],
    },
  },

  'Systems Factor': {
    'Missing Data': {
      mode: 'DATA_GAP',
      headline: 'Add your heating, cooling, and water heater types',
      summary: 'Your major systems drive most maintenance planning and cost forecasting.',
      whyItMatters:
        'Heating, cooling, and water heater types let us estimate service life, seasonal tune-up needs, and replacement budgeting for the biggest-ticket systems in the home.',
      ctaLabel: 'Add system details',
      statusLabel: 'Not recorded yet',
      extraFacts: () => [
        { label: "What's missing", value: 'Heating, cooling, water heater type' },
        { label: 'Effort', value: '~2 minutes' },
      ],
    },
  },

  'Size Factor': {
    'Missing Data': {
      mode: 'DATA_GAP',
      headline: "Add your home's square footage",
      summary: 'Size helps us right-size cost estimates and maintenance effort.',
      whyItMatters:
        'Square footage feeds cost ranges (roofing, HVAC, painting) and how we weigh occupancy against wear.',
      ctaLabel: 'Add square footage',
      statusLabel: 'Not recorded yet',
      extraFacts: () => [
        { label: "What's missing", value: 'Square footage' },
        { label: 'Effort', value: '~1 minute' },
      ],
    },
  },

  'HVAC Age': {
    'Needs Inspection': {
      mode: 'MAINTENANCE',
      headline: 'Have your HVAC system inspected',
      summary: 'Your HVAC is past the point where older systems start working harder to keep up.',
      whyItMatters:
        "Your HVAC is running, but at its age a seasonal technician check is cheaper than an emergency repair — and it tells you how much service life is left so you can plan a replacement rather than scramble for one.",
      ctaLabel: 'Book an HVAC check',
      statusLabel: 'Inspection suggested',
      extraFacts: (ctx) => [
        ...(year(ctx.installYear) ? [{ label: 'Installed', value: year(ctx.installYear)! }] : []),
        { label: 'Typical service life', value: '15–20 years' },
        { label: 'Typical tune-up', value: '$80–150' },
        PLAN_AHEAD_FACT,
      ],
    },
  },

  'Water Heater Age': {
    'Needs Review': {
      mode: 'MAINTENANCE',
      headline: 'Have your water heater inspected',
      summary: 'Your water heater is approaching the end of its typical service life.',
      whyItMatters:
        "Your water heater still works, but it's getting up there in age — a quick check helps you spot early corrosion or a failing element before it leaks, and lets you budget for a planned replacement.",
      ctaLabel: 'Book an inspection',
      statusLabel: 'Worth a look',
      extraFacts: (ctx) => [
        ...(year(ctx.installYear) ? [{ label: 'Installed', value: year(ctx.installYear)! }] : []),
        { label: 'Typical service life', value: '10–12 years' },
        { label: 'Typical inspection', value: '$75–150' },
        PLAN_AHEAD_FACT,
      ],
    },
  },

  'Roof Age': {
    'Needs Inspection': {
      mode: 'MAINTENANCE',
      headline: 'Get your roof inspected',
      summary: 'Your roof is past the typical replacement window and worth a professional look.',
      whyItMatters:
        "At this age, roofs start to lose granules, seals, and flashing integrity. An inspection — many roofers do them free — tells you whether you have a few more years or should start planning a replacement.",
      ctaLabel: 'Find a roof inspection',
      statusLabel: 'Inspection suggested',
      extraFacts: (ctx) => [
        ...(year(ctx.installYear) ? [{ label: 'Last replaced', value: year(ctx.installYear)! }] : []),
        { label: 'Typical service life', value: '20–25 years' },
        { label: 'Inspection', value: 'Often free' },
        PLAN_AHEAD_FACT,
      ],
    },
  },

  'Safety': {
    'Incomplete': {
      mode: 'DATA_GAP',
      headline: 'Confirm your smoke and CO detectors',
      summary: 'A few home safety devices are unconfirmed.',
      whyItMatters:
        'Working smoke and carbon-monoxide detectors, a fire extinguisher, and a security system are the baseline safety layer for any home. Confirm what you have so we can flag anything missing.',
      ctaLabel: 'Review safety devices',
      statusLabel: 'Incomplete',
      extraFacts: () => [{ label: 'Effort', value: '~1 minute' }],
    },
  },

  'Exterior': {
    'Needs Attention': {
      mode: 'MAINTENANCE',
      headline: 'Inspect your exterior drainage',
      summary: 'A drainage issue is on record — water pooling near the foundation is worth addressing.',
      whyItMatters:
        'Poor grading, blocked drains, or downspouts that discharge too close to the house are among the most common causes of foundation and basement water damage. Checking it after heavy rain tells you whether a simple regrade or extension is enough.',
      ctaLabel: 'See drainage checklist',
      statusLabel: 'Worth addressing',
      extraFacts: () => [
        { label: 'Common fix', value: 'Regrade or extend downspouts' },
        PLAN_AHEAD_FACT,
      ],
    },
  },

  'Documents': {
    'Partial': {
      mode: 'DATA_GAP',
      headline: 'Add a few more property documents',
      summary: 'Some records are on file — filling the gaps strengthens this factor.',
      whyItMatters:
        'Service records, inspection reports, and warranties help with insurance claims, resale, and knowing what work has already been done.',
      ctaLabel: 'Upload documents',
      statusLabel: 'Partly recorded',
      extraFacts: () => [{ label: 'Effort', value: 'A few minutes' }],
    },
  },

  'Appliances': {
    'Missing Data': {
      mode: 'DATA_GAP',
      headline: 'Add your major appliances',
      summary: 'No appliances are recorded yet — adding them unlocks lifecycle, coverage, and recall tracking.',
      whyItMatters:
        'Once your appliances are in inventory, we can track their age against typical service life, match them to recalls, and tell you when a warranty is worth it.',
      ctaLabel: 'Add appliances',
      statusLabel: 'Not recorded yet',
      extraFacts: () => [{ label: 'Effort', value: '~1 minute each' }],
    },
    'Partial': {
      mode: 'DATA_GAP',
      headline: 'Fill in missing appliance install years',
      summary: 'Some appliances are missing an install year, which limits lifecycle guidance.',
      whyItMatters:
        'An approximate installation year is enough for us to track each appliance against its typical service life and warn you before it reaches end of life.',
      ctaLabel: 'Complete appliance details',
      statusLabel: 'Partly recorded',
      extraFacts: () => [{ label: 'Effort', value: '~30 seconds each' }],
    },
  },
} satisfies Partial<Record<HealthFactorKey, Partial<Record<HealthFactorStatusKey, HealthFactorCopy>>>>;

// ── Resolver ─────────────────────────────────────────────────────────────────

function warrantyGapCopy(ctx: HealthFactorCopyContext): HealthFactorCopy {
  const asset = (ctx.assetName ?? 'appliance').trim() || 'appliance';
  return {
    mode: 'WARRANTY_GAP',
    headline: `Consider a warranty for your aging ${asset.toLowerCase()}`,
    summary: `Your ${asset.toLowerCase()} is past 15 years old and has no home-warranty coverage on file.`,
    whyItMatters:
      `Appliances this age fail more often, and a repair or replacement out of pocket can run several hundred to a few thousand dollars. A home warranty or an extended plan can cap that exposure.`,
    ctaLabel: 'Review warranty options',
    statusLabel: 'No coverage on file',
    extraFacts: () => [
      { label: 'Appliance', value: asset },
      { label: 'Coverage', value: 'No active home warranty found' },
    ],
  };
}

function genericFallbackCopy(factor: string, status: string): HealthFactorCopy {
  const name = displayHealthFactorName(factor);
  const normalized = normalizeHealthStatus(status);
  const isGap = normalized === 'Missing Data';
  return {
    mode: isGap ? 'DATA_GAP' : 'MAINTENANCE',
    headline: isGap ? `Add details for ${name.toLowerCase()}` : `Review ${name.toLowerCase()}`,
    summary: isGap
      ? `We don't have enough recorded for ${name.toLowerCase()} yet.`
      : `${name} is flagged for a closer look.`,
    whyItMatters: isGap
      ? `Adding this lets us give you a real score and specific next steps for ${name.toLowerCase()}.`
      : `This factor is outside its normal range. Reviewing the underlying records and evidence tells you whether action is needed.`,
    ctaLabel: isGap ? 'Add details' : 'Review this factor',
    statusLabel: friendlyHealthStatus(status),
    extraFacts: () => (isGap ? [{ label: 'Effort', value: '~1 minute' }] : [PLAN_AHEAD_FACT]),
  };
}

/**
 * Resolve homeowner copy for a (factor, status) pair. Never throws; always
 * returns copy with a concrete, non-abstract headline.
 */
export function resolveHealthFactorCopy(
  factor: string,
  status: string,
  ctx: HealthFactorCopyContext,
): HealthFactorCopy {
  const normalizedStatus = normalizeHealthStatus(status);

  // Dynamic "<Asset> aging" / Needs Warranty factor.
  if (/\s+aging$/i.test(factor.trim()) && normalizedStatus === 'Needs Warranty') {
    return warrantyGapCopy({
      ...ctx,
      assetName: ctx.assetName ?? factor.trim().replace(/\s+aging$/i, '').trim(),
    });
  }

  const factorCopy = (HEALTH_FACTOR_COPY as Record<string, Partial<Record<string, HealthFactorCopy>>>)[factor];
  const exact = factorCopy?.[normalizedStatus] ?? factorCopy?.[status];
  if (exact) return exact;

  return genericFallbackCopy(factor, status);
}

/** Build the mode-appropriate key-facts list for a card. */
export function healthFactorKeyFacts(
  copy: HealthFactorCopy,
  ctx: HealthFactorCopyContext,
): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = [
    { label: 'Current status', value: copy.statusLabel },
  ];
  if (copy.extraFacts) facts.push(...copy.extraFacts(ctx));
  // Contract caps keyFacts at 8; trim defensively.
  return facts.slice(0, 8);
}
