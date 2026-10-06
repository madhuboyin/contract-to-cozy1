// apps/backend/src/services/diyTemplateRevision.service.ts
//
// Immutable published DIY template revisions (docs/architecture/ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md, slice 1a).
//
// The template row is the editable WORKING COPY. A revision is a hashed snapshot of that copy taken at submit-for-review; approval is recorded
// against the revision, and publishing promotes an approved revision to be the template's published head. This module is the ONLY writer of
// `diyTemplateRevision`, and it deliberately has no function that changes a revision's content columns or contentJson: a revision's content is
// written once, in createCandidateRevision. Prisma cannot make columns write-once, so immutability is tamper-evident rather than tamper-proof:
// the content hash is recomputed at publish (and, in slice 1c, at every project creation) and a mismatch refuses the operation. A test fails if any
// other source file writes `diyTemplateRevision`.
//
// Every function takes the caller's transaction client. Each state change is a conditional write (`updateMany` on the expected state), so a stale
// actor cannot overwrite a newer state; callers must run the calls that belong together in ONE transaction.
import { createHash } from 'crypto';
import type { DiyRevisionRetiredReason, Prisma } from '@prisma/client';

export type RevisionDb = Pick<Prisma.TransactionClient, 'diyProjectTemplate' | 'diyTemplateRevision'>;

export type RevisionErrorCode =
  | 'TEMPLATE_NOT_FOUND'
  | 'REVISION_NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'REVISION_STATE_CONFLICT'
  | 'REVISION_NOT_APPROVED'
  | 'INTEGRITY_FAILED'
  | 'WORKING_COPY_CHANGED'
  | 'HIGH_SAFETY_SEPARATION_REQUIRED';

export class DiyTemplateRevisionError extends Error {
  code: RevisionErrorCode;
  constructor(code: RevisionErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'DiyTemplateRevisionError';
  }
}

// ── Canonical content and hash ────────────────────────────────────────────────

/** The typed columns a revision stores (and a template row carries); the order here is the order they are hashed in. */
export const REVISION_COLUMN_KEYS = [
  'slug', 'title', 'shortDescription', 'category', 'difficultyLevel', 'requiredSkillLevel', 'safetyLevel', 'permitRequirement',
  'estimatedMinutes', 'estimatedMaterialCostMinCents', 'estimatedMaterialCostMaxCents', 'professionalCostMinCents', 'professionalCostMaxCents', 'tags',
] as const;
type ColumnKey = (typeof REVISION_COLUMN_KEYS)[number];
export type RevisionColumns = Record<ColumnKey, unknown>;

export interface RevisionContentJson {
  longDescription: string | null;
  steps: Array<Record<string, unknown>>;
  materials: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
}

export interface RevisionContent { columns: RevisionColumns; contentJson: RevisionContentJson }

const nullable = (value: unknown) => (value === undefined ? null : value);

/** JSON with sorted object keys, undefined as null and dates as ISO strings, so equal content always serializes identically. */
export function canonicalStringify(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (input === undefined || input === null) return null;
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) return input.map(normalize);
    if (typeof input === 'object') {
      return Object.keys(input as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalize((input as Record<string, unknown>)[key]);
        return acc;
      }, {});
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function computeContentHash(content: RevisionContent): string {
  return createHash('sha256').update(canonicalStringify({ columns: content.columns, contentJson: content.contentJson })).digest('hex');
}

const byNumber = (field: string) => (a: Record<string, unknown>, b: Record<string, unknown>) => Number(a[field] ?? 0) - Number(b[field] ?? 0);
const byOrderThenName = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || String(a.name ?? '').localeCompare(String(b.name ?? ''));

const pick = (source: Record<string, unknown>, keys: readonly string[]) => keys.reduce<Record<string, unknown>>((acc, key) => {
  acc[key] = nullable(source[key]);
  return acc;
}, {});

const STEP_KEYS = ['stepNumber', 'title', 'description', 'estimatedMinutes', 'safetyNote', 'tipNote', 'imageUrl', 'isOptional'] as const;
const MATERIAL_KEYS = ['name', 'description', 'unit', 'quantityFormula', 'unitPriceCents', 'isOptional', 'purchaseNote', 'sortOrder'] as const;
const TOOL_KEYS = ['name', 'canonicalId', 'description', 'isRequired', 'defaultToolAction', 'rentDailyPriceCents', 'buyEstimatePriceCents', 'sortOrder'] as const;

/** The reviewable content of a template working copy (a row plus its steps, materials and tools), in a deterministic order. */
export function buildRevisionContent(template: Record<string, any>): RevisionContent {
  const columns = pick(template, REVISION_COLUMN_KEYS) as RevisionColumns;
  columns.tags = Array.isArray(template.tags) ? [...template.tags] : [];
  const rows = (list: unknown): Array<Record<string, unknown>> => (Array.isArray(list) ? (list as Array<Record<string, unknown>>) : []);
  return {
    columns,
    contentJson: {
      longDescription: nullable(template.longDescription) as string | null,
      steps: rows(template.steps).map((step) => pick(step, STEP_KEYS)).sort(byNumber('stepNumber')),
      materials: rows(template.materials).map((material) => pick(material, MATERIAL_KEYS)).sort(byOrderThenName),
      tools: rows(template.tools).map((tool) => pick(tool, TOOL_KEYS)).sort(byOrderThenName),
    },
  };
}

