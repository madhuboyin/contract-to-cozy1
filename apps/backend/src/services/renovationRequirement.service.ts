import {
  AdvisorConfidenceLevel,
  Prisma,
  RenovationAdvisoryLikelihood,
  RenovationRequirementFamily,
} from '@prisma/client';
import { prisma } from '../config/database';
import { APIError } from '../middleware/error.middleware';
import { resolvePropertyAccess } from './propertyAccess.service';

const FAMILY_POLICY: Record<RenovationRequirementFamily, {
  question: string;
  nextAction: string;
  blocking: boolean;
}> = {
  PERMIT: {
    question: 'Does the approved scope require one or more permits?',
    nextAction: 'Confirm the defined scope with the authority having jurisdiction and record its source.',
    blocking: true,
  },
  ZONING: {
    question: 'Does zoning, land-use, setback, or use approval apply?',
    nextAction: 'Check the parcel and proposed use with the local planning or zoning authority.',
    blocking: true,
  },
  HOA: {
    question: 'Does an association review or approval apply to this scope?',
    nextAction: 'Confirm association responsibility and review the current governing documents.',
    blocking: true,
  },
  PROFESSIONAL: {
    question: 'Does this scope require an architect, engineer, or other licensed design professional?',
    nextAction: 'Ask the authority or an appropriately licensed professional which sealed plans or reviews are required.',
    blocking: true,
  },
  CONTRACTOR: {
    question: 'Must the contractor or trade professional hold a specific license?',
    nextAction: 'Verify the required license class with the issuing board and check the selected provider.',
    blocking: true,
  },
  INSURANCE: {
    question: 'Does the homeowner or contractor need additional insurance review or coverage?',
    nextAction: 'Ask the insurer what notice, endorsements, or certificates are needed for this scope.',
    blocking: false,
  },
  LENDER: {
    question: 'Does a lender, lienholder, or funding program need to approve the work?',
    nextAction: 'Review the loan and funding terms or ask the lender about renovation approval requirements.',
    blocking: false,
  },
  UTILITY: {
    question: 'Does a utility need to review, disconnect, reconnect, or approve this work?',
    nextAction: 'Contact each affected utility with the defined scope and record its service requirements.',
    blocking: true,
  },
  SAFETY: {
    question: 'What safety planning or temporary protections are required before work starts?',
    nextAction: 'Review the scope with the responsible contractor or safety professional and document the plan.',
    blocking: true,
  },
  HAZARD: {
    question: 'Could the work disturb lead, asbestos, mold, radon systems, or another regulated hazard?',
    nextAction: 'Use home age and scope to determine which qualified hazard assessment is needed before disturbance.',
    blocking: true,
  },
  OVERLAY: {
    question: 'Does a historic, flood, coastal, wildfire, environmental, or other overlay apply?',
    nextAction: 'Check mapped overlays and confirm any additional review with the responsible authority.',
    blocking: true,
  },
  OTHER: {
    question: 'Is there another approval or preparation requirement for this scope?',
    nextAction: 'Record the open question, responsible decision maker, and source needed to resolve it.',
    blocking: false,
  },
};

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function caseWithScope(propertyId: string, renovationCaseId: string) {
  const renovationCase = await prisma.renovationCase.findFirst({
    where: { id: renovationCaseId, propertyId, archivedAt: null },
    include: { currentScopeVersion: true },
  });
  if (!renovationCase) {
    throw new APIError('Renovation case not found.', 404, 'RENOVATION_CASE_NOT_FOUND');
  }
  if (!renovationCase.currentScopeVersion) {
    throw new APIError('Current renovation scope is missing.', 409, 'RENOVATION_SCOPE_MISSING');
  }
  return renovationCase;
}

function permitLikelihood(status?: string | null): RenovationAdvisoryLikelihood {
  if (status === 'REQUIRED' || status === 'LIKELY_REQUIRED') return 'LIKELY_APPLIES';
  if (status === 'NOT_REQUIRED' || status === 'LIKELY_NOT_REQUIRED') return 'LIKELY_DOES_NOT_APPLY';
  if (status === 'DATA_UNAVAILABLE') return 'DATA_UNAVAILABLE';
  return 'UNKNOWN';
}

