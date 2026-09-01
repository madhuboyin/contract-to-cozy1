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

export type HealthFactorImpact = 'positive' | 'neutral' | 'negative';

export interface HealthFactorCopyContext {
  propertyId: string;
  /** Property.yearBuilt, when this is an age/structure factor. */
  yearBuilt?: number | null;
  /** hvacInstallYear / waterHeaterInstallYear / roofReplacementYear, when relevant. */
  installYear?: number | null;
  /** Homeowner-facing appliance name for the dynamic "<Asset> aging" factor. */
  assetName?: string | null;
  /** Recorded appliance count, for the aggregate "Appliances" factor's explanation. */
  applianceCount?: number | null;
  /** Appliances missing assetType/installYear, for the "Appliances" explanation. */
  incompleteApplianceCount?: number | null;
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
  /** "What to do + rough cost" one-liner for the focus page (getFactorActionHint parity). */
  actionHint?: string;
  /** Optional extra key facts (typical lifespan, cost range, effort). */
  extraFacts?: (ctx: HealthFactorCopyContext) => Array<{ label: string; value: string }>;
}

/** Copy for a factor state that is not an actionable card (positive / watch / in-progress). */
export interface HealthFactorStateCopy {
  summary: string;
  explanation: string;
}

/**
 * The per-insight copy bundle attached to each Property Health Score insight
 * (property.service.ts attachHealthScore) and consumed by the
 * focus/health/[factor] page — one source of truth for both the Home card and
 * the focus page. See docs/product/HOME_ACTION_HEALTH_FACTOR_COPY_FRD.md §5.4.
 */