/** A stored revision row read back as content, for recomputing its hash. */
export function revisionRowContent(row: Record<string, any>): RevisionContent {
  const columns = pick(row, REVISION_COLUMN_KEYS) as RevisionColumns;
  columns.tags = Array.isArray(row.tags) ? [...row.tags] : [];
  return { columns, contentJson: row.contentJson as RevisionContentJson };
}

export type RevisionIntegrity = 'VERIFIED' | 'LEGACY_UNVERIFIED' | 'MISMATCH';

/**
 * VERIFIED: a governed revision whose stored hash matches its stored content. LEGACY_UNVERIFIED: a backfilled revision, which carries no hash and
 * makes no integrity or review claim. MISMATCH: a governed revision with a missing or non-matching hash (never usable).
 */
export function checkRevisionIntegrity(row: Record<string, any>): RevisionIntegrity {
  if (row.provenance === 'LEGACY_BACKFILL') return row.contentHash == null ? 'LEGACY_UNVERIFIED' : computeContentHash(revisionRowContent(row)) === row.contentHash ? 'VERIFIED' : 'MISMATCH';
  return row.contentHash != null && computeContentHash(revisionRowContent(row)) === row.contentHash ? 'VERIFIED' : 'MISMATCH';
}

// ── Revision writes ───────────────────────────────────────────────────────────

const WORKING_COPY_INCLUDE = {
  steps: { orderBy: { stepNumber: 'asc' as const } },
  materials: { orderBy: { sortOrder: 'asc' as const } },
  tools: { orderBy: { sortOrder: 'asc' as const } },
};

const isUniqueViolation = (error: unknown) => Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');

/** A candidate is open until it is returned, published or retired. */
const OPEN_CANDIDATE = { returnedAt: null, publishedAt: null, retiredAt: null };

/**
 * Snapshots the template's working copy as the next revision (the one submitted for review). At most one candidate is open per template. The
 * revision number is allocated here; two concurrent submissions collide on the (templateId, revision) unique key and the loser gets
 * REVISION_CONFLICT instead of a duplicate.
 */
