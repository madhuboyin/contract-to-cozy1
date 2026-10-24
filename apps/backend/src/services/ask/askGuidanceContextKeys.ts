// How Ask treats each missing-context key a guided journey can carry. The keys are task flags the backend writes (guidanceContextKeys.ts), not
// form fields, so most cannot be collected in Ask; this table says so per key, in homeowner words, and fails closed:
//   - a key not listed here is "information Ask cannot collect yet" with generic copy (the raw key never reaches the homeowner; it is logged once),
//   - an entry must carry a label, an explanation and one resolution, and a resolution that points at a capture or an operation must name it.
// Resolutions: CAPTURE_FIELD (Ask collects one canonical field and the named owner writes it), RUN_OPERATION (a registered Ask operation resolves it,
// offered as a governed action), UNAVAILABLE (Ask cannot resolve it). Nothing here writes anything.

import { GUIDANCE_CONTEXT_KEYS, skippedStepKeyFrom } from '../guidanceEngine/guidanceContextKeys';
import { logger } from '../../lib/logger';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from './askOperationRegistry';

export type GuidanceContextResolution =
  | { type: 'CAPTURE_FIELD'; schema: string; field: string; canonicalOwner: string }
  | { type: 'RUN_OPERATION'; operationId: AskOperationId; message: string; label: string }
  | { type: 'UNAVAILABLE' };

export interface GuidanceContextKeyEntry {
  label: string;
  explanation: string;
  resolution: GuidanceContextResolution;
  /** The household role needed to act on the resolution; omitted when anyone who can read the journey may. */
  minimumRole?: 'CONTRIBUTOR';
}

export const GUIDANCE_CONTEXT_FALLBACK_LABEL = 'More information';
export const GUIDANCE_CONTEXT_FALLBACK = 'This journey needs additional information that Ask can’t collect yet.';
const UNAVAILABLE = { type: 'UNAVAILABLE' } as const;

export const ASK_GUIDANCE_CONTEXT_KEYS: Record<string, GuidanceContextKeyEntry> = {
  [GUIDANCE_CONTEXT_KEYS.REFRESH_SIGNAL]: {
    label: 'Up-to-date information',
    explanation: 'What this journey is based on has gone out of date, so its advice may not reflect your home today.',
    resolution: UNAVAILABLE,
  },
  [GUIDANCE_CONTEXT_KEYS.INVENTORY_ITEM_LINK]: {
    label: 'A linked home item',
    explanation: 'This journey is not tied to a specific item in your home inventory.',
    resolution: UNAVAILABLE,
  },
};

/** The `skipped:<step>` marker: a step the plan relies on was skipped. Its text names the step when the journey's steps are known. */
const SKIPPED_STEP_ENTRY = (stepLabel: string | null): GuidanceContextKeyEntry => ({
  label: stepLabel ? `Skipped: ${stepLabel}` : 'A skipped step',
  explanation: 'You skipped a step this plan relies on, so its advice rests on less.',
  resolution: UNAVAILABLE,
});

export interface ClassifiedGuidanceContextKey extends GuidanceContextKeyEntry { known: boolean }

export function classifyGuidanceContextKey(key: string, stepLabels?: ReadonlyMap<string, string>): ClassifiedGuidanceContextKey {
  const skipped = skippedStepKeyFrom(key);
  if (skipped !== null) return { ...SKIPPED_STEP_ENTRY(stepLabels?.get(skipped) ?? null), known: true };
  const entry = Object.prototype.hasOwnProperty.call(ASK_GUIDANCE_CONTEXT_KEYS, key) ? ASK_GUIDANCE_CONTEXT_KEYS[key] : null;
  if (entry && validateEntry(key, entry).length === 0) return { ...entry, known: true };
  return { label: GUIDANCE_CONTEXT_FALLBACK_LABEL, explanation: GUIDANCE_CONTEXT_FALLBACK, resolution: UNAVAILABLE, known: false };
}

/** Why an entry is not usable, or nothing. Used when classifying (a bad entry is treated as unknown) and by the coverage test. */
export function validateEntry(key: string, entry: GuidanceContextKeyEntry): string[] {
  const issues: string[] = [];
  if (!entry.label?.trim()) issues.push(`${key}: missing homeowner label`);
  if (!entry.explanation?.trim()) issues.push(`${key}: missing homeowner explanation`);
  const resolution = entry.resolution;
  if (!resolution) issues.push(`${key}: missing resolution`);
  else if (resolution.type === 'CAPTURE_FIELD') {
    if (!resolution.schema?.trim() || !resolution.field?.trim()) issues.push(`${key}: CAPTURE_FIELD must name its schema and field`);
    if (!resolution.canonicalOwner?.trim()) issues.push(`${key}: CAPTURE_FIELD must name the canonical write owner`);
  } else if (resolution.type === 'RUN_OPERATION') {
    if (!ASK_OPERATION_DEFINITIONS[resolution.operationId]) issues.push(`${key}: RUN_OPERATION names an unregistered operation`);
    if (!resolution.message?.trim() || !resolution.label?.trim()) issues.push(`${key}: RUN_OPERATION must carry its governed action copy`);
  } else if (resolution.type !== 'UNAVAILABLE') issues.push(`${key}: unknown resolution type`);
  return issues;
}

export function validateGuidanceContextKeyTable(table: Readonly<Record<string, GuidanceContextKeyEntry>> = ASK_GUIDANCE_CONTEXT_KEYS): string[] {
  return Object.entries(table).flatMap(([key, entry]) => validateEntry(key, entry));
}

const reported = new Set<string>();
/** Coverage telemetry: an unrecognised key is logged once per process, with the raw key, and never shown to the homeowner. */
export function reportUnclassifiedGuidanceContextKey(key: string): void {
  if (reported.has(key)) return;
  reported.add(key);
  logger.warn({ guidanceContextKey: key.slice(0, 120) }, '[ASK] guidance journey carries a missing-context key Ask does not classify');
}
