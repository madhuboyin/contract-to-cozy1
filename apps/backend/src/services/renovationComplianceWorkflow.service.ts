import { prisma } from '../config/database';
import { APIError } from '../middleware/error.middleware';
import { getRenovationCase, linkContributor } from './renovationCase.service';
import { resolvePropertyAccess } from './propertyAccess.service';
import { hoaComplianceService } from './hoaCompliance.service';

async function caseScope(propertyId: string, renovationCaseId: string, scopeVersionId?: string) {
  const renovationCase = await prisma.renovationCase.findFirst({
    where: { id: renovationCaseId, propertyId, archivedAt: null },
    select: { id: true, currentScopeVersionId: true },
  });
  if (!renovationCase?.currentScopeVersionId) {
    throw new APIError('Renovation case or current scope not found.', 404, 'RENOVATION_CASE_SCOPE_NOT_FOUND');
  }
  const resolvedScopeId = scopeVersionId ?? renovationCase.currentScopeVersionId;
  const scope = await prisma.renovationScopeVersion.findFirst({
    where: { id: resolvedScopeId, renovationCaseId },
    select: { id: true },
  });
  if (!scope) {
    throw new APIError('Scope version must belong to this renovation case.', 409, 'RENOVATION_COMPLIANCE_SCOPE_MISMATCH');
  }
  return scope.id;
}

async function subject(propertyId: string, subjectType: 'PERMIT' | 'HOA_APPROVAL', subjectId: string) {
  if (subjectType === 'PERMIT') {
    const permit = await prisma.propertyPermitRecord.findFirst({
      where: { id: subjectId, propertyId, isActive: true },
    });
    if (!permit) throw new APIError('Permit not found for this property.', 404, 'PERMIT_NOT_FOUND');
    return permit;
  }
  const approval = await prisma.hoaApprovalRecord.findFirst({
    where: { id: subjectId, propertyId, isActive: true },
  });
  if (!approval) throw new APIError('HOA approval not found for this property.', 404, 'HOA_APPROVAL_NOT_FOUND');
  return approval;
}

export async function attachComplianceRecord(
  propertyId: string,
  renovationCaseId: string,
  actorUserId: string,
  input: { subjectType: 'PERMIT' | 'HOA_APPROVAL'; subjectId: string; scopeVersionId?: string },
) {
  const scopeVersionId = await caseScope(propertyId, renovationCaseId, input.scopeVersionId);
  const record: any = await subject(propertyId, input.subjectType, input.subjectId);
  const linkType = input.subjectType === 'PERMIT' ? 'PERMIT' : 'HOA_APPROVAL';
  const existingLink = await prisma.renovationCaseLink.findUnique({
    where: { linkType_targetId: { linkType, targetId: input.subjectId } },
  });
  if (existingLink && existingLink.renovationCaseId !== renovationCaseId) {
    throw new APIError(
      'This compliance record is already attached to another renovation case.',
      409,
      'RENOVATION_COMPLIANCE_RECORD_ALREADY_ATTACHED',
    );
  }
  const detail = existingLink
    ? await getRenovationCase(propertyId, renovationCaseId)
    : await linkContributor(propertyId, renovationCaseId, actorUserId, {
        linkType,
        targetId: input.subjectId,
        scopeVersionId,
        metadata: { role: 'CASE_COMPLIANCE_WORKFLOW' },
      });
  if (input.subjectType === 'PERMIT') {
    await prisma.propertyPermitRecord.update({
      where: { id: input.subjectId },
      data: { sourceEntityType: 'RENOVATION_CASE', sourceEntityId: renovationCaseId },
    });
  } else {
    await prisma.hoaApprovalRecord.update({
      where: { id: input.subjectId },
      data: { sourceEntityType: 'RENOVATION_CASE', sourceEntityId: renovationCaseId },
    });
    if (record.decisionStatus === 'APPROVED_WITH_CONDITIONS' && record.approvalConditions) {
      await prisma.renovationComplianceCondition.upsert({
        where: {
          renovationCaseId_scopeVersionId_subjectType_subjectId_title: {
            renovationCaseId,
            scopeVersionId,
            subjectType: 'HOA_APPROVAL',
            subjectId: input.subjectId,
            title: 'HOA approval conditions',
          },
        },
        create: {
          renovationCaseId,
          propertyId,
          scopeVersionId,
          subjectType: 'HOA_APPROVAL',
          subjectId: input.subjectId,
          hoaApprovalId: input.subjectId,
          title: 'HOA approval conditions',
          description: record.approvalConditions,
          sourceReference: record.decisionSourceReference ?? record.associationReferenceNumber,
          sourceDocumentId: record.decisionEvidenceDocumentId,
          isBlocking: true,
          ownerUserId: actorUserId,
          dueAt: record.expirationDate,
          expiresAt: record.expirationDate,
        },
        update: {
          description: record.approvalConditions,
          sourceReference: record.decisionSourceReference ?? record.associationReferenceNumber,
          sourceDocumentId: record.decisionEvidenceDocumentId,
          expiresAt: record.expirationDate,
        },
      });
    }
  }
  return detail;
}

