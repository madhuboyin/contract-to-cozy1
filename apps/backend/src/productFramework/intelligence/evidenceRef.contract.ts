import { z } from 'zod';

export const EVIDENCE_REF_TYPES = [
  'PROPERTY_FACT',
  'DOCUMENT',
  'HOME_EVENT',
  'USER_INPUT',
  'EXTERNAL_SOURCE',
  'SYSTEM_DERIVATION',
] as const;

export const EVIDENCE_REF_FRESHNESS = ['CURRENT', 'STALE', 'UNKNOWN'] as const;

/** Normalize legacy percentage confidence at a shared contract boundary. */
export function normalizeConfidenceRatio(value: unknown): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const ratio = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(1, ratio));
}

export const ConfidenceRatioSchema = z.preprocess(
  (value) => typeof value === 'number' && Number.isFinite(value)
    ? normalizeConfidenceRatio(value)
    : value,
  z.number().min(0).max(1).nullable(),
);

/** Canonical evidence reference reused by Home Actions and the Envelope. */
export const EvidenceRefSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.enum(EVIDENCE_REF_TYPES),
  label: z.string().trim().min(1).max(240),
  source: z.string().trim().min(1).max(300),
  observedAt: z.string().datetime().nullable(),
  freshness: z.enum(EVIDENCE_REF_FRESHNESS),
  confidence: ConfidenceRatioSchema,
});

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

// Compatibility name for code that speaks in Home Action terms.
export const EvidenceReferenceSchema = EvidenceRefSchema;
export type EvidenceReference = EvidenceRef;
