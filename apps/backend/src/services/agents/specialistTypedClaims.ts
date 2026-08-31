// apps/backend/src/services/agents/specialistTypedClaims.ts
//
// §7.3.9: explanation is LLM-OPTIONAL and the deterministic result is
// authoritative. This is the closed registry the deterministic EXPLAIN tool
// selects from — and the only set a future governed LLM narration step is
// permitted to choose among. Every claim is keyed to an exact engine/source
// reason or limitation code; a code with no registered claim contributes nothing
// (the agent never invents explanatory text or quantitative facts).

import type { AgentContextRequestItem, AgentTypedClaim } from './agentRuntime.contract';
import { REPAIR_REPLACE_PROFILES } from './repairReplaceProfileCatalog';

const REASON_CLAIMS: Readonly<Record<string, string>> = {
  SYSTEM_AT_OR_BEYOND_TYPICAL_LIFESPAN: 'The system is at or beyond the typical service life for its type.',
  SYSTEM_RELATIVELY_NEW: 'The system is still relatively new for its type.',
  CONDITION_POOR: 'The condition recorded for this system is poor.',
  ELEVATED_REPAIR_SPEND: 'Recent repair spending on this system is elevated relative to a replacement.',
  NO_RECENT_REPAIR_SPEND: 'No recent repair spending is recorded for this system.',
  OWNERSHIP_HORIZON_SHORTER_THAN_REMAINING_LIFE: 'Your expected ownership period is shorter than the system’s remaining life.',
  APPROACH_MAXIMIZE_RELIABILITY: 'Your saved preference favors maximizing reliability.',
  APPROACH_MINIMIZE_UPFRONT_COST: 'Your saved preference favors minimizing upfront cost.',
  NO_ACTIVE_WARRANTY: 'No active warranty currently covers this system.',
  ACTIVE_WARRANTY_REDUCES_REPAIR_RISK: 'An active warranty reduces the financial risk of continuing to repair.',
  SOURCE_VERDICT_REPLACE_NOW: 'The current appliance analysis recommends replacing this appliance now.',
  SOURCE_VERDICT_REPLACE_SOON: 'The current appliance analysis recommends planning to replace this appliance soon.',
  SOURCE_VERDICT_REPAIR_AND_MONITOR: 'The current appliance analysis supports repairing this appliance and monitoring future issues and costs.',
  SOURCE_VERDICT_REPAIR_ONLY: 'The current appliance analysis supports repair rather than replacement.',
  CONFIDENCE_HIGH: 'The appliance analysis has high confidence based on the information currently recorded.',
  CONFIDENCE_MEDIUM: 'The appliance analysis has medium confidence based on the information currently recorded.',
  CONFIDENCE_LOW: 'The appliance analysis has low confidence because the recorded information is limited.',
  IMPACT_HIGH: 'The appliance analysis classifies the decision impact as high.',
  IMPACT_MEDIUM: 'The appliance analysis classifies the decision impact as medium.',
  IMPACT_LOW: 'The appliance analysis classifies the decision impact as low.',
  IMPACT_UNKNOWN: 'The appliance analysis does not have a recorded impact level.',
};

interface OutstandingSpec {
  key: string;
  label: string;
  correctionPath: string | null;
  kind: AgentContextRequestItem['kind'];
}

// limitation code -> what the homeowner can supply to remove it. Transient
// lookup-timeout limitations are intentionally absent: they are not a
// homeowner ask (the loop retries, then abstains).
const LIMITATION_OUTSTANDING: Readonly<Record<string, OutstandingSpec>> = {
  INSTALL_DATE_UNKNOWN: {
    key: 'hvac.installDate',
    label: 'When the HVAC system was installed (or its age)',
    correctionPath: 'inventory-item:hvac',
    kind: 'FACT',
  },
  CONDITION_UNKNOWN: {
    key: 'hvac.condition',
    label: 'The current condition of the HVAC system',
    correctionPath: 'inventory-item:hvac',
    kind: 'FACT',
  },
  REPLACEMENT_COST_RANGE_UNAVAILABLE: {
    key: 'hvac.replacementCost',
    label: 'A recorded replacement-cost estimate for this system',
    correctionPath: 'inventory-item:hvac',
    kind: 'FACT',
  },
  NO_TECHNICIAN_ASSESSMENT_ON_FILE: {
    key: 'hvac.technicianAssessment',
    label: 'A technician assessment or written quote for this system',
    correctionPath: 'document-upload:hvac-quote',
    kind: 'DOCUMENT',
  },
};