function contractorLikelihood(status?: string | null): RenovationAdvisoryLikelihood {
  if (status === 'REQUIRED') return 'LIKELY_APPLIES';
  if (status === 'MAY_BE_REQUIRED') return 'POSSIBLY_APPLIES';
  if (status === 'NOT_REQUIRED') return 'LIKELY_DOES_NOT_APPLY';
  if (status === 'DATA_UNAVAILABLE') return 'DATA_UNAVAILABLE';
  return 'UNKNOWN';
}

export async function generateRequirementCandidates(
  propertyId: string,
  renovationCaseId: string,
  actorUserId: string,
  input: { advisorSessionId?: string; ownerUserId?: string; dueAt?: string },
) {
  const renovationCase = await caseWithScope(propertyId, renovationCaseId);
  const scopeVersionId = renovationCase.currentScopeVersion!.id;
  if (input.ownerUserId && !(await resolvePropertyAccess(input.ownerUserId, propertyId))) {
    throw new APIError(
      'Requirement owner must have access to this property.',
      409,
      'RENOVATION_REQUIREMENT_OWNER_SCOPE_MISMATCH',
    );
  }

  const advisor = input.advisorSessionId
    ? await prisma.homeRenovationAdvisorSession.findFirst({
      where: { id: input.advisorSessionId, propertyId },
      include: { permitOutput: true, licensingOutput: true },
    })
    : null;
  if (input.advisorSessionId && !advisor) {
    throw new APIError(
      'Advisor session must belong to the same property.',
      409,
      'RENOVATION_ADVISOR_SCOPE_MISMATCH',
    );
  }
  const existingLink = advisor
    ? await prisma.renovationCaseLink.findUnique({
      where: { linkType_targetId: { linkType: 'ADVISOR_SESSION', targetId: advisor.id } },
    })
    : null;
  if (existingLink && existingLink.renovationCaseId !== renovationCaseId) {
    throw new APIError(
      'Advisor session is already linked to another renovation case.',
      409,
      'RENOVATION_ADVISOR_ALREADY_LINKED',
    );
  }

  const permitAdvisory = permitLikelihood(advisor?.permitOutput?.requirementStatus);
  const contractorAdvisory = contractorLikelihood(advisor?.licensingOutput?.requirementStatus);
  const accountableOwnerUserId = input.ownerUserId ?? actorUserId;
  const researchDueAt = input.dueAt
    ? new Date(input.dueAt)
    : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const createdIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    if (advisor && !existingLink) {
      await tx.renovationCaseLink.create({
        data: {
          renovationCaseId,
          propertyId,
          scopeVersionId,
          linkType: 'ADVISOR_SESSION',
          targetId: advisor.id,
          createdByUserId: actorUserId,
          metadata: { role: 'ADVISORY_CANDIDATE_SOURCE' },
        },
      });
    }
    for (const family of Object.values(RenovationRequirementFamily)) {
      const policy = FAMILY_POLICY[family];
      const requirementKey = `${family.toLowerCase()}:primary`;
      const existing = await tx.renovationRequirement.findUnique({
        where: {
          renovationCaseId_scopeVersionId_requirementKey: {
            renovationCaseId,
            scopeVersionId,
            requirementKey,
          },
        },
      });
      if (existing) continue;
      const advisoryLikelihood = family === 'PERMIT'
        ? permitAdvisory
        : family === 'CONTRACTOR'
          ? contractorAdvisory
          : 'UNKNOWN';
      const confidence = family === 'PERMIT'
        ? advisor?.permitOutput?.confidenceLevel ?? 'UNAVAILABLE'
        : family === 'CONTRACTOR'
          ? advisor?.licensingOutput?.confidenceLevel ?? 'UNAVAILABLE'
          : 'UNAVAILABLE';
      const requirement = await tx.renovationRequirement.create({
        data: {
          renovationCaseId,
          propertyId,
          scopeVersionId,
          requirementKey,
          family,
          question: policy.question,
          advisoryLikelihood,
          confidence: confidence as AdvisorConfidenceLevel,
          limitation: advisor && (family === 'PERMIT' || family === 'CONTRACTOR')
            ? 'Advisor rules generate a research candidate only. They do not establish an official requirement.'
            : 'Not yet researched for this authority and scope.',
          exactNextAction: policy.nextAction,
          ownerUserId: accountableOwnerUserId,
          dueAt: researchDueAt,
          isBlocking: policy.blocking,
          sourceType: advisor && (family === 'PERMIT' || family === 'CONTRACTOR')
            ? 'ADVISOR_RULE'
            : 'UNKNOWN',
          advisorSessionId: advisor?.id,
        },
      });
      createdIds.push(requirement.id);
      await tx.renovationRequirementEvent.create({
        data: {
          renovationCaseId,
          propertyId,
          requirementId: requirement.id,
          actorUserId,
          eventType: 'CANDIDATE_GENERATED',
          nextApplicability: 'UNKNOWN',
          nextDetermination: 'UNDETERMINED',
          nextTruthLayer: 'ADVISORY',
          payload: json({ advisoryLikelihood, scopeVersionId, advisorSessionId: advisor?.id ?? null }),
        },
      });
    }
  });
  return listRequirements(propertyId, renovationCaseId);
}

