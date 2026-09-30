/**
 * Bounded inline capture for health-insight data gaps (gap audit §17; FRD v1.172). A health-insight Home Action
 * whose whole job is "this fact is missing" ("Add year built", "Complete home details", "Add system details",
 * "Add square footage") is answered by asking for that one fact inside Ask, instead of sending the homeowner to
 * the property page.
 *
 * Deliberately derived inside Ask from the insight's lineage and factor name, not by changing the producer: the
 * producer's CTA kind is REVIEW, and switching it to CORRECT_FACT would also change the desktop Resolution Center
 * (its inline capture keys on the same kind) and must pass the presentation registry's allowed-kind rule. Each
 * fact uses the `ASK_NEXT_ACTION` per-fact feature Property Context already registers for every scalar fact, so no
 * registry work is needed, and one fact is asked at a time: the capture-submit path re-derives the same focused
 * card, which then asks for the next fact that is still unknown.
 *
 * Facts are listed in the order they are asked. Anything that is not a single bounded scalar (the appliance list,
 * documents, safety devices) is intentionally absent.
 */
export const HEALTH_INSIGHT_LINEAGE_PREFIX = 'health-insight:';

const HEALTH_GAP_FACTS: Readonly<Record<string, readonly string[]>> = {
  'property age (year built)': ['core.yearBuilt'],
  'structure factor': ['core.dwellingType', 'structure.roofType'],
  'systems factor': ['systems.heatingType', 'systems.coolingType', 'systems.waterHeaterType'],
  'size factor': ['core.propertySizeSqFt'],
};

const normalizeFactor = (signal: string) => signal.trim().toLowerCase().replace(/\s+/g, ' ');

function isHealthInsight(action: { lineageId: string }): boolean {
  return action.lineageId.startsWith(HEALTH_INSIGHT_LINEAGE_PREFIX);
}

export function healthGapFactKeys(action: { lineageId: string; signal: string }): readonly string[] | null {
  if (!isHealthInsight(action)) return null;
  return HEALTH_GAP_FACTS[normalizeFactor(action.signal)] ?? null;
}

/** The aggregate "Appliances" insight ("Add your major appliances" / missing purchase dates). */
export function isAppliancesInsight(action: { lineageId: string; signal: string }): boolean {
  return isHealthInsight(action) && normalizeFactor(action.signal) === 'appliances';
}

// Same transform as nextActionContextOperation (askNextActions.ts) and the per-fact registry entries. Kept local so this
// module, and the pure focused-guidance builder that imports it, do not pull in the capability-recommendation graph;
// a test pins it to the original and to the registry.
const factOperationKey = (factKey: string) => factKey.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();

export function healthGapCaptureFeature(factKey: string): { featureKey: 'ASK_NEXT_ACTION'; operationKey: string } {
  return { featureKey: 'ASK_NEXT_ACTION', operationKey: factOperationKey(factKey) };
}

/**
 * The first fact (in ask order) that Property Context still reports as unknown for this insight, with its evaluation.
 * Property Context, not the raw property row, is the authority on "unknown" (it also honours answers such as "not sure"),
 * so each candidate is evaluated in turn and the first with an outstanding requirement wins -- one fact per turn.
 * The evaluator is injected so the ordering can be tested without a database.
 */
export async function deriveHealthGapCapture<E extends { requirements: readonly unknown[] }>(
  action: { lineageId: string; signal: string },
  evaluate: (feature: { featureKey: 'ASK_NEXT_ACTION'; operationKey: string }) => Promise<E>,
): Promise<{ factKey: string; feature: { featureKey: 'ASK_NEXT_ACTION'; operationKey: string }; evaluation: E } | null> {
  for (const factKey of healthGapFactKeys(action) ?? []) {
    const feature = healthGapCaptureFeature(factKey);
    const evaluation = await evaluate(feature);
    if (evaluation.requirements[0]) return { factKey, feature, evaluation };
  }
  return null;
}
