import { prisma } from '../lib/prisma';
import { APP_CONFIG, humanPolicyGateAllows } from '../config/appConfig';
import { recordPersonalizationAuditEvent } from './personalizationAudit.service';
import { findPersonalizationDefinition, PERSONALIZATION_DEFINITIONS } from '../modules/personalization/catalog/personalizationDefinitions';
import {
  evaluateRecommendationLaunchReadiness,
  RECOMMENDATION_REVIEW_ROLES,
  type RecommendationReviewRole,
} from '../productFramework/recommendationLaunchGate';

const IMPLEMENTED_DEFINITION_CODES: string[] = PERSONALIZATION_DEFINITIONS.map((definition) => definition.code);

export class PersonalizationCatalogActivationError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'GOVERNANCE_NOT_READY',
    public details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

function launchReadinessForDefinition(definition: any) {
  const catalogDefinition = findPersonalizationDefinition(definition.code);
  if (!catalogDefinition) return null;
  if (
    definition.safetyTier !== catalogDefinition.safetyTier ||
    definition.governancePolicyVersion !== catalogDefinition.governance.policyVersion
  ) {
    const humanPolicyApprovalEnforced = APP_CONFIG.enforceHumanPolicyApprovals;
    return {
      ready: false,
      activationAllowed: false,
      humanPolicyApprovalEnforced,
      requiredRoles: [],
      approvedRoles: [],
      missingRoles: [],
      reasons: ['CATALOG_GOVERNANCE_MISMATCH'],
    };
  }
  const readiness = evaluateRecommendationLaunchReadiness(
    catalogDefinition.governance,
    (definition.governanceReviews ?? [])
      .filter((review: any) => review.decision === 'APPROVED')
      .map((review: any) => ({
        role: review.role,
        reviewerId: review.reviewerUserId,
        approvedAt: review.reviewedAt.toISOString(),
        policyVersion: review.policyVersion,
        notes: review.notes ?? null,
      })),
  );
  const humanPolicyApprovalEnforced = APP_CONFIG.enforceHumanPolicyApprovals;
  return {
    ...readiness,
    humanPolicyApprovalEnforced,
    activationAllowed: humanPolicyGateAllows(readiness.ready, humanPolicyApprovalEnforced),
  };
}

export async function listPersonalizationCatalog() {
  const [definitions, questions] = await Promise.all([
    prisma.recommendationDefinition.findMany({
      where: { code: { in: IMPLEMENTED_DEFINITION_CODES } },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        category: true,
        safetyClass: true,
        safetyTier: true,
        governancePolicyVersion: true,
        status: true,
        pausedAt: true,
        pauseReason: true,
        rules: {
          orderBy: { version: 'desc' },
          select: { version: true, status: true, updatedAt: true },
        },
        contentVersions: {
          orderBy: [{ locale: 'asc' }, { version: 'desc' }],
          select: { locale: true, version: true, title: true, status: true, reviewDate: true, updatedAt: true },
        },
        governanceReviews: {
          orderBy: [{ role: 'asc' }],
          select: { role: true, decision: true, reviewerUserId: true, policyVersion: true, notes: true, reviewedAt: true },
        },
      },
    }),
    prisma.profileQuestion.findMany({
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
      select: { code: true, version: true, prompt: true, status: true, updatedAt: true },
    }),
  ]);
  return {
    definitions: definitions.map((definition) => ({
      ...definition,
      launchReadiness: launchReadinessForDefinition(definition),
    })),
    questions,
  };
}

export async function recordRecommendationGovernanceReview(params: {
  code: string;
  role: RecommendationReviewRole;
  decision: 'APPROVED' | 'REJECTED';
  reviewerUserId: string;
  notes?: string | null;
}) {
  if (!RECOMMENDATION_REVIEW_ROLES.includes(params.role)) {
    throw new PersonalizationCatalogActivationError('NOT_FOUND');
  }
  const catalogDefinition = findPersonalizationDefinition(params.code);
  if (!catalogDefinition) throw new PersonalizationCatalogActivationError('NOT_FOUND');
  const definition = await prisma.recommendationDefinition.findUnique({
    where: { code: params.code },
    select: { id: true, safetyTier: true, governancePolicyVersion: true },
  });
  if (!definition) throw new PersonalizationCatalogActivationError('NOT_FOUND');
  if (
    definition.safetyTier !== catalogDefinition.safetyTier ||
    definition.governancePolicyVersion !== catalogDefinition.governance.policyVersion
  ) {
    throw new PersonalizationCatalogActivationError('GOVERNANCE_NOT_READY', {
      reasons: ['CATALOG_GOVERNANCE_MISMATCH'],
    });
  }

  const reviewedAt = new Date();
  const review = await prisma.recommendationGovernanceReview.upsert({
    where: {
      definitionId_role_policyVersion: {
        definitionId: definition.id,
        role: params.role,
        policyVersion: definition.governancePolicyVersion,
      },
    },
    create: {
      definitionId: definition.id,
      role: params.role,
      policyVersion: definition.governancePolicyVersion,
      decision: params.decision,
      reviewerUserId: params.reviewerUserId,
      notes: params.notes ?? null,
      reviewedAt,
    },
    update: {
      decision: params.decision,
      reviewerUserId: params.reviewerUserId,
      notes: params.notes ?? null,
      reviewedAt,
    },
  });
  await recordPersonalizationAuditEvent({
    actorUserId: params.reviewerUserId,
    action: `PERSONALIZATION_GOVERNANCE_${params.decision}`,
    entityType: 'RECOMMENDATION_DEFINITION',
    entityId: params.code,
    reason: params.notes ?? undefined,
    metadata: { role: params.role, policyVersion: definition.governancePolicyVersion, safetyTier: definition.safetyTier },
  });
  return review;
}

