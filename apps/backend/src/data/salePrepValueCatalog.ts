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
  // exceed the homeowner's stated pre-sale budget (§10, added after direct
  // product feedback that the captured budgetRange was write-only and
  // never affected the checklist). Directional only, not a new sourced
  // financial claim — kitchen/bathroom map to the dollar figures already
  // cited in `detail` above; the rest are ordinary, uncited cost-tier
  // judgment calls (a repaint or a decluttering pass is inexpensive
  // relative to a remodel), never surfaced to the homeowner as a number.
  costBucket: 'UNDER_5K' | 'FIVE_TO_15K' | 'FIFTEEN_TO_30K' | 'OVER_30K';
}

export const SALE_PREP_VALUE_CATALOG: readonly SalePrepValueCatalogEntry[] = [
  {
    category: 'paint',
    keyword: 'paint',
    title: 'Refresh interior paint before listing',
    detail: 'Painting the entire home is the #1 most-recommended pre-listing project — 50% of real estate agents recommend it to sellers, more than any other project.',
    source: 'NAR/NARI 2025 Remodeling Impact Report',
    costBucket: 'UNDER_5K',
  },
  {
    category: 'curbAppeal',
    keyword: 'curb appeal',
    title: 'Invest in curb appeal and landscaping',
    detail: 'Exterior projects deliver the highest ROI of any category — 8 of the top 10 highest-ROI projects nationally are exterior; a new front door alone recovers about 100% of its cost at resale.',
    source: 'Zonda 2025 Cost vs. Value Report; NAR/NARI 2025 Remodeling Impact Report',
    costBucket: 'UNDER_5K',
  },
  {
    category: 'flooring',
    keyword: 'floor',
    title: 'Refresh or refinish flooring',
    detail: 'Refinishing existing hardwood floors returns about 147% of its cost at resale — the highest ROI of any interior project tracked; new hardwood installation returns roughly 118%.',
    source: 'NAR/NARI 2025 Remodeling Impact Report',
    costBucket: 'FIVE_TO_15K',
  },
  {
    category: 'kitchen',
    keyword: 'kitchen',
    title: 'Consider a minor kitchen refresh',
    detail: 'A minor kitchen remodel ($28k–30k) delivers about 113% ROI — the best return of any interior project. Major kitchen renovations, by contrast, typically recoup only 38–50%.',
    source: 'Zonda 2025 Cost vs. Value Report',
    costBucket: 'FIFTEEN_TO_30K',
  },
  {
    category: 'bathroom',
    keyword: 'bathroom',
    title: 'Consider a midrange bathroom refresh',
    detail: 'A midrange bathroom remodel recoups about 80% of its cost at resale — the strongest interior ROI after a minor kitchen update.',
    source: 'Zonda 2025 Cost vs. Value Report',
    costBucket: 'FIFTEEN_TO_30K',
  },
  {
    category: 'staging',
    keyword: 'stag',
    title: 'Declutter and consider staging',
    detail: 'Decluttering is the most-recommended pre-listing task, cited by 96% of agents. Staged homes saw 1–10% higher buyer offers per 29% of agents surveyed, and 49% of agents reported faster sales.',
    source: 'NAR 2025 Profile of Home Staging',
    costBucket: 'UNDER_5K',
  },
] as const;

export function findSalePrepValueCatalogEntry(category: SalePrepValueCategoryKey): SalePrepValueCatalogEntry {
  const entry = SALE_PREP_VALUE_CATALOG.find((e) => e.category === category);
  if (!entry) throw new Error(`No sale-prep value catalog entry for category: ${category}`);
  return entry;
}
