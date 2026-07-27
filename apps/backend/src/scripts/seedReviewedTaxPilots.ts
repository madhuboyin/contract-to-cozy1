import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  REVIEWED_TAX_PILOT_SOURCES,
} from '../services/taxAssessorAdapters/reviewedTaxPilotSources';

type TaxPilotSeedDb = Pick<typeof prisma, 'taxAssessorDataSource'>;

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

if (require.main === module) {
  upsertReviewedTaxPilotSources()
    .then((count) => {
      console.log(
        `Upserted ${count} reviewed Home Event Radar tax pilot source(s).`,
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
