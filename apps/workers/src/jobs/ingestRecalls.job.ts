// apps/workers/src/jobs/ingestRecalls.job.ts
import { prisma } from '../lib/prisma';
import { fetchCpscRecalls } from '../recalls/cpsc.client';
import { RecallSeverity, RecallSource, RecallStatus } from '@prisma/client';

function deriveSeverity(hazard?: string, summary?: string): RecallSeverity {
  const t = `${hazard || ''} ${summary || ''}`.toLowerCase();
  if (t.includes('death') || t.includes('fatal')) return RecallSeverity.CRITICAL;
  if (t.includes('fire') || t.includes('burn') || t.includes('electrocution') || t.includes('injury'))
    return RecallSeverity.HIGH;
  if (t.includes('shock') || t.includes('choking') || t.includes('laceration')) return RecallSeverity.MEDIUM;
  return RecallSeverity.UNKNOWN;
}

function cleanStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

// Split strings like "A and B", "A / B", "A, B", "A & B", "A;B"
function splitTokens(raw: string): string[] {
  return raw
    .replace(/\s+(and|or)\s+/gi, ',')
    .replace(/\s*&\s*/g, ',')
    .replace(/\s*\/\s*/g, ',')
    .split(/[,;|]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeManufacturer(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function normalizeModel(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function unique<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

export async function ingestRecallsJob() {
  const items = await fetchCpscRecalls();
  const now = new Date();

  let upserted = 0;

  for (const item of items) {
    await prisma.$transaction(async (tx) => {
      const recall = await tx.recallRecord.upsert({
        where: {
          source_externalId: { source: RecallSource.CPSC, externalId: item.externalId },
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
          lastSeenAt: now,
        },
        create: {
          source: RecallSource.CPSC,
          externalId: item.externalId,
          status: RecallStatus.ACTIVE,
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
          lastSeenAt: now,
        },
      });

      // Rebuild derived products for this recall
      await tx.recallProduct.deleteMany({ where: { recallId: recall.id } });

      const manufacturers = unique(
        (item.manufacturers ?? [])
          .flatMap((m) => splitTokens(cleanStr(m) ?? ''))
          .map(normalizeManufacturer)
          .filter(Boolean)
      );

      const models = unique(
        (item.models ?? [])
          .flatMap((m) => splitTokens(cleanStr(m) ?? ''))
          .map(normalizeModel)
          .filter(Boolean)
          .filter((m) => m.length >= 3)
          // ✅ reduces junk like "number"
          .filter((m) => /[0-9]/.test(m))
      );

      const rows: Array<{
        recallId: string;
        manufacturer: string | null;
        model: string | null;
        notes: string | null;
      }> = [];

      if (manufacturers.length && models.length) {
        const seen = new Set<string>();
        for (const mfg of manufacturers) {
          for (const model of models) {
            const key = `${mfg.toLowerCase()}|${model.toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            rows.push({ recallId: recall.id, manufacturer: mfg, model, notes: null });
          }
        }
      } else if (manufacturers.length) {
        const seen = new Set<string>();
        for (const mfg of manufacturers) {
          const key = mfg.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({ recallId: recall.id, manufacturer: mfg, model: null, notes: null });
        }
      } else if (models.length) {
        const seen = new Set<string>();
        for (const model of models) {
          const key = model.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({ recallId: recall.id, manufacturer: null, model, notes: null });
        }
      }

      if (rows.length) {
        await tx.recallProduct.createMany({ data: rows.slice(0, 200) });
      }
    });

    upserted++;
  }

  return { fetched: items.length, upserted };
}
