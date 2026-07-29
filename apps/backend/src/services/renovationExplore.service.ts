import { Prisma, RenovationUpgradeOptionStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { APIError } from '../middleware/error.middleware';
import { getPropertyContext } from '../modules/propertyContext';
import { evaluateHomeModificationApplicability } from './homeModification/applicabilityPolicy';
import { homeModificationAdvisorService } from './homeModificationAdvisor.service';
import { createRenovationCase, getRenovationCase } from './renovationCase.service';

const explorationInclude = {
  options: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.RenovationExplorationInclude;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function assertExploration(propertyId: string, explorationId: string) {
  const exploration = await prisma.renovationExploration.findFirst({
    where: { id: explorationId, propertyId, archivedAt: null },
    include: explorationInclude,
  });
  if (!exploration) {
    throw new APIError('Renovation exploration not found.', 404, 'RENOVATION_EXPLORATION_NOT_FOUND');
  }
  return exploration;
}

function missingFactGuidance(context: any, applicability: any, propertyAge: number | null) {
  const keys = new Set<string>([
    ...applicability.feature.missingFactKeys,
    ...applicability.feature.conflictedFactKeys,
    ...applicability.outdoor.missingFactKeys,
    ...applicability.outdoor.conflictedFactKeys,
    ...(propertyAge === null ? ['core.yearBuilt'] : []),
  ]);
  return [...keys].sort().map((key) => ({
    factKey: key,
    benefit: key === 'core.yearBuilt'
      ? 'Improves age-sensitive fit explanations and avoids assumptions about older systems.'
      : 'Helps determine which upgrade options fit this property and who controls the work.',
    correctionAction: context.facts[key]?.correctionPath
      ?? `/dashboard/properties/${context.propertyId}/profile`,
  }));
}

export async function createExploration(propertyId: string, actorUserId: string, input: any) {
  if (input.idempotencyKey) {
    const existing = await prisma.renovationExploration.findUnique({
      where: {
        propertyId_idempotencyKey: { propertyId, idempotencyKey: input.idempotencyKey },
      },
      include: explorationInclude,
    });
    if (existing) return existing;
  }

  const context = await getPropertyContext(
    propertyId,
    { userId: actorUserId },
    { scopes: ['CORE', 'LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY'] },
  );
  const applicability = evaluateHomeModificationApplicability(context);
  const preferenceGoals = [
    ...input.goals,
    ...input.accessibilityPreferences,
    ...input.resiliencePreferences,
    ...input.efficiencyPreferences,
    ...input.maintenancePreferences,
    ...(input.spacesAffected.length ? [`Affected spaces: ${input.spacesAffected.join(', ')}`] : []),
    ...(input.systemsAffected.length ? [`Affected systems: ${input.systemsAffected.join(', ')}`] : []),
    ...(input.targetTiming ? [`Target timing: ${input.targetTiming}`] : []),
    ...(input.budgetMaxCents !== undefined
      ? [`Maximum exploration budget: $${Math.round(input.budgetMaxCents / 100).toLocaleString('en-US')}`]
      : []),
    ...(input.responsibilityContext !== 'UNKNOWN'
      ? [`Work responsibility: ${input.responsibilityContext}`]
      : []),
    ...(input.constraints ? [`Constraints: ${JSON.stringify(input.constraints)}`] : []),
  ];
  const report = await homeModificationAdvisorService.generateModificationReport(
    propertyId,
    actorUserId,
    preferenceGoals,
    context,
    applicability,
  );
  const missingFacts = missingFactGuidance(context, applicability, report.propertyAge);
  const withinBudget = input.budgetMaxCents === undefined
    ? report.recommendations
    : report.recommendations.filter(
      (option) => Math.round(option.costRange.min * 100) <= input.budgetMaxCents,
    );
  const boundedRecommendations = withinBudget.length > 0 ? withinBudget : report.recommendations;
  const relevantFactKeys = new Set([
    ...applicability.feature.usedFactKeys,
    ...applicability.feature.missingFactKeys,
    ...applicability.feature.conflictedFactKeys,
    ...applicability.outdoor.usedFactKeys,
    ...applicability.outdoor.missingFactKeys,
    ...applicability.outdoor.conflictedFactKeys,
    'core.yearBuilt',
    'core.dwellingType',
  ]);
  const boundedFacts = Object.fromEntries(
    [...relevantFactKeys]
      .filter((key) => context.facts[key])
      .map((key) => [key, context.facts[key]]),
  );

  const exploration = await prisma.renovationExploration.create({
    data: {
      propertyId,
      createdByUserId: actorUserId,
      idempotencyKey: input.idempotencyKey,
      goals: input.goals,
      constraints: input.constraints,
      responsibilityContext: input.responsibilityContext,
      spacesAffected: input.spacesAffected,
      systemsAffected: input.systemsAffected,
      budgetMinCents: input.budgetMinCents,
      budgetMaxCents: input.budgetMaxCents,
      targetTiming: input.targetTiming,
      accessibilityPreferences: input.accessibilityPreferences,
      resiliencePreferences: input.resiliencePreferences,
      efficiencyPreferences: input.efficiencyPreferences,
      maintenancePreferences: input.maintenancePreferences,
      propertyContextSnapshot: json({
        contextVersion: context.contextVersion,
        generatedAt: context.generatedAt,
        facts: boundedFacts,
        warnings: context.warnings,
        applicability,
      }),
      missingFacts: json(missingFacts),
      options: {
        create: boundedRecommendations.map((option, position) => ({
          position,
          title: option.title,
          category: option.category,
          description: option.description,
          costMinCents: Math.round(option.costRange.min * 100),
          costMaxCents: Math.round(option.costRange.max * 100),
          currency: option.costRange.currency,
          timeline: option.timeline,
          benefits: option.benefits,
          whyThisFits: [
            option.whyThisFits,
            input.spacesAffected.length
              ? `Exploration scope includes ${input.spacesAffected.join(', ')}.`
              : null,
            input.budgetMaxCents !== undefined
              && Math.round(option.costRange.min * 100) > input.budgetMaxCents
              ? 'The broad starting range is above the stated budget; narrow the scope or compare alternatives before selecting.'
              : null,
          ].filter(Boolean).join(' '),
          professionalToConsult: option.professionalToConsult,
          permitGuidance: option.permitGuidance,
          evidenceSource: option.source,
          confidence: option.confidence,
          assumptions: option.assumptions,
          validationEvidence: json(option.validation),
          missingFactBenefits: json(missingFacts),
        })),
      },
    },
    include: explorationInclude,
  });
  return exploration;
}

export async function getExploration(propertyId: string, explorationId: string) {
  return assertExploration(propertyId, explorationId);
}

export async function updateOptionDisposition(
  propertyId: string,
  explorationId: string,
  optionId: string,
  input: { status: RenovationUpgradeOptionStatus; reason?: string },
) {
  await assertExploration(propertyId, explorationId);
  const option = await prisma.renovationUpgradeOption.findFirst({
    where: { id: optionId, explorationId },
  });
  if (!option) throw new APIError('Upgrade option not found.', 404, 'RENOVATION_OPTION_NOT_FOUND');
  if (option.status === 'SELECTED') {
    throw new APIError(
      'A selected option cannot be rejected or returned to saved state.',
      409,
      'RENOVATION_OPTION_ALREADY_SELECTED',
    );
  }
  return prisma.renovationUpgradeOption.update({
    where: { id: optionId },
    data: {
      status: input.status,
      dispositionReason: input.reason,
      dispositionAt: new Date(),
    },
  });
}

function caseTypeForCategory(category: string) {
  if (category === 'ENERGY') return 'ENERGY_UPGRADE';
  if (category === 'ACCESSIBILITY' || category === 'AGING_IN_PLACE') return 'ACCESSIBILITY';
  return 'REMODEL';
}

export async function convertOptionToCase(
  propertyId: string,
  explorationId: string,
  optionId: string,
  actorUserId: string,
  input: any,
) {
  const exploration = await assertExploration(propertyId, explorationId);
  const option = exploration.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new APIError('Upgrade option not found.', 404, 'RENOVATION_OPTION_NOT_FOUND');
  if (option.status === 'REJECTED') {
    throw new APIError(
      'Save the option before creating a renovation plan.',
      409,
      'RENOVATION_OPTION_REJECTED',
    );
  }
  if (option.renovationCaseId) {
    return getRenovationCase(propertyId, option.renovationCaseId);
  }

  const renovationCase = await createRenovationCase(propertyId, actorUserId, {
    name: input.name ?? option.title,
    objective: input.objective ?? option.description,
    caseType: input.caseType ?? caseTypeForCategory(option.category),
    governanceTier: input.governanceTier,
    responsibilityContext: exploration.responsibilityContext,
    spacesAffected: exploration.spacesAffected,
    systemsAffected: exploration.systemsAffected,
    targetBudgetCents: exploration.budgetMaxCents,
    entryPoint: 'EXPLORE_UPGRADES',
    sourceType: 'UPGRADE_OPTION',
    sourceId: option.id,
    idempotencyKey: `upgrade-option:${option.id}`,
    initialScope: {
      summary: option.description,
      workItems: [{
        optionId: option.id,
        title: option.title,
        category: option.category,
        description: option.description,
        benefits: option.benefits,
        professionalToConsult: option.professionalToConsult,
        permitGuidance: option.permitGuidance,
        costRangeCents: { min: option.costMinCents, max: option.costMaxCents },
        timeline: option.timeline,
        assumptions: option.assumptions,
        evidenceSource: option.evidenceSource,
        validationEvidence: option.validationEvidence,
      }],
      spacesAffected: exploration.spacesAffected,
      systemsAffected: exploration.systemsAffected,
      structuralEffects: false,
      exteriorEffects: false,
      drawingDocumentIds: [],
      specificationDocumentIds: [],
      estimatedCostCents: option.costMaxCents,
      approvalStatus: 'DRAFT',
    },
  });
  await prisma.$transaction([
    prisma.renovationUpgradeOption.update({
      where: { id: option.id },
      data: {
        status: 'SELECTED',
        renovationCaseId: renovationCase.id,
        dispositionAt: new Date(),
      },
    }),
    prisma.renovationExploration.update({
      where: { id: exploration.id },
      data: { status: 'CONVERTED' },
    }),
  ]);
  return renovationCase;
}
