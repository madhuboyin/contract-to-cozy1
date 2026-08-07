// Sale Readiness Value-Maximization Checklist plan §4.3/§10 Phase 3: the
// Tier 2 generic fallback catalog — shown only when a property has no Tier 1
// signal and no self-reported answer for a given cosmetic category (see
// propertySaleCase.service.ts's projectGenericFallbacks). Content is sourced
// from real, current industry reports, not fabricated — see the plan doc's
// §4.3 for the full citation list and the reasoning behind rejecting the
// retired roiRules.engine.ts numbers (unsourced, and one item was the exact
// generic-safety-claim anti-pattern this design rules out).

export type SalePrepValueCategoryKey =
  | 'paint'
  | 'curbAppeal'
  | 'flooring'
  | 'kitchen'
  | 'bathroom'
  | 'staging';

export interface DollarRangeCents {
  minCents: number;
  maxCents: number;
}

// "Value-aware checklist" plan (2026-08-07, §10 Stage 1): how a category's
// base national-average cost/value figures get personalized to this
// property's actual size — added after direct product feedback that a flat
// national average isn't personalized at all. Each method only uses a
// property attribute the underlying source data actually supports a
// relationship for; categories never get a scaling method invented just to
// have one (see per-entry comments below for the reasoning per category).
export type SalePrepSizeScalingMethod =
  // Fixed per-unit project (e.g. a door) — cost doesn't meaningfully vary
  // with home size, so the base range is returned unscaled.
  | 'NONE'
  // Base range is a real $/sqft rate from the source, applied directly to
  // the property's total square footage.
  | 'SQFT_DIRECT'
  // Base range is a real $/sqft rate from the source, applied to an
  // assumed typical room size (documented per category below) rather than
  // the whole property — used where the source gives a per-sqft rate for
  // a specific room, not the whole home.
  | 'ASSUMED_ROOM_SQFT'
  // Base range is a national-average *project* cost (not a $/sqft rate);
  // scaled by how this property's total size compares to the US median
  // home size, as a general size-tier proxy — a modeling assumption, not
  // a sourced per-sqft relationship, and labeled as such.
  | 'HOME_SIZE_TIER'
  // Base range is a national-average project cost; scaled by how this
  // property's bedroom count compares to the US median, as a proxy for
  // "how many rooms need the work" — used only for staging, where more
  // bedrooms plausibly means more rooms to stage. Also a modeling
  // assumption, not a sourced per-bedroom rate.
  | 'BEDROOM_COUNT';

export interface SalePrepValueCatalogEntry {
  category: SalePrepValueCategoryKey;
  // Used for §4.4-style coverage-keyword matching against Tier 1 item
  // titles/details, so a real signal never gets duplicated by this fallback.
  keyword: string;
  title: string;
  detail: string;
  source: string;
  // Rough cost tier for this category's typical project scope, reusing the
  // same 4 buckets as the homeowner's own budget question (§4.7) — used
  // internally by propertySaleCase.service.ts to flag items that likely
  // exceed the homeowner's stated pre-sale budget. Directional only, not a
  // new sourced financial claim.
  costBucket: 'UNDER_5K' | 'FIVE_TO_15K' | 'FIFTEEN_TO_30K' | 'OVER_30K';
  // Real, sourced national-average dollar ranges — independently nullable,
  // since not every category has reliable dollar data even where the ROI%
  // claim is well-sourced. Deliberately NOT derived/estimated when the
  // source doesn't actually give one (paint's whole-home cost/value figures
  // aren't published by either cited report; staging's value impact is
  // reported as a % of sale price, not convertible to a dollar figure
  // without this property's own estimated sale price, which isn't
  // available here) — leaving both null is the point of this field, not a
  // gap to "fix" by guessing. These are the *base* figures — see
  // `estimateSalePrepCostAndValueAdd` below for how they're personalized
  // to an actual property's size before being shown to a homeowner.
  baseCostRangeCents: DollarRangeCents | null;
  baseValueAddRangeCents: DollarRangeCents | null;
  sizeScaling: SalePrepSizeScalingMethod;
}