export const TRANSIENT_LIMITATION_CODES: ReadonlySet<string> = new Set([
  'HVAC_IDENTITY_LOOKUP_TIMED_OUT',
  'HVAC_REPAIR_HISTORY_LOOKUP_TIMED_OUT',
  'HVAC_CURRENT_QUOTE_LOOKUP_TIMED_OUT',
]);

export function selectTypedClaims(
  reasonCodes: readonly string[],
  professionalBoundary?: string,
): AgentTypedClaim[] {
  const seen = new Set<string>();
  const claims: AgentTypedClaim[] = [];
  for (const code of reasonCodes) {
    if (seen.has(code)) continue;
    const text = REASON_CLAIMS[code];
    if (!text) continue;
    seen.add(code);
    const family = code.startsWith('SOURCE_VERDICT_') || code.startsWith('CONFIDENCE_') || code.startsWith('IMPACT_')
      ? 'appliance'
      : 'hvac';
    claims.push({ claimId: `${family}.reason.${code}`, text, sourceCode: code });
  }
  if (professionalBoundary?.trim()) {
    claims.push({
      claimId: 'repair-replace.professional-boundary',
      text: `This guidance does not replace an assessment by a ${professionalBoundary.trim()}.`,
      sourceCode: 'PROFILE_PROFESSIONAL_BOUNDARY',
    });
  }
  return claims;
}

export interface OutstandingSelection {
  facts: AgentContextRequestItem[];
  documents: AgentContextRequestItem[];
  transientOnly: boolean;
}

export function selectOutstanding(limitationCodes: readonly string[]): OutstandingSelection {
  const facts: AgentContextRequestItem[] = [];
  const documents: AgentContextRequestItem[] = [];
  let actionable = 0;
  let transient = 0;
  const seen = new Set<string>();
  for (const code of limitationCodes) {
    if (TRANSIENT_LIMITATION_CODES.has(code)) { transient += 1; continue; }
    const spec = LIMITATION_OUTSTANDING[code];
    if (!spec || seen.has(spec.key)) continue;
    seen.add(spec.key);
    actionable += 1;
    const item: AgentContextRequestItem = { key: spec.key, label: spec.label, correctionPath: spec.correctionPath, kind: spec.kind };
    (spec.kind === 'DOCUMENT' ? documents : facts).push(item);
  }
  return { facts, documents, transientOnly: actionable === 0 && transient > 0 };
}

/**
 * Keys a SUBMIT_CONTEXT intake is permitted to carry — the FACT asks only.
 * Document asks (kind: 'DOCUMENT') are never submitted back through the
 * runtime; they are surfaced as an `outstanding` item with a correction path
 * and resolved by the upload flow, after which the thread recomputes.
 */
export const ACCEPTED_INTAKE_KEYS: ReadonlySet<string> = new Set(
  Object.values(LIMITATION_OUTSTANDING).filter((spec) => spec.kind === 'FACT').map((spec) => spec.key),
);

/** Closed set of canonical inputs a homeowner may dispute through the API. */
export const DISPUTABLE_INPUT_KEYS: ReadonlySet<string> = new Set(
  REPAIR_REPLACE_PROFILES.flatMap((profile) => profile.disputableInputs.map((input) => input.key)),
);

export const DISPUTABLE_INPUT_KEYS_BY_PROFILE: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze(
  Object.fromEntries(REPAIR_REPLACE_PROFILES.map((profile) => [
    profile.profileId,
    new Set(profile.disputableInputs.map((input) => input.key)),
  ])),
);

export function isDisputableInputKey(profileId: string, key: string): boolean {
  return DISPUTABLE_INPUT_KEYS_BY_PROFILE[profileId]?.has(key) ?? false;
}
