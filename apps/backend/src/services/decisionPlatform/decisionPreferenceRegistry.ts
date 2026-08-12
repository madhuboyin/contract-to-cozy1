// DecisionPreferenceDefinition registry — Ask Intelligence FRD §11.2.
// Mirrors the code-based registry pattern in ask/askOperationRegistry.ts
// (frozen map + definition() factory + validate*() startup check). See
// docs/product/decision-platform/adr-0002-preference-registry-and-schema.md.

import type { DecisionPreferenceDefinition } from '../../productFramework/decisionPlatform/decisionPlatform.contract';

export type DecisionPreferenceKey =
  | 'OWNERSHIP_HORIZON'
  | 'REPAIR_REPLACE_APPROACH'
  | 'DECISION_DETAIL_LEVEL';

const definition = (overrides: DecisionPreferenceDefinition): DecisionPreferenceDefinition => overrides;

// FRD §11.2. Only these three keys may enter the first release. Proactive
// category/channel permission is deliberately NOT here — it is owned by the
// central notification/preference policy, not the decision-preference
// registry (see adr-0001, "no duplicate canonical owner").
export const DECISION_PREFERENCE_DEFINITIONS: Readonly<Record<DecisionPreferenceKey, DecisionPreferenceDefinition>> = Object.freeze({
  OWNERSHIP_HORIZON: definition({
    key: 'OWNERSHIP_HORIZON',
    version: '1.0',
    valueSchemaDescription: 'planToSell: boolean; horizonMonths: number | null; confirmedPlanDate: ISODate | null',
    storageClass: 'TEMPORARY_PROFILE',
    allowedSubjectTypes: ['HOUSEHOLD'],
    allowedProvenanceTypes: ['USER_ENTERED', 'SYSTEM_DERIVED', 'DOCUMENT_EXTRACTED', 'IMPORTED_REVIEWED'],
    confirmationRequiredForProvenance: ['SYSTEM_DERIVED', 'DOCUMENT_EXTRACTED', 'IMPORTED_REVIEWED'],
    sensitivityClass: 'SENSITIVE',
    defaultVisibility: 'HOUSEHOLD_SUMMARY',
    defaultValidityMonths: 12,
    reconfirmationPolicy: 'ON_EXPIRY',
    eligibleDecisionDefinitionIds: ['HVAC_REPAIR_REPLACE', 'SELL_PREP'],
    correctionRoute: '/dashboard/settings/decision-preferences/ownership-horizon',
    sharedExplanationPermitted: true,
    materialForRanking: true,
  }),
  REPAIR_REPLACE_APPROACH: definition({
    key: 'REPAIR_REPLACE_APPROACH',
    version: '1.0',
    valueSchemaDescription: 'approach: "MINIMIZE_UPFRONT_COST" | "MINIMIZE_LONG_TERM_COST" | "MAXIMIZE_RELIABILITY"',
    storageClass: 'TEMPORARY_PROFILE',
    allowedSubjectTypes: ['USER', 'HOUSEHOLD'],
    allowedProvenanceTypes: ['USER_ENTERED', 'SYSTEM_DERIVED', 'DOCUMENT_EXTRACTED', 'IMPORTED_REVIEWED'],
    confirmationRequiredForProvenance: ['SYSTEM_DERIVED', 'DOCUMENT_EXTRACTED', 'IMPORTED_REVIEWED'],
    sensitivityClass: 'STANDARD',
    defaultVisibility: 'HOUSEHOLD_SUMMARY',
    defaultValidityMonths: 12,
    reconfirmationPolicy: 'ON_EXPIRY',
    eligibleDecisionDefinitionIds: ['HVAC_REPAIR_REPLACE'],
    correctionRoute: '/dashboard/settings/decision-preferences/repair-replace-approach',
    sharedExplanationPermitted: true,
    materialForRanking: true,
  }),
  DECISION_DETAIL_LEVEL: definition({
    key: 'DECISION_DETAIL_LEVEL',
    version: '1.0',
    valueSchemaDescription: 'level: "CONCISE" | "STANDARD" | "DETAILED"',
    storageClass: 'DURABLE_PROFILE',
    allowedSubjectTypes: ['USER'],
    allowedProvenanceTypes: ['USER_ENTERED', 'SYSTEM_DERIVED', 'DOCUMENT_EXTRACTED', 'IMPORTED_REVIEWED'],
    confirmationRequiredForProvenance: ['SYSTEM_DERIVED', 'DOCUMENT_EXTRACTED', 'IMPORTED_REVIEWED'],
    sensitivityClass: 'STANDARD',
    defaultVisibility: 'PRIVATE',
    defaultValidityMonths: null,
    reconfirmationPolicy: 'NONE',
    eligibleDecisionDefinitionIds: ['HVAC_REPAIR_REPLACE'],
    correctionRoute: '/dashboard/settings/decision-preferences/decision-detail-level',
    sharedExplanationPermitted: false,
    // FRD §11.2: "Presentation only; never material ranking."
    materialForRanking: false,
  }),
});

export function getDecisionPreferenceDefinition(key: DecisionPreferenceKey): DecisionPreferenceDefinition {
  return DECISION_PREFERENCE_DEFINITIONS[key];
}

export function validateDecisionPreferenceRegistry(): string[] {
  const issues: string[] = [];
  const keys = new Set<string>();
  for (const [mapKey, entry] of Object.entries(DECISION_PREFERENCE_DEFINITIONS)) {
    if (mapKey !== entry.key) issues.push(`${mapKey}: key mismatch`);
    if (keys.has(entry.key)) issues.push(`${mapKey}: duplicate key`);
    keys.add(entry.key);
    if (!entry.version || !entry.valueSchemaDescription) issues.push(`${mapKey}: missing version or value schema description`);
    if (!entry.allowedSubjectTypes.length) issues.push(`${mapKey}: no allowed subject types`);
    if (!entry.allowedProvenanceTypes.length) issues.push(`${mapKey}: no allowed provenance types`);
    if (!entry.eligibleDecisionDefinitionIds.length) issues.push(`${mapKey}: no eligible decision definitions declared`);
    if (!entry.correctionRoute) issues.push(`${mapKey}: no correction route declared`);
    // Zero-tolerance gate (FRD §22.2): a presentation-only preference must
    // never be declared eligible to affect a material result.
    if (!entry.materialForRanking && entry.sharedExplanationPermitted) {
      issues.push(`${mapKey}: presentation-only preference should not claim a shared material explanation`);
    }
    for (const provenance of entry.confirmationRequiredForProvenance) {
      if (!entry.allowedProvenanceTypes.includes(provenance)) {
        issues.push(`${mapKey}: confirmationRequiredForProvenance references a provenance type not in allowedProvenanceTypes`);
      }
    }
  }
  return issues;
}
