// apps/workers/src/jobs/ingestRecalls.job.ts
import { prisma } from '../lib/prisma';
import { fetchCpscRecalls } from '../recalls/cpsc.client';

function deriveSeverity(hazard?: string, summary?: string) {
  const t = `${hazard || ''} ${summary || ''}`.toLowerCase();
  if (t.includes('death') || t.includes('fatal')) return 'CRITICAL';
  if (t.includes('fire') || t.includes('burn') || t.includes('electrocution') || t.includes('injury'))
    return 'HIGH';
  if (t.includes('shock') || t.includes('choking') || t.includes('laceration')) return 'MEDIUM';
  return 'UNKNOWN';
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
  // keep it simple; avoid over-normalizing brand names
  return raw.replace(/\s+/g, ' ').trim();
}

function normalizeModel(raw: string): string {
  // models are often uppercase-ish; keep original but normalize whitespace
  return raw.replace(/\s+/g, ' ').trim();
}

function unique<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

export async function ingestRecallsJob() {
  const items = await fetchCpscRecalls();

  let upserted = 0;

  for (const item of items) {
    const now = new Date();

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
        lastSeenAt: now,
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
        lastSeenAt: now,
      },
    });

    // Derived table strategy (safe + simple): rebuild RecallProduct for this recall
    await prisma.recallProduct.deleteMany({ where: { recallId: recall.id } });

    // -----------------------------
    // ✅ Build RecallProduct rows safely
    // -----------------------------
    const manufacturers = unique(
      (item.manufacturers ?? [])
        .flatMap((m) => splitTokens(cleanStr(m) ?? ''))
        .map((m) => normalizeManufacturer(m))
        .filter(Boolean)
    );

    const models = unique(
      (item.models ?? [])
        .flatMap((m) => splitTokens(cleanStr(m) ?? ''))
        .map((m) => normalizeModel(m))
        .filter(Boolean)
        // avoid garbage like single-character tokens
        .filter((m) => m.length >= 3)
    );

    // We will create:
    // - manufacturer+model combos when both exist
    // - manufacturer-only rows when only manufacturers exist
    // - model-only rows when only models exist
    // But NEVER create a row where both are null.
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
          rows.push({
            recallId: recall.id,
            manufacturer: mfg,
            model,
            notes: null,
          });
        }
      }
    } else if (manufacturers.length) {
      const seen = new Set<string>();
      for (const mfg of manufacturers) {
        const key = mfg.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          recallId: recall.id,
          manufacturer: mfg,
          model: null,
          notes: null,
        });
      }
    } else if (models.length) {
      const seen = new Set<string>();
      for (const model of models) {
        const key = model.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          recallId: recall.id,
          manufacturer: null,
          model,
          notes: null,
        });
      }
    }

    // ✅ Guard: if we have no usable identifiers, create no RecallProduct rows.
    // (This prevents the empty-row junk you observed.)
    if (rows.length) {
      // Optional safety limit to prevent huge inserts if parsing goes wild
      const limited = rows.slice(0, 200);
      await prisma.recallProduct.createMany({ data: limited });
    }

    upserted++;
  }

  return { fetched: items.length, upserted };
}
