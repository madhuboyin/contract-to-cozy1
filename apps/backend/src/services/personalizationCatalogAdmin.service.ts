import { prisma } from '../lib/prisma';
import { recordPersonalizationAuditEvent } from './personalizationAudit.service';

export class PersonalizationCatalogActivationError extends Error {
  constructor(public code: 'NOT_FOUND' | 'AUTHOR_NOT_FOUND' | 'TWO_PERSON_REVIEW_REQUIRED') {
    super(code);
  }
}

export async function listPersonalizationCatalog() {
  const [definitions, questions] = await Promise.all([
    prisma.recommendationDefinition.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        category: true,
        safetyClass: true,
        status: true,
        pausedAt: true,
        pauseReason: true,
        rules: {
          orderBy: { version: 'desc' },
          select: { version: true, status: true, authoredBy: true, reviewedBy: true, updatedAt: true },
        },
        contentVersions: {
          orderBy: [{ locale: 'asc' }, { version: 'desc' }],
          select: { locale: true, version: true, title: true, status: true, reviewDate: true, updatedAt: true },
        },
      },
    }),
    prisma.profileQuestion.findMany({
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
      select: { code: true, version: true, prompt: true, status: true, placementContexts: true, updatedAt: true },
    }),
  ]);
  return { definitions, questions };
}

export async function activatePersonalizationDefinitionBundle(params: {
  code: string;
  ruleVersion: number;
  contentVersion: number;
  locale: string;
  authoredBy: string;
  reviewerUserId: string;
}) {
  const [definition, author] = await Promise.all([
    prisma.recommendationDefinition.findUnique({
      where: { code: params.code },
      select: {
        id: true,
        safetyClass: true,
        rules: { where: { version: params.ruleVersion }, select: { id: true } },
        contentVersions: {
          where: { version: params.contentVersion, locale: params.locale },
          select: { id: true },
        },
      },
    }),
    prisma.user.findFirst({
      where: { id: params.authoredBy.trim(), role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    }),
  ]);
  if (!definition || !definition.rules[0] || !definition.contentVersions[0]) {
    throw new PersonalizationCatalogActivationError('NOT_FOUND');
  }
  if (!author) throw new PersonalizationCatalogActivationError('AUTHOR_NOT_FOUND');
  if (
    definition.safetyClass === 'SAFETY_SENSITIVE'
    && params.authoredBy.trim() === params.reviewerUserId
  ) {
    throw new PersonalizationCatalogActivationError('TWO_PERSON_REVIEW_REQUIRED');
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
        authoredBy: author.id,
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
    metadata: { ruleVersion: params.ruleVersion, contentVersion: params.contentVersion, locale: params.locale },
  });
  return { code: params.code, status: 'ACTIVE', activatedAt };
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