export const SALE_PREP_VALUE_CATALOG: readonly SalePrepValueCatalogEntry[] = [
  {
    category: 'paint',
    keyword: 'paint',
    title: 'Refresh interior paint before listing',
    detail: 'Painting the entire home is the #1 most-recommended pre-listing project — 50% of real estate agents recommend it to sellers, more than any other project.',
    source: 'NAR/NARI 2025 Remodeling Impact Report',
    costBucket: 'UNDER_5K',
    // Neither the NAR Remodeling Impact Report nor the Zonda Cost vs.
    // Value Report publishes a national average job-cost/value-added pair
    // for whole-home interior painting (both track it only as a
    // recommendation-frequency stat, not a costed remodel category) —
    // confirmed via direct search of both source reports before falling
    // back to null rather than inventing a figure. Nothing to scale.
    baseCostRangeCents: null,
    baseValueAddRangeCents: null,
    sizeScaling: 'NONE',
  },
  {
    category: 'curbAppeal',
    keyword: 'curb appeal',
    title: 'Invest in curb appeal and landscaping',
    detail: 'Exterior projects deliver the highest ROI of any category — 8 of the top 10 highest-ROI projects nationally are exterior; a new front door alone recovers about 100% of its cost at resale.',
    source: 'Zonda 2025 Cost vs. Value Report; NAR/NARI 2025 Remodeling Impact Report',
    costBucket: 'UNDER_5K',
    // Zonda 2025 CVR's two representative curb-appeal projects: steel
    // entry door replacement ($2,435 job cost → $5,270 value added, 216%
    // recouped) and garage door replacement ($4,672 → $12,507, 268%
    // recouped). Range spans these two real, named projects. Both are
    // fixed per-unit products (a door costs the same regardless of home
    // size) — deliberately NOT scaled by square footage; that would
    // invent a relationship the source data doesn't support.
    baseCostRangeCents: { minCents: 243_500, maxCents: 467_200 },
    baseValueAddRangeCents: { minCents: 527_000, maxCents: 1_250_700 },
    sizeScaling: 'NONE',
  },
  {
    category: 'flooring',
    keyword: 'floor',
    title: 'Refresh or refinish flooring',
    detail: 'Refinishing existing hardwood floors returns about 147% of its cost at resale — the highest ROI of any interior project tracked; new hardwood installation returns roughly 118%.',
    source: 'NAR/NARI 2025 Remodeling Impact Report',
    costBucket: 'FIVE_TO_15K',
    // Reported per-sq-ft rate: $3-8/sqft to refinish existing hardwood
    // (matches the reported $5,500 avg spend / $8,000 avg recovered,
    // 147% ROI, for a typical ~1,000-1,600 sqft flooring footprint).
    // Base range here IS the $/sqft rate itself (in cents), applied
    // directly to the property's total square footage by
    // `estimateSalePrepCostAndValueAdd` — genuinely personalized, not
    // just scaled by a size tier, since the source gives a true per-sqft
    // rate. Value-add applies the same 147% multiplier.
    baseCostRangeCents: { minCents: 300, maxCents: 800 },
    baseValueAddRangeCents: { minCents: 441, maxCents: 1_176 },
    sizeScaling: 'SQFT_DIRECT',
  },
  {
    category: 'kitchen',
    keyword: 'kitchen',
    title: 'Consider a minor kitchen refresh',
    detail: 'A minor kitchen remodel ($28k–30k) delivers about 113% ROI — the best return of any interior project. Major kitchen renovations, by contrast, typically recoup only 38–50%.',
    source: 'Zonda 2025 Cost vs. Value Report',
    costBucket: 'FIFTEEN_TO_30K',
    // Zonda's own reported national-average minor-kitchen-remodel job
    // cost ($28,458) and value added ($32,141, 112.9% recouped) for a
    // fixed-scope project (cabinet fronts, countertop, sink/faucet,
    // flooring, mid-grade appliances) — Zonda doesn't publish this as a
    // $/sqft rate, so it can't be scaled the direct way flooring can.
    // Scaled instead by overall home-size tier (larger homes tend to
    // have larger kitchens needing proportionally more material) — a
    // modeling assumption, not a sourced per-sqft relationship.
    baseCostRangeCents: { minCents: 2_500_000, maxCents: 3_200_000 },
    baseValueAddRangeCents: { minCents: 2_850_000, maxCents: 3_600_000 },
    sizeScaling: 'HOME_SIZE_TIER',
  },
  {
    category: 'bathroom',
    keyword: 'bathroom',
    title: 'Consider a midrange bathroom refresh',
    detail: 'A midrange bathroom remodel recoups about 80% of its cost at resale — the strongest interior ROI after a minor kitchen update.',
    source: 'Zonda 2025 Cost vs. Value Report',
    costBucket: 'FIFTEEN_TO_30K',
    // Reported per-sq-ft rate for a midrange bathroom: $180-280/sqft.
    // Applied to an assumed typical full-bathroom size (see
    // ASSUMED_BATHROOM_SQFT below — a commonly cited industry figure, not
    // this property's actual bathroom size, which isn't tracked at that
    // granularity) rather than the whole home's square footage — a
    // bathroom refresh's cost tracks that one room's size, not the
    // house's. Value-add applies the cited 80% ROI to the resulting cost.
    baseCostRangeCents: { minCents: 18_000, maxCents: 28_000 },
    baseValueAddRangeCents: null,
    sizeScaling: 'ASSUMED_ROOM_SQFT',
  },
  {
    category: 'staging',
    keyword: 'stag',
    title: 'Declutter and consider staging',
    detail: 'Decluttering is the most-recommended pre-listing task, cited by 96% of agents. Staged homes saw 1–10% higher buyer offers per 29% of agents surveyed, and 49% of agents reported faster sales.',
    source: 'NAR 2025 Profile of Home Staging',
    costBucket: 'UNDER_5K',
    // NAR's reported staging cost is real and dollar-denominated ($500
    // median when the seller's own agent stages it, $1,500 median for a
    // professional staging service) — but the reported *value* impact is
    // a percentage of sale price (1-10% higher offers), not a fixed
    // dollar figure, and converting it to a dollar range would need this
    // property's own estimated sale price, which isn't available here.
    // Cost scaled by bedroom count (more rooms to stage) as a modeling
    // proxy — not a sourced per-bedroom rate, since NAR doesn't publish
    // one; value-add stays null rather than forcing a percentage-of-price
    // stat into a dollar-amount shape it doesn't fit.
    baseCostRangeCents: { minCents: 50_000, maxCents: 150_000 },
    baseValueAddRangeCents: null,
    sizeScaling: 'BEDROOM_COUNT',
  },
] as const;

