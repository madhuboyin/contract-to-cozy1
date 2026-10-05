// Packet D3 / step 8: the server-owned fact allowlist for a typed area-capture launch. A profile chip promises a bounded set of
// unresolved, applicable, consumer-backed facts; the area flow itself would otherwise ask EVERY writable fact in the area (including
// ones nothing consumes, audience facts for an inactive audience, and dependents whose governing fact is still unanswered). The
// launch therefore carries an EXCLUSION set computed here from the registry; the flow leaves those facts out when choosing the next
// question, exactly like a skip, but it is server-computed, never client-supplied, and never shown as "skipped".
//
// outcomeKey -> area scope -> permitted fact keys is the registry's mapping (`profileAreaForOutcome`); message text never decides scope.
import { getFactDefinition, getFactDefinitionsForScope, isFactApplicable } from '../../../modules/propertyContext/catalog/factCatalog';
import { getPropertyContext } from '../../../modules/propertyContext/application/getPropertyContext';
import { PROPERTY_AREA_CAPTURE_SCOPES, type PropertyAreaCaptureScope } from '../../../modules/propertyContext/catalog/featureRequirementRegistry';
import {
  computeActionableCompleteness, profileAreaForOutcome, type ActionableCompleteness, type ProfileArea, type ProfileAudience,
} from './actionableProfileRegistry';
import { loadProfileAudienceState } from './profileAudienceAdapter';

/** The area scope a typed launch asks for, from its server-held outcome key; null for a missing or unknown outcome. */
export function areaScopeForOutcome(outcomeKey: string | null | undefined): PropertyAreaCaptureScope | null {
  if (!outcomeKey) return null;
  const area: ProfileArea | null = profileAreaForOutcome(outcomeKey);
  return area !== null && (PROPERTY_AREA_CAPTURE_SCOPES as readonly string[]).includes(area) ? (area as PropertyAreaCaptureScope) : null;
}

/**
 * Pure: every writable fact in the area that the launch may NOT ask about now = the area's facts minus the registry's `askNowFactKeys`
 * (unresolved, applicable, allowlisted, audience-active, governor-first). Sorted for determinism.
 */
export function areaExclusionsFor(areaFactKeys: readonly string[], completeness: Pick<ActionableCompleteness, 'unresolvedByArea'>, scope: PropertyAreaCaptureScope): string[] {
  const askNow = new Set(completeness.unresolvedByArea[scope as ProfileArea]?.askNowFactKeys ?? []);
  return areaFactKeys.filter((key) => !askNow.has(key)).sort();
}

export interface AreaCaptureAllowlist {
  /** Facts the flow must leave out for this launch. */
  excludedFactKeys: string[];
  /** Facts the flow may ask (the chip's allowlist), for diagnostics and tests. */
  askNowFactKeys: string[];
  audienceUncertain: boolean;
  denominatorVersion: string;
}

export interface AreaAllowlistDeps {
  loadFacts(propertyId: string, userId: string): Promise<Readonly<Record<string, { state: 'KNOWN' | 'UNKNOWN' | 'CONFLICTED' | 'STALE'; value?: unknown } | undefined>>>;
  loadAudiences(propertyId: string): Promise<{ audiences: ProfileAudience[]; ok: boolean }>;
}

const defaultDeps: AreaAllowlistDeps = {
  async loadFacts(propertyId, userId) {
    // Every area scope is loaded: catalog applicability reads facts from other areas (for example dwelling type gating exterior facts).
    const snapshot = await getPropertyContext(propertyId, { userId }, { scopes: [...PROPERTY_AREA_CAPTURE_SCOPES] });
    return snapshot.facts as unknown as Readonly<Record<string, { state: 'KNOWN' | 'UNKNOWN' | 'CONFLICTED' | 'STALE'; value?: unknown } | undefined>>;
  },
  loadAudiences: (propertyId) => loadProfileAudienceState(propertyId),
};

/**
 * Computes the allowlist for one typed launch. THROWS on a lookup failure (the caller fails closed: a chip that promised a bounded set
 * must not silently open the unbounded flow). An audience lookup that fails is NOT a throw: it is reported as `audienceUncertain`,
 * and the audience-conditional facts stay out, which is the safe direction for a launch.
 */
export async function loadAreaCaptureAllowlist(
  userId: string, propertyId: string, scope: PropertyAreaCaptureScope, deps: AreaAllowlistDeps = defaultDeps,
): Promise<AreaCaptureAllowlist> {
  const [facts, audience] = await Promise.all([deps.loadFacts(propertyId, userId), deps.loadAudiences(propertyId)]);
  const completeness = computeActionableCompleteness({
    facts, activeAudiences: audience.audiences, audienceUncertain: !audience.ok,
    isCatalogApplicable: (factKey) => isFactApplicable(getFactDefinition(factKey), facts as Record<string, { value: unknown } | undefined>),
  });
  const areaFactKeys = getFactDefinitionsForScope(scope).filter((definition) => definition.writable).map((definition) => definition.key);
  return {
    excludedFactKeys: areaExclusionsFor(areaFactKeys, completeness, scope),
    askNowFactKeys: [...(completeness.unresolvedByArea[scope as ProfileArea]?.askNowFactKeys ?? [])].sort(),
    audienceUncertain: completeness.audienceUncertain,
    denominatorVersion: completeness.denominatorVersion,
  };
}
