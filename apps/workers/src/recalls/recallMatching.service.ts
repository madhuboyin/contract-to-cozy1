// apps/workers/src/recalls/recallMatching.service.ts
import { prisma } from '../lib/prisma';
import { includesEither, normManufacturer, normModel } from './normalize';

type Candidate = {
  propertyId: string;
  inventoryItemId: string;
  manufacturerNorm: string;
  modelNorm: string;
};

function scoreMatch(assetMfg: string, assetModel: string, recallMfg: string, recallModel: string) {
  const mfgMatch = includesEither(assetMfg, recallMfg);
  const modelMatch = includesEither(assetModel, recallModel);

  if (mfgMatch && modelMatch) return { confidencePct: 95, status: 'OPEN' as const };
  if (mfgMatch && (assetModel || recallModel)) return { confidencePct: 80, status: 'NEEDS_CONFIRMATION' as const };
  return { confidencePct: 0, status: 'NEEDS_CONFIRMATION' as const };
}

export async function runRecallMatchingScan() {
  const recalls = await prisma.recallRecord.findMany({
    where: { status: 'ACTIVE' },
    include: { products: true },
  });

  const inventory = await prisma.inventoryItem.findMany({
    select: {
      id: true,
      propertyId: true,
      manufacturer: true,
      modelNumber: true,
    },
  });

  const candidates: Candidate[] = inventory
    .map((it) => ({
      propertyId: it.propertyId,
      inventoryItemId: it.id,
      manufacturerNorm: normManufacturer(it.manufacturer),
      modelNorm: normModel(it.modelNumber),
    }))
    .filter((c) => c.manufacturerNorm || c.modelNorm);

  let createdOpen = 0;
  let createdNeedsConfirm = 0;

  for (const recall of recalls) {
    for (const p of recall.products) {
      const recallMfg = normManufacturer(p.manufacturer);
      const recallModel = normModel(p.model);

      // If recall has no identifiers, skip in v1
      if (!recallMfg && !recallModel) continue;

      for (const c of candidates) {
        const { confidencePct, status } = scoreMatch(
          c.manufacturerNorm,
          c.modelNorm,
          recallMfg,
          recallModel
        );

        if (confidencePct < 70) continue; // v1 threshold

        try {
          await prisma.recallMatch.create({
            data: {
              propertyId: c.propertyId,
              inventoryItemId: c.inventoryItemId,
              homeAssetId: null,
              recallId: recall.id,
              method: 'MAKE_MODEL',
              confidencePct,
              status,
              matchedOn: {
                recall: { manufacturer: p.manufacturer, model: p.model },
                asset: { manufacturer: c.manufacturerNorm, model: c.modelNorm },
              },
              rationale:
                confidencePct >= 90
                  ? `High-confidence match for ${p.manufacturer || 'manufacturer'} ${p.model || 'model'}.`
                  : `Possible match — confirm model details.`,
            },
          });

          if (status === 'OPEN') createdOpen++;
          else createdNeedsConfirm++;
        } catch {
          // Likely unique constraint hit (already exists). Ignore.
        }
      }
    }
  }

  return { createdOpen, createdNeedsConfirm };
}
