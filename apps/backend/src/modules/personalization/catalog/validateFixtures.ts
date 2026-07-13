// apps/backend/src/modules/personalization/catalog/validateFixtures.ts
//
// Golden-fixture "catalog lint" per docs/personalization/10-testing-strategy.md:
// "every active definition has positive, negative, unknown and suppression
// fixture." Walks the fixtures directory, validates each file's shape
// against fixtureTypes.ts's schema, and reports which CATALOG_PLAN codes are
// missing fixture coverage. Only ACTIVE definitions are treated as hard
// errors — DRAFT entries (all of them, today) are reported informationally
// so this can run in CI now without failing on a catalog that hasn't been
// authored yet.
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { CATALOG_PLAN } from './catalogPlan';
import { catalogFixtureSchema, FIXTURE_KINDS, FixtureKind } from './fixtureTypes';

export interface FixtureValidationError {
  file: string;
  message: string;
}

export interface DefinitionCoverage {
  code: string;
  status: string;
  presentKinds: FixtureKind[];
  missingKinds: FixtureKind[];
  /** True only when status is ACTIVE and coverage is incomplete — a real failure. */
  isHardFailure: boolean;
}

export interface CatalogFixtureReport {
  errors: FixtureValidationError[];
  coverage: DefinitionCoverage[];
}

/**
 * `fixturesDir` layout: `<fixturesDir>/<definitionCode>/<kind>.json`, one
 * file per FIXTURE_KINDS entry. Missing subdirectories just mean zero
 * coverage for that code (expected for every DRAFT entry today).
 */
export function validateCatalogFixtures(fixturesDir: string): CatalogFixtureReport {
  const errors: FixtureValidationError[] = [];
  const coverage: DefinitionCoverage[] = [];

  for (const entry of CATALOG_PLAN) {
    const codeDir = join(fixturesDir, entry.code);
    const presentKinds: FixtureKind[] = [];

    if (existsSync(codeDir)) {
      for (const kind of FIXTURE_KINDS) {
        const filePath = join(codeDir, `${kind}.json`);
        if (!existsSync(filePath)) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
        } catch (err) {
          errors.push({ file: filePath, message: `Invalid JSON: ${(err as Error).message}` });
          continue;
        }

        const result = catalogFixtureSchema.safeParse(parsed);
        if (!result.success) {
          errors.push({
            file: filePath,
            message: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          });
          continue;
        }

        if (result.data.definitionCode !== entry.code) {
          errors.push({
            file: filePath,
            message: `definitionCode "${result.data.definitionCode}" does not match directory code "${entry.code}"`,
          });
          continue;
        }

        if (result.data.kind !== kind) {
          errors.push({
            file: filePath,
            message: `kind "${result.data.kind}" does not match filename "${kind}.json"`,
          });
          continue;
        }

        presentKinds.push(kind);
      }
    }

    const missingKinds = FIXTURE_KINDS.filter((k) => !presentKinds.includes(k));

    coverage.push({
      code: entry.code,
      status: entry.status,
      presentKinds,
      missingKinds,
      isHardFailure: entry.status === 'ACTIVE' && missingKinds.length > 0,
    });
  }

  // Fixture directories that don't correspond to any planned code at all —
  // catches typos and stale fixtures for retired/renamed codes.
  if (existsSync(fixturesDir)) {
    const planCodes = new Set(CATALOG_PLAN.map((e) => e.code));
    for (const dirName of readdirSync(fixturesDir, { withFileTypes: true })) {
      if (dirName.isDirectory() && !planCodes.has(dirName.name)) {
        errors.push({
          file: join(fixturesDir, dirName.name),
          message: `Fixture directory does not match any code in CATALOG_PLAN`,
        });
      }
    }
  }

  return { errors, coverage };
}