export async function listRequirements(propertyId: string, renovationCaseId: string) {
  const renovationCase = await caseWithScope(propertyId, renovationCaseId);
  return prisma.renovationRequirement.findMany({
    where: {
      renovationCaseId,
      propertyId,
      scopeVersionId: renovationCase.currentScopeVersion!.id,
      recordStatus: 'CURRENT',
    },
    include: { events: { orderBy: { occurredAt: 'asc' } } },
    orderBy: [{ isBlocking: 'desc' }, { family: 'asc' }],
  });
}

async function assertOptionalTargets(propertyId: string, input: any) {
  const checks = await Promise.all([
    input.ownerUserId ? resolvePropertyAccess(input.ownerUserId, propertyId) : true,
    input.sourceDocumentId
      ? prisma.document.findFirst({ where: { id: input.sourceDocumentId, propertyId }, select: { id: true } })
      : true,
    input.relatedPermitId
      ? prisma.propertyPermitRecord.findFirst({ where: { id: input.relatedPermitId, propertyId }, select: { id: true } })
      : true,
    input.relatedHoaApprovalId
      ? prisma.hoaApprovalRecord.findFirst({ where: { id: input.relatedHoaApprovalId, propertyId }, select: { id: true } })
      : true,
  ]);
  if (checks.some((value) => !value)) {
    throw new APIError(
      'Requirement owner and evidence links must belong to the same property.',
      409,
      'RENOVATION_REQUIREMENT_SCOPE_MISMATCH',
    );
  }
}