export interface HealthFactorInsightCopy {
  displayName: string;
  statusLabel: string;
  impact: HealthFactorImpact;
  /** Short one-liner under the factor title. */
  summary: string;
  /** Paragraph explaining the state (may be empty for terminal "just do it" negatives). */
  explanation: string;
  /** "What to do + rough cost", or null when there is nothing to do. */
  actionHint: string | null;
  /** Primary CTA label (href routing stays a UI concern). */
  ctaLabel: string;
  mode: HealthFactorMode | null;
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
      actionHint: 'Consider a general home inspection to surface age-related items — typically $300–500.',
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
      actionHint: 'Have a technician assess the system before next season — tune-ups typically run $80–150.',
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
      actionHint: 'Schedule a water heater inspection — most cost $75–150.',
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
      actionHint: 'Get a roof inspection — many contractors offer free assessments.',
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
      actionHint: 'Check grading, drains, and downspout discharge after the next heavy rain — a regrade or downspout extension is often all it takes.',
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
      headline: 'Fill in missing appliance purchase dates',
      summary: 'Some appliances are missing a purchase date, which limits lifecycle and warranty guidance.',
      whyItMatters:
        'An approximate purchase date is enough for us to estimate age, track warranty timing, and warn you before an appliance reaches end of life.',
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

// ── Non-actionable state copy (positive / watch / in-progress) ────────────────
// Migrated from focus/health/[factor]/page.tsx (getFactorDescription +
// getInsightStatusExplanation). Keyed by canonical factor.

const HEALTH_FACTOR_STATE_COPY: Partial<Record<string, Partial<Record<string, HealthFactorStateCopy>>>> = {
  'Property Age (Year Built)': {
    Excellent: {
      summary: 'Recently built — a strong age signal.',
      explanation: "Your home's age is working in its favor — newer construction typically means fewer deferred-maintenance surprises.",
    },
    Good: {
      summary: 'Home age is within a typical maintenance window.',
      explanation: 'Your home is at an age where routine upkeep is enough — no age-driven concerns right now.',
    },
    'Action Pending': {
      summary: 'An age-related review is already in progress.',
      explanation: 'Work is already underway on this factor. Its contribution should improve once the task is complete.',
    },
  },
  'Water Heater Age': {
    Good: {
      summary: 'Recently installed — no action needed.',
      explanation: "Your water heater is relatively new — it's a reliable, low-maintenance part of your home right now.",
    },
    Aging: {
      summary: 'Getting older — monitor for performance issues.',
      explanation: 'Your water heater is still working but getting up there in age — a quick annual check helps you spot early issues before they become expensive.',
    },
  },
  'HVAC Age': {
    Good: {
      summary: 'In its prime years — efficient and reliable.',
      explanation: 'Your HVAC system is in its prime years — efficient, reliable, and with plenty of service life ahead.',
    },
    Aging: {
      summary: 'Aging system — schedule annual maintenance.',
      explanation: 'Your HVAC is running but older systems work harder to keep up — a seasonal tune-up now is cheaper than an emergency repair later.',
    },
    'Action Pending': {
      summary: 'Service is already scheduled.',
      explanation: 'Work is already underway on this factor. Its contribution should improve once the task is complete.',
    },
  },
  'Roof Age': {
    Good: {
      summary: 'Plenty of life left — no immediate concerns.',
      explanation: 'Your roof has plenty of life left — no immediate concerns, just keep up the occasional inspection.',
    },
    Aging: {
      summary: 'Mid-life — inspect after the next major storm.',
      explanation: 'Your roof is within its expected lifespan but worth watching — noting any curling shingles or soft spots after storms helps you stay ahead of leaks.',
    },
    'Action Pending': {
      summary: 'A roof inspection or repair is already scheduled.',
      explanation: 'Work is already underway on this factor. Its contribution should improve once the task is complete.',
    },
  },
  'Systems Factor': {
    Modern: {
      summary: 'Heating, cooling, and water systems are up to date.',
      explanation: 'Your heating, cooling, and water systems are in good shape — well-maintained systems are one of the strongest signs of a well-cared-for home.',
    },
    Standard: {
      summary: 'Major systems are functioning at a standard level.',
      explanation: 'Your major systems are running normally — logging service visits as they happen helps you track what has been done and what is coming up.',
    },
  },
  'Usage/Wear Factor': {
    'Low Density': {
      summary: 'Light occupancy — lower day-to-day wear.',
      explanation: "Your home's size is well-matched to your household — lower wear means fixtures and systems last longer and cost less to maintain.",
    },
    'High Density': {
      summary: 'Active daily use — stay current on routine maintenance.',
      explanation: 'Your home sees active daily use — staying current on routine maintenance keeps wear from piling up over time.',
    },
  },
  'Structure Factor': {
    Good: {
      summary: 'Structural elements are in good condition.',
      explanation: "Your home's structural elements are in good condition — a solid foundation protects everything built on top of it.",
    },
    Average: {
      summary: 'Structure is stable — periodic checks recommended.',
      explanation: 'Your structural elements look okay but warrant a closer look — a periodic inspection every few years is a smart habit for any home.',
    },
  },
  'Safety': {
    Complete: {
      summary: 'Safety devices are up to date.',
      explanation: 'Your safety devices are up to date — your home and household are well-protected.',
    },
  },
  'Documents': {
    Complete: {
      summary: 'Property documents are up to date.',
      explanation: 'Your home has solid documentation on file — this helps with insurance, resale value, and future planning.',
    },
    Partial: {
      summary: 'Documentation is partially there.',
      explanation: 'Your documentation is partially there — filling in the gaps makes this factor stronger and helps if you ever sell or make a claim.',
    },
  },
  'Size Factor': {
    Optimal: {
      summary: "Your home's size is in a well-matched range.",
      explanation: 'Home size sits in the range where cost estimates and maintenance effort are most predictable.',
    },
  },
};

export function healthFactorImpact(status: string | undefined | null): HealthFactorImpact {
  const s = normalizeHealthStatus(status);
  const negative = ['Needs Review', 'Needs Inspection', 'Needs Attention', 'Missing Data', 'Needs Warranty'];
  const positive = ['Excellent', 'Good', 'Modern', 'Optimal', 'Complete', 'Low Density'];
  if (negative.includes(s)) return 'negative';
  if (positive.includes(String(status ?? '').trim())) return 'positive';
  return 'neutral';
}

function stateExplanation(factor: string, status: string, ctx: HealthFactorCopyContext): HealthFactorStateCopy {
  const normalized = normalizeHealthStatus(status);
  const raw = String(status ?? '').trim();
  const name = displayHealthFactorName(factor);

  // Appliance factor has count-dependent copy.
  if (/appliance/i.test(factor)) {
    const count = ctx.applianceCount ?? 0;
    const incomplete = ctx.incompleteApplianceCount ?? 0;
    if (count > 0) {
      return incomplete > 0
        ? {
            summary: `${count} appliance${count === 1 ? '' : 's'} tracked — ${incomplete} missing a purchase date.`,
            explanation: `${count} appliance${count === 1 ? ' is' : 's are'} tracked. Add an approximate purchase date for ${incomplete} appliance${incomplete === 1 ? '' : 's'} to improve lifecycle and warranty guidance.`,
          }
        : {
            summary: `${count} appliance${count === 1 ? '' : 's'} tracked with full lifecycle details.`,
            explanation: `${count} appliance${count === 1 ? ' is' : 's are'} tracked with the lifecycle information needed for health guidance.`,
          };
    }
    return {
      summary: 'No appliances are recorded yet.',
      explanation: 'Add your major appliances to start tracking their health, coverage, and recall status.',
    };
  }

  const exact = HEALTH_FACTOR_STATE_COPY[factor]?.[normalized] ?? HEALTH_FACTOR_STATE_COPY[factor]?.[raw];
  if (exact) return exact;

  if (normalized === 'Missing Data') {
    return {
      summary: `${name} is not recorded yet.`,
      explanation: "Data for this factor hasn't been recorded yet. Adding it unlocks a real score for this factor and specific next steps.",
    };
  }
  if (raw === 'Incomplete') {
    return {
      summary: `${name} is partly set up.`,
      explanation: 'This factor is partially set up. Completing the missing information will unlock a more accurate score and targeted guidance.',
    };
  }
  if (raw === 'Action Pending') {
    return {
      summary: 'Work is already underway.',
      explanation: 'Work is already underway on this factor. Its contribution should improve once the task is completed.',
    };
  }
  if (healthFactorImpact(status) === 'positive') {
    return {
      summary: `${friendlyHealthStatus(status)} — no issues flagged.`,
      explanation: "This area is in great shape — keep doing what you're doing and it should stay that way.",
    };
  }
  return {
    summary: `${name} — worth keeping an eye on.`,
    explanation: 'This area is in decent shape but worth keeping an eye on — periodic checks help you stay ahead of anything that might come up.',
  };
}

/**
 * The per-insight copy bundle. One resolver behind both the Home card and the
 * focus page. Never throws.
 */
export function resolveHealthFactorInsightCopy(
  factor: string,
  status: string,
  ctx: HealthFactorCopyContext,
): HealthFactorInsightCopy {
  const displayName = displayHealthFactorName(factor);
  const normalized = normalizeHealthStatus(status);

  // A stale "Missing Data" appliance snapshot while records actually exist —
  // mirror the focus page's remap and treat it as a recorded (non-card) state.
  const staleApplianceGap = /appliance/i.test(factor) &&
    normalized === 'Missing Data' && (ctx.applianceCount ?? 0) > 0;
  const effectiveStatus = staleApplianceGap
    ? ((ctx.incompleteApplianceCount ?? 0) > 0 ? 'Partial' : 'Complete')
    : status;

  const statusLabel = friendlyHealthStatus(effectiveStatus);
  const impact = healthFactorImpact(effectiveStatus);

  const isCardStatus = !staleApplianceGap && (
    CARD_PRODUCING_HEALTH_STATUSES.includes(normalized as HealthFactorStatusKey) ||
    /\s+aging$/i.test(factor.trim())
  );

  if (isCardStatus && impact === 'negative') {
    const card = resolveHealthFactorCopy(factor, status, ctx);
    return {
      displayName,
      statusLabel,
      impact,
      summary: card.summary,
      explanation: card.whyItMatters,
      actionHint: card.actionHint ?? null,
      ctaLabel: card.ctaLabel,
      mode: card.mode,
    };
  }

  const state = stateExplanation(factor, status, ctx);
  return {
    displayName,
    statusLabel,
    impact,
    summary: state.summary,
    explanation: state.explanation,
    actionHint: null,
    ctaLabel: impact === 'positive' ? 'View maintenance actions' : 'Review this factor',
    mode: null,
  };
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
