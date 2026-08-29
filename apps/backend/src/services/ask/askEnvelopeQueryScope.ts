import type { EnvelopeEntityRef, PropertyComponentKind } from '../../productFramework/intelligence';
import type { IntelligenceEnvelopeQuery } from '../intelligenceEnvelope';

const COMPONENT_PATTERNS: ReadonlyArray<readonly [PropertyComponentKind, RegExp]> = [
  ['ROOF', /\b(?:roof|roofing)\b/i],
  ['FOUNDATION', /\bfoundation\b/i],
  ['EXTERIOR', /\bexterior\b/i],
  ['INTERIOR', /\binterior\b/i],
  ['SITE', /\b(?:site|lot|grounds)\b/i],
];

/**
 * Phase 3 §24.5: translate a natural component-scoped observation question
 * into the typed Envelope query shape. Ordinary inventory/detail requests are
 * still owned by INVENTORY_LOOKUP; this parser is used only after the closed
 * non-actionable-observation route has been selected.
 */
export function resolveAskEnvelopeQueryScope(
  propertyId: string,
  message: string,
): Pick<IntelligenceEnvelopeQuery, 'domains' | 'entityRefs'> {
  const componentKind = COMPONENT_PATTERNS.find(([, pattern]) => pattern.test(message))?.[0];
  if (!componentKind) return {};
  const entityRef: EnvelopeEntityRef = { entityType: 'PROPERTY', entityId: propertyId, componentKind };
  return { domains: ['ASSET_LIFECYCLE'], entityRefs: [entityRef] };
}
