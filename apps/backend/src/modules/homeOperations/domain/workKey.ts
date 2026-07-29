import type { OperationalObligationType } from '@prisma/client';

export type WorkSubject =
  | { type: 'INVENTORY_ITEM'; id: string }
  | { type: 'FINDING'; id: string }
  | { type: 'PROJECT'; id: string }
  | { type: 'PROPERTY'; id: string };

export interface WorkKeyOccurrence {
  /**
   * Stable slug for the obligation itself, e.g. "filter-replacement",
   * "resolve", "replacement-decision", "execution". This — not free-text
   * title/copy — is what source adapters must assert; it never changes when
   * source copy changes.
   */
  obligationSlug: string;
  /** Recurrence bucket, e.g. "2026-08". Omit for one-shot obligations. */
  occurrenceKey?: string;
}

export interface WorkKeyInput {
  propertyId: string;
  subject: WorkSubject;
  obligationType: OperationalObligationType;
  occurrence: WorkKeyOccurrence;
}

/**
 * Strict slugifier: lowercase, [a-z0-9-] only, collapsed repeats. Throws
 * rather than silently collapsing an empty result, so two structurally
 * different obligations can never accidentally collide on an empty segment.
 */
function slugify(value: string, fieldLabel: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) {
    throw new Error(`resolveWorkKey: ${fieldLabel} produced an empty slug from "${value}"`);
  }
  return slug;
}

function subjectSegment(subject: WorkSubject): string | null {
  switch (subject.type) {
    case 'INVENTORY_ITEM':
      return `inventory:${slugify(subject.id, 'subject.id')}`;
    case 'FINDING':
      return `finding:${slugify(subject.id, 'subject.id')}`;
    case 'PROJECT':
      return `project:${slugify(subject.id, 'subject.id')}`;
    case 'PROPERTY':
      // Subject *is* the property — no redundant segment, matching every
      // literal example in the parent plan (section 7.5).
      return null;
    default: {
      const exhaustiveCheck: never = subject;
      throw new Error(`resolveWorkKey: unknown subject type ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

/**
 * Stable, property-scoped identity for one homeowner obligation, built only
 * from structured fields an adapter must explicitly assert (never from
 * title/copy) — so it is stable by construction across source recalculation.
 *
 * Format: property:{propertyId}:{subjectSegment}:{obligationSlug}[:{occurrenceKey}]
 *
 * Deliberately does not try to unify with homeActionCanonicalKey()
 * (apps/backend/src/services/homeActions.service.ts — an in-memory-only,
 * free-text-based, per-request dedup heuristic, never persisted) or with
 * PropertyMaintenanceTask.actionKey / HomeAction.id (their own established
 * formats, left untouched by this slice). This is a new, separate identity
 * that existing domain records link into via OperationalWorkSource /
 * OperationalWorkExecution.
 */
export function resolveWorkKey(input: WorkKeyInput): string {
  const propertySegment = slugify(input.propertyId, 'propertyId');
  const segments = [`property:${propertySegment}`];

  const subject = subjectSegment(input.subject);
  if (subject) segments.push(subject);

  segments.push(slugify(input.occurrence.obligationSlug, 'occurrence.obligationSlug'));

  if (input.occurrence.occurrenceKey) {
    segments.push(slugify(input.occurrence.occurrenceKey, 'occurrence.occurrenceKey'));
  }

  return segments.join(':');
}
