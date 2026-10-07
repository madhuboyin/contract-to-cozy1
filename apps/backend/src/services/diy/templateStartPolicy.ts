// The revision-level rules for starting a project from a template, in one place so the page, the Ask template card and the Ask confirmation cannot
// disagree (docs/architecture/ASK_COZY_DIY_PROJECT_START_PLAN.md section 3.2). Pure: property applicability needs the property's context and is evaluated
// separately (diy/applicabilityPolicy) by the caller.
import type { DiyDecisionVerdict, DiyTemplateRevision } from '@prisma/client';
import { checkRevisionIntegrity } from '../diyTemplateRevision.service';
import { eligibilityInputFromRevision } from '../diyPublishedTemplate';
import { evaluateDiyEligibility, type DiyEligibilityDecision } from './eligibilityPolicy';

export type TemplateStartRefusal =
  | { ok: false; code: 'DIY_TEMPLATE_UNAVAILABLE'; status: 409; message: string; integrity: 'MISMATCH' | 'NOT_GOVERNED' }
  | { ok: false; code: 'DIY_NOT_LOW_RISK'; status: 409; message: string; eligibility: DiyEligibilityDecision };

/**
 * `requireGoverned` is the Ask rule: only a governed revision (reviewed and approved) with a verified hash is ever started from Ask. The page keeps accepting
 * a legacy-backfill revision (it carries no hash and makes no review claim) so templates live before revisions existed keep working. A governed revision with
 * a missing or non-matching hash is never usable by either.
 */
export function evaluateTemplateStart(
  revision: DiyTemplateRevision,
  options: { requireGoverned: boolean; decisionVerdict?: DiyDecisionVerdict | null },
): { ok: true } | TemplateStartRefusal {
  if (checkRevisionIntegrity(revision) === 'MISMATCH') {
    return { ok: false, code: 'DIY_TEMPLATE_UNAVAILABLE', status: 409, message: 'This template is temporarily unavailable.', integrity: 'MISMATCH' };
  }
  if (options.requireGoverned && (revision.provenance !== 'GOVERNED' || checkRevisionIntegrity(revision) !== 'VERIFIED')) {
    return { ok: false, code: 'DIY_TEMPLATE_UNAVAILABLE', status: 409, message: 'This template is temporarily unavailable.', integrity: 'NOT_GOVERNED' };
  }
  const eligibility = evaluateDiyEligibility(eligibilityInputFromRevision(revision, options.decisionVerdict));
  if (!eligibility.eligible) {
    return { ok: false, code: 'DIY_NOT_LOW_RISK', status: 409, message: 'Only reviewed, low-risk, non-regulated work can be started as a DIY project.', eligibility };
  }
  return { ok: true };
}