export async function createCondition(
  propertyId: string,
  renovationCaseId: string,
  actorUserId: string,
  input: any,
) {
  const scopeVersionId = await caseScope(propertyId, renovationCaseId, input.scopeVersionId);
  await subject(propertyId, input.subjectType, input.subjectId);
  if (input.ownerUserId && !(await resolvePropertyAccess(input.ownerUserId, propertyId))) {
    throw new APIError('Condition owner must have property access.', 409, 'RENOVATION_CONDITION_OWNER_SCOPE_MISMATCH');
  }
  if (input.sourceDocumentId) {
    const evidence = await prisma.document.findFirst({
      where: { id: input.sourceDocumentId, propertyId },
      select: { id: true },
    });
    if (!evidence) throw new APIError('Condition evidence must belong to this property.', 409, 'RENOVATION_CONDITION_EVIDENCE_SCOPE_MISMATCH');
  }
  return prisma.renovationComplianceCondition.create({
    data: {
      renovationCaseId,
      propertyId,
      scopeVersionId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      permitRecordId: input.subjectType === 'PERMIT' ? input.subjectId : null,
      hoaApprovalId: input.subjectType === 'HOA_APPROVAL' ? input.subjectId : null,
      title: input.title,
      description: input.description,
      sourceReference: input.sourceReference,
      sourceDocumentId: input.sourceDocumentId,
      isBlocking: input.isBlocking,
      ownerUserId: input.ownerUserId ?? actorUserId,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
}

export async function updateCondition(
  propertyId: string,
  renovationCaseId: string,
  conditionId: string,
  actorUserId: string,
  input: any,
) {
  const condition = await prisma.renovationComplianceCondition.findFirst({
    where: { id: conditionId, renovationCaseId, propertyId },
  });
  if (!condition) throw new APIError('Compliance condition not found.', 404, 'RENOVATION_CONDITION_NOT_FOUND');
  if (input.sourceDocumentId) {
    const evidence = await prisma.document.findFirst({
      where: { id: input.sourceDocumentId, propertyId },
      select: { id: true },
    });
    if (!evidence) throw new APIError('Condition evidence must belong to this property.', 409, 'RENOVATION_CONDITION_EVIDENCE_SCOPE_MISMATCH');
  }
  return prisma.renovationComplianceCondition.update({
    where: { id: conditionId },
    data: {
      status: input.status,
      verificationNotes: input.verificationNotes,
      sourceDocumentId: input.sourceDocumentId ?? condition.sourceDocumentId,
      satisfiedAt: input.status === 'SATISFIED' ? new Date() : null,
      verifiedByUserId: actorUserId,
    },
  });
}

export async function createHoaDocumentReview(
  propertyId: string,
  renovationCaseId: string,
  input: any,
) {
  const scopeVersionId = await caseScope(propertyId, renovationCaseId, input.scopeVersionId);
  await subject(propertyId, 'HOA_APPROVAL', input.hoaApprovalId);
  const document = await prisma.document.findFirst({
    where: { id: input.documentId, propertyId },
    select: { id: true },
  });
  if (!document) {
    throw new APIError(
      'HOA extraction source document must belong to this property.',
      409,
      'HOA_DOCUMENT_REVIEW_PROPERTY_MISMATCH',
    );
  }
  return prisma.hoaApprovalDocumentReview.upsert({
    where: {
      renovationCaseId_scopeVersionId_hoaApprovalId_documentId: {
        renovationCaseId,
        scopeVersionId,
        hoaApprovalId: input.hoaApprovalId,
        documentId: input.documentId,
      },
    },
    create: {
      renovationCaseId,
      propertyId,
      scopeVersionId,
      hoaApprovalId: input.hoaApprovalId,
      documentId: input.documentId,
      extractedDecisionStatus: input.extractedDecisionStatus,
      extractedConditions: input.extractedConditions,
      extractedExpirationDate: input.extractedExpirationDate
        ? new Date(input.extractedExpirationDate)
        : null,
      extractedReferenceNumber: input.extractedReferenceNumber,
      extractionMethod: input.extractionMethod,
      parserVersion: input.parserVersion,
    },
    update: {
      extractedDecisionStatus: input.extractedDecisionStatus,
      extractedConditions: input.extractedConditions,
      extractedExpirationDate: input.extractedExpirationDate
        ? new Date(input.extractedExpirationDate)
        : null,
      extractedReferenceNumber: input.extractedReferenceNumber,
      extractionMethod: input.extractionMethod,
      parserVersion: input.parserVersion,
      status: 'NEEDS_REVIEW',
      reviewNotes: null,
      reviewedByUserId: null,
      reviewedAt: null,
    },
  });
}

export async function reviewHoaDocumentExtraction(
  propertyId: string,
  renovationCaseId: string,
  reviewId: string,
  actorUserId: string,
  input: any,
) {
  const review = await prisma.hoaApprovalDocumentReview.findFirst({
    where: { id: reviewId, propertyId, renovationCaseId },
  });
  if (!review) {
    throw new APIError('HOA document review not found.', 404, 'HOA_DOCUMENT_REVIEW_NOT_FOUND');
  }
  if (review.status !== 'NEEDS_REVIEW') {
    throw new APIError(
      'This HOA document extraction has already been reviewed.',
      409,
      'HOA_DOCUMENT_REVIEW_ALREADY_DECIDED',
    );
  }
  if (input.status === 'REJECTED') {
    return prisma.hoaApprovalDocumentReview.update({
      where: { id: reviewId },
      data: {
        status: 'REJECTED',
        reviewNotes: input.reviewNotes,
        reviewedByUserId: actorUserId,
        reviewedAt: new Date(),
      },
    });
  }

  const extractedConditions = Array.isArray(review.extractedConditions)
    ? review.extractedConditions as any[]
    : [];
  const selectedIndexes: number[] = input.selectedConditionIndexes
    ?? extractedConditions.map((_condition, index) => index);
  if (selectedIndexes.some(index => index >= extractedConditions.length)) {
    throw new APIError(
      'A selected HOA condition candidate does not exist.',
      400,
      'HOA_DOCUMENT_REVIEW_SELECTION_INVALID',
    );
  }
  const selectedConditions = [...new Set(selectedIndexes)].map(index => extractedConditions[index]);
  if (review.extractedDecisionStatus === 'APPROVED_WITH_CONDITIONS' && selectedConditions.length === 0) {
    throw new APIError(
      'Confirm at least one condition for a conditional HOA approval.',
      400,
      'HOA_DOCUMENT_REVIEW_CONDITION_REQUIRED',
    );
  }
  const sourceReference = input.sourceReference ?? `Property document ${review.documentId}`;
  if (review.extractedDecisionStatus) {
    await hoaComplianceService.updateApprovalRecord(
      review.hoaApprovalId,
      propertyId,
      actorUserId,
      {
        decisionStatus: review.extractedDecisionStatus,
        decisionTruthLayer: 'DOCUMENTED',
        decisionSourceType: 'ASSOCIATION_DOCUMENT',
        decisionSourceReference: sourceReference,
        decisionEvidenceDocumentId: review.documentId,
        associationReferenceNumber: review.extractedReferenceNumber,
        decisionObservedAt: new Date().toISOString(),
        expirationDate: review.extractedExpirationDate?.toISOString(),
        approvalConditions: selectedConditions.map(condition => condition.description).join('\n\n') || undefined,
      },
    );
  }
  for (const condition of selectedConditions) {
    await prisma.renovationComplianceCondition.upsert({
      where: {
        renovationCaseId_scopeVersionId_subjectType_subjectId_title: {
          renovationCaseId,
          scopeVersionId: review.scopeVersionId,
          subjectType: 'HOA_APPROVAL',
          subjectId: review.hoaApprovalId,
          title: condition.title,
        },
      },
      create: {
        renovationCaseId,
        propertyId,
        scopeVersionId: review.scopeVersionId,
        subjectType: 'HOA_APPROVAL',
        subjectId: review.hoaApprovalId,
        hoaApprovalId: review.hoaApprovalId,
        title: condition.title,
        description: condition.description,
        sourceReference: condition.sourceReference ?? sourceReference,
        sourceDocumentId: review.documentId,
        isBlocking: condition.isBlocking ?? true,
        ownerUserId: actorUserId,
        dueAt: condition.dueAt ? new Date(condition.dueAt) : review.extractedExpirationDate,
        expiresAt: review.extractedExpirationDate,
      },
      update: {
        description: condition.description,
        sourceReference: condition.sourceReference ?? sourceReference,
        sourceDocumentId: review.documentId,
        isBlocking: condition.isBlocking ?? true,
        dueAt: condition.dueAt ? new Date(condition.dueAt) : review.extractedExpirationDate,
        expiresAt: review.extractedExpirationDate,
      },
    });
  }
  return prisma.hoaApprovalDocumentReview.update({
    where: { id: reviewId },
    data: {
      status: 'CONFIRMED',
      reviewNotes: input.reviewNotes,
      reviewedByUserId: actorUserId,
      reviewedAt: new Date(),
    },
  });
}

export async function getComplianceWorkflow(propertyId: string, renovationCaseId: string) {
  const scopeVersionId = await caseScope(propertyId, renovationCaseId);
  const links = await prisma.renovationCaseLink.findMany({
    where: {
      renovationCaseId,
      propertyId,
      linkType: { in: ['PERMIT', 'HOA_APPROVAL'] },
    },
  });
  const permitIds = links.filter(link => link.linkType === 'PERMIT').map(link => link.targetId);
  const hoaIds = links.filter(link => link.linkType === 'HOA_APPROVAL').map(link => link.targetId);
  const [permits, hoaApprovals, conditions, hoaDocumentReviews] = await Promise.all([
    prisma.propertyPermitRecord.findMany({ where: { id: { in: permitIds }, propertyId, isActive: true } }),
    prisma.hoaApprovalRecord.findMany({ where: { id: { in: hoaIds }, propertyId, isActive: true } }),
    prisma.renovationComplianceCondition.findMany({
      where: { renovationCaseId, scopeVersionId },
      orderBy: [{ isBlocking: 'desc' }, { dueAt: 'asc' }],
    }),
    prisma.hoaApprovalDocumentReview.findMany({
      where: { renovationCaseId, scopeVersionId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const alerts = [
    ...permits
      .filter(record => record.expirationDate && record.expirationDate <= soon && record.status !== 'FINALED')
      .map(record => ({
        type: 'PERMIT_EXPIRATION',
        subjectId: record.id,
        expiresAt: record.expirationDate,
        message: 'Permit expiration is approaching; confirm renewal or closeout with the authority.',
      })),
    ...hoaApprovals
      .filter(record => record.expirationDate && record.expirationDate <= soon && record.decisionStatus !== 'EXPIRED')
      .map(record => ({
        type: 'HOA_EXPIRATION',
        subjectId: record.id,
        expiresAt: record.expirationDate,
        message: 'HOA approval expiration is approaching; confirm extension or complete the approved work.',
      })),
  ];
  return {
    scopeVersionId,
    permits,
    hoaApprovals,
    conditions,
    hoaDocumentReviews,
    alerts,
    coverage: {
      permit: permits.length
        ? { state: 'LINKED_RECORDS', message: `${permits.length} permit record(s) linked to this case.` }
        : { state: 'NO_LINKED_RECORDS', message: 'No permit is linked. This is not evidence that no permit is required or exists.' },
      hoa: hoaApprovals.length
        ? { state: 'LINKED_RECORDS', message: `${hoaApprovals.length} HOA approval record(s) linked to this case.` }
        : { state: 'NO_LINKED_RECORDS', message: 'No HOA approval is linked. Confirm whether an association governs this scope.' },
    },
    blockers: conditions.filter(condition => condition.isBlocking && condition.status === 'OPEN'),
  };
}