export async function determineRequirement(
  propertyId: string,
  renovationCaseId: string,
  requirementId: string,
  actorUserId: string,
  input: any,
) {
  await caseWithScope(propertyId, renovationCaseId);
  const requirement = await prisma.renovationRequirement.findFirst({
    where: { id: requirementId, renovationCaseId, propertyId, recordStatus: 'CURRENT' },
  });
  if (!requirement) {
    throw new APIError('Renovation requirement not found.', 404, 'RENOVATION_REQUIREMENT_NOT_FOUND');
  }
  await assertOptionalTargets(propertyId, input);

  await prisma.$transaction(async (tx) => {
    await tx.renovationRequirement.update({
      where: { id: requirementId },
      data: {
        applicability: input.applicability,
        determination: input.determination,
        truthLayer: input.truthLayer,
        exactNextAction: input.exactNextAction,
        ownerUserId: input.ownerUserId,
        dueAt: input.dueAt ? new Date(input.dueAt) : input.dueAt,
        isBlocking: input.isBlocking,
        authorityName: input.authorityName,
        authorityType: input.authorityType,
        confirmedByName: input.confirmedByName,
        confirmedByOrg: input.confirmedByOrg,
        determinedByUserId: input.determination === 'UNDETERMINED' ? null : actorUserId,
        determinedAt: input.determination === 'UNDETERMINED' ? null : new Date(),
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl,
        sourceSection: input.sourceSection,
        sourceDocumentId: input.sourceDocumentId,
        sourceObservedAt: input.sourceObservedAt ? new Date(input.sourceObservedAt) : null,
        sourceFreshUntil: input.sourceFreshUntil ? new Date(input.sourceFreshUntil) : null,
        evidenceNotes: input.evidenceNotes,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        relatedPermitId: input.relatedPermitId,
        relatedHoaApprovalId: input.relatedHoaApprovalId,
      },
    });
    await tx.renovationRequirementEvent.create({
      data: {
        renovationCaseId,
        propertyId,
        requirementId,
        actorUserId,
        eventType: 'DETERMINATION_RECORDED',
        priorApplicability: requirement.applicability,
        nextApplicability: input.applicability,
        priorDetermination: requirement.determination,
        nextDetermination: input.determination,
        priorTruthLayer: requirement.truthLayer,
        nextTruthLayer: input.truthLayer,
        payload: json({
          sourceType: input.sourceType,
          sourceUrl: input.sourceUrl ?? null,
          sourceDocumentId: input.sourceDocumentId ?? null,
          confirmedByName: input.confirmedByName ?? null,
          confirmedByOrg: input.confirmedByOrg ?? null,
        }),
      },
    });
  });
  return prisma.renovationRequirement.findUnique({
    where: { id: requirementId },
    include: { events: { orderBy: { occurredAt: 'asc' } } },
  });
}

export async function upsertAuthorityProfile(
  propertyId: string,
  renovationCaseId: string,
  actorUserId: string,
  input: any,
) {
  const renovationCase = await caseWithScope(propertyId, renovationCaseId);
  const scopeVersionId = renovationCase.currentScopeVersion!.id;
  if (input.sourceDocumentId) {
    const document = await prisma.document.findFirst({
      where: { id: input.sourceDocumentId, propertyId },
      select: { id: true },
    });
    if (!document) {
      throw new APIError(
        'Authority profile source document must belong to the same property.',
        409,
        'RENOVATION_AUTHORITY_DOCUMENT_SCOPE_MISMATCH',
      );
    }
  }
  const latest = await prisma.renovationAuthorityProfile.findFirst({
    where: { renovationCaseId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  if (input.confirmed) {
    await prisma.renovationAuthorityProfile.updateMany({
      where: { renovationCaseId, status: 'CONFIRMED' },
      data: { status: 'STALE' },
    });
  }
  return prisma.renovationAuthorityProfile.create({
    data: {
      renovationCaseId,
      propertyId,
      scopeVersionId,
      version: (latest?.version ?? 0) + 1,
      status: input.confirmed ? 'CONFIRMED' : 'DRAFT',
      countryCode: input.countryCode,
      state: input.state,
      county: input.county,
      municipality: input.municipality,
      postalCode: input.postalCode,
      authorityName: input.authorityName,
      authorityType: input.authorityType,
      authorityWebsite: input.authorityWebsite,
      sourceType: input.sourceType,
      sourceReference: input.sourceReference,
      sourceDocumentId: input.sourceDocumentId,
      confirmedByName: input.confirmedByName,
      confirmedByOrg: input.confirmedByOrg,
      confirmedByUserId: input.confirmed ? actorUserId : null,
      confirmedAt: input.confirmed ? new Date() : null,
      effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      notes: input.notes,
    },
  });
}

export async function listAuthorityProfiles(propertyId: string, renovationCaseId: string) {
  await caseWithScope(propertyId, renovationCaseId);
  return prisma.renovationAuthorityProfile.findMany({
    where: { renovationCaseId, propertyId },
    orderBy: { version: 'desc' },
  });
}
