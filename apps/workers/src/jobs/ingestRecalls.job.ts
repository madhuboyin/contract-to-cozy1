// apps/workers/src/jobs/ingestRecalls.job.ts
import { prisma } from '../lib/prisma';
import { fetchCpscRecalls } from '../recalls/cpsc.client';

function deriveSeverity(hazard?: string, summary?: string) {
  const t = `${hazard || ''} ${summary || ''}`.toLowerCase();
  if (t.includes('death') || t.includes('fatal')) return 'CRITICAL';
  if (t.includes('fire') || t.includes('burn') || t.includes('electrocution') || t.includes('injury')) return 'HIGH';
  if (t.includes('shock') || t.includes('choking') || t.includes('laceration')) return 'MEDIUM';
  return 'UNKNOWN';
}

export async function ingestRecallsJob() {
  const items = await fetchCpscRecalls();

  let upserted = 0;

  for (const item of items) {
    const recall = await prisma.recallRecord.upsert({
      where: {
        // Prisma generates this compound unique input as source_externalId
        source_externalId: { source: 'CPSC', externalId: item.externalId },
      },
      update: {
        title: item.title,
        severity: deriveSeverity(item.hazard, item.summary),
        summary: item.summary,
        hazard: item.hazard,
        remedy: item.remedy,
        recallUrl: item.recallUrl,
        remedyUrl: item.remedyUrl,
        recalledAt: item.recalledAt ? new Date(item.recalledAt) : null,
        affectedUnits: item.affectedUnits,
        raw: item.raw,
        lastSeenAt: new Date(),
      },
      create: {
        source: 'CPSC',
        externalId: item.externalId,
        status: 'ACTIVE',
        severity: deriveSeverity(item.hazard, item.summary),
        title: item.title,
        summary: item.summary,
        hazard: item.hazard,
        remedy: item.remedy,
        recallUrl: item.recallUrl,
        remedyUrl: item.remedyUrl,
        recalledAt: item.recalledAt ? new Date(item.recalledAt) : null,
        affectedUnits: item.affectedUnits,
        raw: item.raw,
        lastSeenAt: new Date(),
      },
    });

    // Derived table strategy (safe + simple): rebuild RecallProduct for this recall
    await prisma.recallProduct.deleteMany({ where: { recallId: recall.id } });

    const manufacturers = item.manufacturers?.length ? item.manufacturers : [null];
    const models = item.models?.length ? item.models : [null];

    const data = [];
    for (const mfg of manufacturers) {
      for (const model of models) {
        data.push({
          recallId: recall.id,
          manufacturer: mfg,
          model,
          notes: null,
        });
      }
    }

    if (data.length) {
      await prisma.recallProduct.createMany({ data });
    }

    upserted++;
  }

  return { fetched: items.length, upserted };
}