export function findSalePrepValueCatalogEntry(category: SalePrepValueCategoryKey): SalePrepValueCatalogEntry {
  const entry = SALE_PREP_VALUE_CATALOG.find((e) => e.category === category);
  if (!entry) throw new Error(`No sale-prep value catalog entry for category: ${category}`);
  return entry;
}

// US median single-family home size — NAHB/Census Bureau, commonly cited
// around 2,200 sq ft in recent years. Used only as a normalizing baseline
// to scale a national-average *project* cost (not a per-sqft rate) by how
// this property's actual size compares — not itself a claim about this
// specific property.
const MEDIAN_US_HOME_SQFT = 2_200;
// US median bedroom count for owner-occupied homes — commonly cited as 3.
const MEDIAN_US_BEDROOMS = 3;
// Commonly cited average size for a full bathroom (industry rule of thumb,
// not specific to any one source above) — used only to convert a per-sqft
// bathroom remodel rate into a single-room dollar figure, since this app
// doesn't track individual room square footage.
const ASSUMED_BATHROOM_SQFT = 40;

const MIN_SIZE_SCALING_FACTOR = 0.6;
const MAX_SIZE_SCALING_FACTOR = 1.6;

function clampedRatio(value: number, baseline: number): number {
  if (!value || value <= 0 || !baseline) return 1;
  return Math.min(MAX_SIZE_SCALING_FACTOR, Math.max(MIN_SIZE_SCALING_FACTOR, value / baseline));
}

