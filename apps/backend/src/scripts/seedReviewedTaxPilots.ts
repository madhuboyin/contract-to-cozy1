import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  REVIEWED_TAX_PILOT_SOURCES,
} from '../services/taxAssessorAdapters/reviewedTaxPilotSources';
import {
  REVIEWED_PROPERTY_TAX_RULES,
} from '../services/propertyTax/reviewedPropertyTaxRules';

type TaxPilotSeedDb = Pick<typeof prisma, 'taxAssessorDataSource'>;
type TaxRuleSeedDb = Pick<
  typeof prisma,
  | 'propertyTaxJurisdiction'
  | 'propertyTaxRuleProfile'
  | 'propertyTaxRuleCitation'
  | 'propertyTaxDeadlineRule'
  | 'propertyTaxRuleControlEvent'
>;

export async function upsertReviewedTaxPilotSources(
  db: TaxPilotSeedDb = prisma,
): Promise<number> {
  for (const source of REVIEWED_TAX_PILOT_SOURCES) {
    await db.taxAssessorDataSource.upsert({
      where: { slug: source.slug },
      create: {
        ...source,
        fieldMappingJson: source.fieldMappingJson as Prisma.InputJsonValue,
        queryFilterJson: source.queryFilterJson as Prisma.InputJsonValue,
      },
      update: {
        name: source.name,
        status: source.status,
        adapterType: source.adapterType,
        baseUrl: source.baseUrl,
        datasetId: source.datasetId,
        apiKeyEnvVar: source.apiKeyEnvVar,
        coverageType: source.coverageType,
        normalizedCoverageKey: source.normalizedCoverageKey,
        fieldMappingJson: source.fieldMappingJson as Prisma.InputJsonValue,
        queryFilterJson: source.queryFilterJson as Prisma.InputJsonValue,
      },
    });
  }
  return REVIEWED_TAX_PILOT_SOURCES.length;
}

export async function upsertReviewedPropertyTaxRuleProfiles(
  db: TaxRuleSeedDb = prisma,
): Promise<number> {
  for (const release of REVIEWED_PROPERTY_TAX_RULES) {
    const jurisdiction = await db.propertyTaxJurisdiction.upsert({
      where: { normalizedKey: release.jurisdiction.normalizedKey },
      create: {
        ...release.jurisdiction,
        status: 'COVERED',
      },
      update: {
        ...release.jurisdiction,
        status: 'COVERED',
      },
    });
    const profile = await db.propertyTaxRuleProfile.upsert({
      where: {
        jurisdictionId_slug_version: {
          jurisdictionId: jurisdiction.id,
          slug: release.profile.slug,
          version: release.profile.version,
        },
      },
      create: {
        ...release.profile,
        jurisdictionId: jurisdiction.id,
        assessmentRatio: release.profile.assessmentRatio,
        valuationRulesJson:
          release.profile.valuationRulesJson as Prisma.InputJsonValue,
        classificationsJson:
          release.profile.classificationsJson as Prisma.InputJsonValue,
        capsJson: release.profile.capsJson as Prisma.InputJsonValue,
        exemptionsJson:
          release.profile.exemptionsJson as Prisma.InputJsonValue,
        correctionGroundsJson:
          release.profile.correctionGroundsJson as Prisma.InputJsonValue,
        appealGroundsJson:
          release.profile.appealGroundsJson as Prisma.InputJsonValue,
        stagesJson: release.profile.stagesJson as Prisma.InputJsonValue,
        formsJson: release.profile.formsJson as Prisma.InputJsonValue,
        feesJson: release.profile.feesJson as Prisma.InputJsonValue,
        officialLinksJson:
          release.profile.officialLinksJson as Prisma.InputJsonValue,
        qualificationJson:
          release.profile.qualificationJson as Prisma.InputJsonValue,
        activatedAt:
          release.profile.status === 'ACTIVE'
            ? release.profile.reviewedAt
            : null,
      },
      update: {
        title: release.profile.title,
        summary: release.profile.summary,
        timezone: release.profile.timezone,
        status: release.profile.status,
        effectiveFrom: release.profile.effectiveFrom,
        effectiveTo: release.profile.effectiveTo,
        reviewedAt: release.profile.reviewedAt,
        reviewerName: release.profile.reviewerName,
        expiresAt: release.profile.expiresAt,
      },
    });
    for (const citation of release.citations) {
      await db.propertyTaxRuleCitation.upsert({
        where: {
          ruleProfileId_officialUrl: {
            ruleProfileId: profile.id,
            officialUrl: citation.officialUrl,
          },
        },
        create: { ...citation, ruleProfileId: profile.id },
        update: citation,
      });
    }
    for (const deadline of release.deadlines) {
      await db.propertyTaxDeadlineRule.upsert({
        where: {
          ruleProfileId_code: {
            ruleProfileId: profile.id,
            code: deadline.code,
          },
        },
        create: {
          ...deadline,
          ruleProfileId: profile.id,
          qualificationJson:
            deadline.qualificationJson as Prisma.InputJsonValue,
        },
        update: {
          ...deadline,
          qualificationJson:
            deadline.qualificationJson as Prisma.InputJsonValue,
        },
      });
    }
    if (release.profile.status === 'ACTIVE') {
      const idempotencyKey = [
        'reviewed-tax-rule-seed',
        release.profile.slug,
        release.profile.version,
      ].join(':');
      await db.propertyTaxRuleControlEvent.upsert({
        where: { idempotencyKey },
        create: {
          idempotencyKey,
          ruleProfileId: profile.id,
          action: 'ACTIVATED',
          actorUserId: 'SYSTEM_REVIEWED_SEED',
          reason: 'Initial reviewed jurisdiction rule release',
          metadataJson: {
            reviewedAt: release.profile.reviewedAt.toISOString(),
          },
        },
        update: {
          ruleProfileId: profile.id,
          reason: 'Initial reviewed jurisdiction rule release',
        },
      });
    }
  }
  return REVIEWED_PROPERTY_TAX_RULES.length;
}

if (require.main === module) {
  Promise.all([
    upsertReviewedTaxPilotSources(),
    upsertReviewedPropertyTaxRuleProfiles(),
  ])
    .then(([sourceCount, ruleCount]) => {
      console.log(
        `Upserted ${sourceCount} reviewed tax source(s) and ${ruleCount} reviewed rule profile(s).`,
      );
    })
    .catch((error) => {
      console.error('Failed to seed reviewed Radar tax pilot sources.', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
