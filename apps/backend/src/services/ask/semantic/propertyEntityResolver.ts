import { z } from 'zod';

export const ASK_PROPERTY_ENTITY_RESOLVER_VERSION = 'property-entity-resolver-0.1.0' as const;

const PropertyEntityCandidateSchema = z.object({
  entityId: z.string().min(1),
  recordId: z.string().min(1),
  safeDisplayLabel: z.string().min(1),
  identityLabels: z.array(z.string().min(1)).min(1),
  authorization: z.enum(['AUTHORISED', 'UNAUTHORISED']),
}).strict();

export type PropertyEntityCandidate = z.infer<typeof PropertyEntityCandidateSchema>;

export type PropertyEntityResolution =
  | { outcome: 'RESOLVED'; entityId: string; recordId: string; safeDisplayLabel: string }
  | { outcome: 'MULTIPLE_MATCHES'; entityId: string; candidates: readonly { recordId: string; safeDisplayLabel: string }[] }
  | { outcome: 'MISSING'; entityId: string }
  | { outcome: 'UNAUTHORISED'; entityId: string }
  | { outcome: 'NOT_APPLICABLE'; entityId: string };

function normalizeIdentity(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim();
}

/**
 * Resolves an already-segmented entity mention against a property-scoped
 * candidate set. The caller owns property authorization and applicability;
 * this function owns deterministic identity matching and non-disclosure.
 */
export function resolvePropertyEntityReference(input: {
  entityId: string;
  mention: string;
  applicable: boolean;
  candidates: readonly PropertyEntityCandidate[];
}): PropertyEntityResolution {
  const entityId = z.string().min(1).parse(input.entityId);
  if (!input.applicable) return { outcome: 'NOT_APPLICABLE', entityId };
  const mention = normalizeIdentity(input.mention);
  if (!mention) return { outcome: 'MISSING', entityId };

  const candidates = z.array(PropertyEntityCandidateSchema).parse(input.candidates)
    .filter((candidate) => candidate.entityId === entityId);
  const matches = candidates.filter((candidate) => candidate.identityLabels
    .some((label) => normalizeIdentity(label) === mention));
  const authorised = matches.filter((candidate) => candidate.authorization === 'AUTHORISED');

  if (authorised.length === 1) {
    const candidate = authorised[0];
    return { outcome: 'RESOLVED', entityId, recordId: candidate.recordId, safeDisplayLabel: candidate.safeDisplayLabel };
  }
  if (authorised.length > 1) {
    return {
      outcome: 'MULTIPLE_MATCHES',
      entityId,
      candidates: authorised.map(({ recordId, safeDisplayLabel }) => ({ recordId, safeDisplayLabel })),
    };
  }
  if (matches.some((candidate) => candidate.authorization === 'UNAUTHORISED')) {
    // Do not return a hidden record id, label, or candidate count.
    return { outcome: 'UNAUTHORISED', entityId };
  }
  return { outcome: 'MISSING', entityId };
}