export async function createCandidateRevision(db: RevisionDb, input: { templateId: string; actorId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const template = await db.diyProjectTemplate.findUnique({ where: { id: input.templateId }, include: WORKING_COPY_INCLUDE });
  if (!template) throw new DiyTemplateRevisionError('TEMPLATE_NOT_FOUND', `No DIY template with id "${input.templateId}".`);

  const open = await db.diyTemplateRevision.findFirst({ where: { templateId: input.templateId, ...OPEN_CANDIDATE }, select: { id: true } });
  if (open) throw new DiyTemplateRevisionError('REVISION_STATE_CONFLICT', 'This template already has a revision awaiting review or publication.');

  const latest = await db.diyTemplateRevision.findFirst({ where: { templateId: input.templateId }, orderBy: { revision: 'desc' }, select: { revision: true } });
  const content = buildRevisionContent(template);
  try {
    return await db.diyTemplateRevision.create({
      data: {
        templateId: input.templateId,
        revision: (latest?.revision ?? 0) + 1,
        ...(content.columns as Record<string, unknown>),
        contentJson: content.contentJson as unknown as Prisma.InputJsonValue,
        contentHash: computeContentHash(content),
        provenance: 'GOVERNED',
        submittedBy: input.actorId,
        submittedAt: now,
      } as Prisma.DiyTemplateRevisionUncheckedCreateInput,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DiyTemplateRevisionError('REVISION_CONFLICT', 'Another submission for this template was recorded first. Reload and try again.');
    throw error;
  }
}

/** Records the approval on the candidate revision. Only an open, governed, not-yet-approved candidate can be approved. */
export async function approveRevision(db: RevisionDb, input: { revisionId: string; actorId: string; now?: Date }) {
  const claimed = await db.diyTemplateRevision.updateMany({
    where: { id: input.revisionId, provenance: 'GOVERNED', approvedAt: null, ...OPEN_CANDIDATE },
    data: { approvedBy: input.actorId, approvedAt: input.now ?? new Date() },
  });
  if (claimed.count === 0) throw new DiyTemplateRevisionError('REVISION_STATE_CONFLICT', 'This revision is not open for approval (it may already be approved, returned, published or retired).');
}

/** Marks an open candidate as returned to draft. It stays as history and can never be published. */
export async function returnRevision(db: RevisionDb, input: { revisionId: string; now?: Date }) {
  const claimed = await db.diyTemplateRevision.updateMany({
    where: { id: input.revisionId, ...OPEN_CANDIDATE },
    data: { returnedAt: input.now ?? new Date() },
  });
  if (claimed.count === 0) throw new DiyTemplateRevisionError('REVISION_STATE_CONFLICT', 'This revision is not open (it may already be returned, published or retired).');
}

/**
 * Promotes an approved candidate to the template's published head. Refuses unless the revision is governed, approved, still open, intact (its
 * stored hash matches its stored content) and still equal to the template's working copy; a HIGH-safety revision cannot be published by the actor
 * who approved it. The previous head, if any, is retired as SUPERSEDED. Conditional writes make a stale or concurrent publish fail whole.
 */
export async function publishRevision(db: RevisionDb, input: { templateId: string; revisionId: string; actorId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const revision = await db.diyTemplateRevision.findFirst({ where: { id: input.revisionId, templateId: input.templateId } });
  if (!revision) throw new DiyTemplateRevisionError('REVISION_NOT_FOUND', 'That revision does not belong to this template.');
  if (revision.provenance !== 'GOVERNED' || !revision.approvedAt || !revision.approvedBy || revision.returnedAt || revision.publishedAt || revision.retiredAt) {
    throw new DiyTemplateRevisionError('REVISION_NOT_APPROVED', 'Only an approved, open, governed revision can be published.');
  }
  if (checkRevisionIntegrity(revision) !== 'VERIFIED') {
    throw new DiyTemplateRevisionError('INTEGRITY_FAILED', 'The stored content of this revision does not match its recorded hash.');
  }
  if (revision.safetyLevel === 'HIGH' && revision.approvedBy === input.actorId) {
    throw new DiyTemplateRevisionError('HIGH_SAFETY_SEPARATION_REQUIRED', 'HIGH-safety templates must be published by a different administrator than the one who approved them.');
  }

  const template = await db.diyProjectTemplate.findUnique({ where: { id: input.templateId }, include: WORKING_COPY_INCLUDE });
  if (!template) throw new DiyTemplateRevisionError('TEMPLATE_NOT_FOUND', `No DIY template with id "${input.templateId}".`);
  if (computeContentHash(buildRevisionContent(template)) !== revision.contentHash) {
    throw new DiyTemplateRevisionError('WORKING_COPY_CHANGED', 'The template was edited after this revision was approved. Return it to draft and submit the new content for review.');
  }

  const previousHeadId: string | null = template.publishedRevisionId ?? null;
  if (previousHeadId) {
    const retired = await db.diyTemplateRevision.updateMany({
      where: { id: previousHeadId, retiredAt: null },
      data: { retiredAt: now, retiredReason: 'SUPERSEDED' },
    });
    if (retired.count === 0) throw new DiyTemplateRevisionError('REVISION_STATE_CONFLICT', 'The current published revision changed while publishing. Reload and try again.');
  }
  const published = await db.diyTemplateRevision.updateMany({
    where: { id: revision.id, ...OPEN_CANDIDATE },
    data: { publishedBy: input.actorId, publishedAt: now },
  });
  if (published.count === 0) throw new DiyTemplateRevisionError('REVISION_STATE_CONFLICT', 'This revision is no longer open for publication.');
  const head = await db.diyProjectTemplate.updateMany({
    where: { id: input.templateId, publishedRevisionId: previousHeadId },
    data: { publishedRevisionId: revision.id },
  });
  if (head.count === 0) throw new DiyTemplateRevisionError('REVISION_STATE_CONFLICT', 'The template\'s published revision changed while publishing. Reload and try again.');
  return { publishedRevisionId: revision.id, retiredRevisionId: previousHeadId };
}

/** Withdraws the published head (unpublish or archive): retires it with the reason and clears the template's pointer. Null when nothing was live. */
export async function retireHead(db: RevisionDb, input: { templateId: string; reason: Exclude<DiyRevisionRetiredReason, 'SUPERSEDED'>; now?: Date }) {
  const template = await db.diyProjectTemplate.findUnique({ where: { id: input.templateId }, select: { id: true, publishedRevisionId: true } });
  if (!template) throw new DiyTemplateRevisionError('TEMPLATE_NOT_FOUND', `No DIY template with id "${input.templateId}".`);
  const headId = template.publishedRevisionId;
  if (!headId) return null;
  const retired = await db.diyTemplateRevision.updateMany({ where: { id: headId, retiredAt: null }, data: { retiredAt: input.now ?? new Date(), retiredReason: input.reason } });
  const cleared = await db.diyProjectTemplate.updateMany({ where: { id: input.templateId, publishedRevisionId: headId }, data: { publishedRevisionId: null } });
  if (retired.count === 0 || cleared.count === 0) throw new DiyTemplateRevisionError('REVISION_STATE_CONFLICT', 'The published revision changed while it was being withdrawn. Reload and try again.');
  return { retiredRevisionId: headId };
}
