// Home Intelligence Functional Completeness FRD Phase 4 review finding 1 —
// completionEvidencePolicy.registry.ts's COMPLETION_EVIDENCE_POLICY (HI-
// OUT-002) was only ever consumed by homeActionCompletion.service.ts's
// quick-complete gate. That gate explicitly redirects REGULATED_COVERAGE
// and SAFETY_EMERGENCY work ("attestation: INSUFFICIENT") to "Manage
// action" -- homeOperations.controller.ts's approveMaterialWorkHandler --
// but that path never consulted the same registry: any evidenceType
// satisfied REGULATED_COVERAGE, "verification" was a self-referential status
// flip with no proof the evidenceEntityId was a real domain record, and
// policy/claim linkage was never checked at all. This module is the policy
// gate approveMaterialWorkHandler was missing.
import type { OperationalWorkEvidenceType, RecommendationSafetyTier } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { evidencePolicyFor } from './homeActionCompletion.service';
import type { CompletionEvidencePolicyEntry } from './intelligence/completionEvidencePolicy.registry';

export class MaterialApprovalEvidencePolicyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaterialApprovalEvidencePolicyViolationError';
  }
}

// The FRD table's two record-evidence tiers both read as "a domain record
// or a document" (REGULATED_COVERAGE: "Domain completion record or document
// evidence"; SAFETY_EMERGENCY: "evidence or qualified-professional
// confirmation" -- DOCUMENT covers photographic/uploaded evidence, and
// DOMAIN_COMPLETION_RECORD covers a qualified professional's linked
// completion). requiresDomainOwnedResolution (checked separately below)
// is what actually forces SAFETY_EMERGENCY past a plain document.
const RECORD_EVIDENCE_ALLOWED_TYPES: Partial<Record<CompletionEvidencePolicyEntry['recordEvidence'], ReadonlySet<OperationalWorkEvidenceType>>> = {
  DOMAIN_RECORD_OR_DOCUMENT: new Set(['DOMAIN_COMPLETION_RECORD', 'DOCUMENT']),
  EVIDENCE_OR_PROFESSIONAL_CONFIRMATION: new Set(['DOMAIN_COMPLETION_RECORD', 'DOCUMENT']),
};

interface WorkItemForEvidenceCheck {
  id: string;
  propertyId: string;
  safetyTier: RecommendationSafetyTier;
  sources: ReadonlyArray<{ sourceEntityId: string }>;
  executions: ReadonlyArray<{ executionEntityId: string }>;
}

/**
 * A DOMAIN_COMPLETION_RECORD evidenceEntityId is client-supplied and must
 * not be trusted as an opaque string (recordEvidence.usecase.ts takes it
 * straight from the request body). "Domain-owned" here means it resolves to
 * one of: a source/execution record already linked to this exact work item
 * (the strongest proof -- it's the obligation's own tracked record), or an
 * independently terminal Claim/Booking/PropertyMaintenanceTask for this
 * property. This also satisfies REGULATED_COVERAGE's "policy/claim linkage
 * where applicable" -- a Claim match IS the claim linkage.
 */
async function domainCompletionRecordIsVerifiable(
  item: WorkItemForEvidenceCheck,
  evidenceEntityId: string,
): Promise<boolean> {
  if (item.sources.some((source) => source.sourceEntityId === evidenceEntityId)) return true;
  if (item.executions.some((execution) => execution.executionEntityId === evidenceEntityId)) return true;

  const [claim, booking, task] = await Promise.all([
    prisma.claim.findFirst({ where: { id: evidenceEntityId, propertyId: item.propertyId, status: { in: ['APPROVED', 'DENIED'] } }, select: { id: true } }),
    prisma.booking.findFirst({ where: { id: evidenceEntityId, propertyId: item.propertyId, status: 'COMPLETED' }, select: { id: true } }),
    prisma.propertyMaintenanceTask.findFirst({ where: { id: evidenceEntityId, propertyId: item.propertyId, status: 'COMPLETED' }, select: { id: true } }),
  ]);
  return Boolean(claim || booking || task);
}

/**
 * HI-OUT-002, enforced at the "Manage action" approval boundary. Throws
 * before any mutation -- approveMaterialWorkHandler must call this before
 * marking evidence VERIFIED or approving the work item.
 */
export async function assertMaterialApprovalEvidenceSatisfiesPolicy(
  item: WorkItemForEvidenceCheck,
  evidence: { evidenceType: OperationalWorkEvidenceType; evidenceEntityId: string },
): Promise<void> {
  const policy = evidencePolicyFor(item.safetyTier);

  const allowedTypes = RECORD_EVIDENCE_ALLOWED_TYPES[policy.recordEvidence];
  if (allowedTypes && !allowedTypes.has(evidence.evidenceType)) {
    throw new MaterialApprovalEvidencePolicyViolationError(
      `${item.safetyTier} work requires evidence of type ${[...allowedTypes].join(' or ')}. ${policy.minimumCompletionBehavior}`,
    );
  }

  if (policy.requiresDomainOwnedResolution) {
    if (evidence.evidenceType !== 'DOMAIN_COMPLETION_RECORD') {
      throw new MaterialApprovalEvidencePolicyViolationError(
        `${item.safetyTier} work requires a verified domain completion record, not only a document. ${policy.minimumCompletionBehavior}`,
      );
    }
    if (!(await domainCompletionRecordIsVerifiable(item, evidence.evidenceEntityId))) {
      throw new MaterialApprovalEvidencePolicyViolationError(
        'This evidence does not correspond to a verifiable domain completion record linked to this work.',
      );
    }
    return;
  }

  if (policy.policyOrClaimLinkage === 'WHEN_APPLICABLE' && evidence.evidenceType === 'DOMAIN_COMPLETION_RECORD') {
    if (!(await domainCompletionRecordIsVerifiable(item, evidence.evidenceEntityId))) {
      throw new MaterialApprovalEvidencePolicyViolationError(
        'This evidence does not correspond to a verifiable domain, policy, or claim record for this work.',
      );
    }
  }
}
