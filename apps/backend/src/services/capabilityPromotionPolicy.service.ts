export const CAPABILITY_PROMOTION_SURFACES = [
  'HOME',
  'PROPERTY',
  'WORKFLOW',
  'RELATED',
  'COMPLETION',
] as const;

export type CapabilityPromotionSurface =
  typeof CAPABILITY_PROMOTION_SURFACES[number];

export function capabilityRecommendationsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CAPABILITY_RECOMMENDATIONS_ENABLED?.trim().toLowerCase()
    !== 'false';
}