function scaleRange(range: DollarRangeCents, factor: number): DollarRangeCents {
  return { minCents: Math.round(range.minCents * factor), maxCents: Math.round(range.maxCents * factor) };
}

export interface SalePrepPropertySizeContext {
  propertySizeSqFt: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
}

export interface SalePrepEstimate {
  costRangeCents: DollarRangeCents | null;
  valueAddRangeCents: DollarRangeCents | null;
}

// "Value-aware checklist" plan (2026-08-07, §10 Stage 1): personalizes a
// catalog entry's base national-average figures to an actual property's
// size, per direct product feedback that a flat national number for every
// home isn't real personalization. Falls back to the unscaled base range
// whenever the property attribute a category's scaling method needs isn't
// on file (never blocks on missing data, matches this feature's existing
// "never fully hide" pattern elsewhere).
export function estimateSalePrepCostAndValueAdd(
  category: SalePrepValueCategoryKey,
  context: SalePrepPropertySizeContext,
): SalePrepEstimate {
  const entry = findSalePrepValueCatalogEntry(category);
  if (!entry.baseCostRangeCents) return { costRangeCents: null, valueAddRangeCents: null };

  switch (entry.sizeScaling) {
    case 'SQFT_DIRECT': {
      if (!context.propertySizeSqFt) return { costRangeCents: null, valueAddRangeCents: null };
      return {
        costRangeCents: scaleRange(entry.baseCostRangeCents, context.propertySizeSqFt),
        valueAddRangeCents: entry.baseValueAddRangeCents
          ? scaleRange(entry.baseValueAddRangeCents, context.propertySizeSqFt)
          : null,
      };
    }
    case 'ASSUMED_ROOM_SQFT': {
      // Bathroom: per-sqft rate × an assumed single-bathroom size — not
      // multiplied by the property's bathroom count, since "a midrange
      // bathroom refresh" means refreshing the bathroom that needs it,
      // not redoing every bathroom in the house. Value-add is the cited
      // 80% ROI applied to the resulting personalized cost (bathroom has
      // no independent baseValueAddRangeCents — its ROI is only known as
      // a percentage of cost, not a separate sourced dollar figure).
      const cost = scaleRange(entry.baseCostRangeCents, ASSUMED_BATHROOM_SQFT);
      return {
        costRangeCents: cost,
        valueAddRangeCents: { minCents: Math.round(cost.minCents * 0.8), maxCents: Math.round(cost.maxCents * 0.8) },
      };
    }
    case 'HOME_SIZE_TIER': {
      const factor = clampedRatio(context.propertySizeSqFt ?? 0, MEDIAN_US_HOME_SQFT);
      return {
        costRangeCents: scaleRange(entry.baseCostRangeCents, factor),
        valueAddRangeCents: entry.baseValueAddRangeCents ? scaleRange(entry.baseValueAddRangeCents, factor) : null,
      };
    }
    case 'BEDROOM_COUNT': {
      const factor = clampedRatio(context.bedrooms ?? 0, MEDIAN_US_BEDROOMS);
      return {
        costRangeCents: scaleRange(entry.baseCostRangeCents, factor),
        valueAddRangeCents: entry.baseValueAddRangeCents ? scaleRange(entry.baseValueAddRangeCents, factor) : null,
      };
    }
    case 'NONE':
    default:
      return { costRangeCents: entry.baseCostRangeCents, valueAddRangeCents: entry.baseValueAddRangeCents };
  }
}