export async function activatePersonalizationDefinitionBundle(params: {
  code: string;
  ruleVersion: number;
  contentVersion: number;
  locale: string;
  reviewerUserId: string;
}) {
  if (!IMPLEMENTED_DEFINITION_CODES.includes(params.code)) {
    throw new PersonalizationCatalogActivationError('NOT_FOUND');
  }
  const definition = await prisma.recommendationDefinition.findUnique({
    where: { code: params.code },
    select: {
      id: true,
      safetyTier: true,
      governancePolicyVersion: true,
      rules: { where: { version: params.ruleVersion }, select: { id: true } },
      contentVersions: {
        where: { version: params.contentVersion, locale: params.locale },
        select: { id: true },
      },
      governanceReviews: {
        select: { role: true, decision: true, reviewerUserId: true, policyVersion: true, notes: true, reviewedAt: true },
      },
    },
  });
  if (!definition || !definition.rules[0] || !definition.contentVersions[0]) {
    throw new PersonalizationCatalogActivationError('NOT_FOUND');
  }
  const catalogDefinition = findPersonalizationDefinition(params.code)!;
  const readiness = launchReadinessForDefinition({ ...definition, code: params.code });
  if (!readiness?.activationAllowed) {
    throw new PersonalizationCatalogActivationError('GOVERNANCE_NOT_READY', {
      safetyTier: catalogDefinition.safetyTier,
      ...readiness,
    });
  }

  const activatedAt = new Date();
  await prisma.$transaction(async (db) => {
    await db.recommendationRule.updateMany({
      where: { definitionId: definition.id, status: 'ACTIVE', version: { not: params.ruleVersion } },
      data: { status: 'RETIRED' },
    });
    await db.recommendationRule.update({
      where: { definitionId_version: { definitionId: definition.id, version: params.ruleVersion } },
      data: {
        status: 'ACTIVE',
        authoredBy: null,
        reviewedBy: params.reviewerUserId,
      },
    });
    await db.recommendationContentVersion.updateMany({
      where: {
        definitionId: definition.id,
        locale: params.locale,
        status: 'ACTIVE',
        version: { not: params.contentVersion },
      },
      data: { status: 'RETIRED' },
    });
    await db.recommendationContentVersion.update({
      where: {
        definitionId_locale_version: {
          definitionId: definition.id,
          locale: params.locale,
          version: params.contentVersion,
        },
      },
      data: { status: 'ACTIVE', reviewDate: activatedAt },
    });
    await db.recommendationDefinition.update({
      where: { id: definition.id },
      data: {
        status: 'ACTIVE',
        effectiveFrom: activatedAt,
        pausedAt: null,
        pausedBy: null,
        pauseReason: null,
      },
    });
  });

  await recordPersonalizationAuditEvent({
    actorUserId: params.reviewerUserId,
    action: 'PERSONALIZATION_DEFINITION_BUNDLE_ACTIVATED',
    entityType: 'RECOMMENDATION_DEFINITION',
    entityId: params.code,
    metadata: {
      ruleVersion: params.ruleVersion,
      contentVersion: params.contentVersion,
      locale: params.locale,
      safetyTier: catalogDefinition.safetyTier,
      governancePolicyVersion: catalogDefinition.governance.policyVersion,
      humanPolicyApprovalEnforced: readiness.humanPolicyApprovalEnforced,
      missingApprovalRoles: readiness.missingRoles,
    },
  });
  return {
    code: params.code,
    status: 'ACTIVE',
    activatedAt,
    governanceMode: readiness.ready ? 'APPROVED' : 'BETA_ADVISORY',
  };
}

export async function activatePersonalizationQuestion(params: {
  code: string;
  version: number;
  reviewerUserId: string;
}) {
  const question = await prisma.profileQuestion.findUnique({
    where: { code_version: { code: params.code, version: params.version } },
    select: { id: true },
  });
  if (!question) throw new PersonalizationCatalogActivationError('NOT_FOUND');

  await prisma.$transaction(async (db) => {
    await db.profileQuestion.updateMany({
      where: { code: params.code, status: 'ACTIVE', version: { not: params.version } },
      data: { status: 'RETIRED' },
    });
    await db.profileQuestion.update({
      where: { code_version: { code: params.code, version: params.version } },
      data: { status: 'ACTIVE' },
    });
  });
  await recordPersonalizationAuditEvent({
    actorUserId: params.reviewerUserId,
    action: 'PERSONALIZATION_PROFILE_QUESTION_ACTIVATED',
    entityType: 'PROFILE_QUESTION',
    entityId: `${params.code}:v${params.version}`,
  });
  return { code: params.code, version: params.version, status: 'ACTIVE' };
}
