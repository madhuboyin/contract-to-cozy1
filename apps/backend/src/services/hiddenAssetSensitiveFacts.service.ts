// apps/backend/src/services/hiddenAssetSensitiveFacts.service.ts
//
// Consent-gated capture of sensitive eligibility facts (audit section 9.6:
// income, disability, age, veteran status, tax filing status, household
// composition, hardship, immigration/other program-specific attributes) for
// a single, named PropertyHiddenAssetMatch. This is DoD #9 ("sensitive facts
// are purpose-bound and consented").
//
// Design constraints this service enforces:
// - request only for a named opportunity: every row is scoped to one matchId,
//   never captured broadly or attached to the property/homeowner generally.
// - explain why: `purpose` is required and names the specific program.
// - optional until needed: nothing here is ever required to view a match;
//   only unlocks confidence on the ONE program that asked.
// - capture consent and purpose: consentedAt/consentVersion are stamped only
//   on an explicit PROVIDED answer, never inferred.
// - minimize retention / allow correction and deletion: deleteSensitiveFact
//   is a real hard delete, not a soft-delete flag. recordSensitiveFact
//   overwrites (corrects) any prior answer for the same (matchId, factKey).
// - avoid broad analytics payloads: this file never calls analyticsEmitter.
// - never infer a sensitive status from unrelated data: values only ever
//   come from an explicit homeowner-submitted answer — see
//   ruleEngine.ts's resolveSensitiveAttribute, which returns "missing" for
//   every sensitive attribute unless an overlay built from PROVIDED rows
//   here is explicitly passed in.

import {
  HiddenAssetSensitiveFactKey,
  HiddenAssetSensitiveFactStatus,
  PropertyHiddenAssetMatchStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import {
  buildPropertyAttributeMap,
  evaluateProgram,
  isSensitiveAttribute,
  resolveSensitiveAttributeKey,
} from './hiddenAssets/ruleEngine';
import { SensitiveAttributeMap } from './hiddenAssets/types';

export class SensitiveFactConsentError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SensitiveFactConsentError';
  }
}

// HiddenAssetSensitiveFactKey enum value -> SensitiveAttributeMap key.
// OTHER has no dedicated overlay slot — it's a record-only bucket for a
// program-specific attribute that doesn't fit the named categories; it is
// captured (for consent/audit purposes) but never feeds rule evaluation.
const FACT_KEY_TO_ATTRIBUTE: Partial<Record<HiddenAssetSensitiveFactKey, keyof SensitiveAttributeMap>> = {
  INCOME: 'income',
  DISABILITY: 'disability',
  AGE: 'age',
  VETERAN_STATUS: 'veteranStatus',
  TAX_FILING_STATUS: 'taxFilingStatus',
  HOUSEHOLD_COMPOSITION: 'householdComposition',
  HARDSHIP_STATUS: 'hardshipStatus',
  IMMIGRATION_STATUS: 'immigrationStatus',
};

const PURPOSE_TEMPLATES: Record<HiddenAssetSensitiveFactKey, string> = {
  INCOME: 'eligibility for {program} depends on household income',
  DISABILITY: 'eligibility for {program} depends on disability status',
  AGE: 'eligibility for {program} depends on your age',
  VETERAN_STATUS: 'eligibility for {program} depends on veteran status',
  TAX_FILING_STATUS: 'eligibility for {program} depends on how you file taxes',
  HOUSEHOLD_COMPOSITION: 'eligibility for {program} depends on your household composition',
  HARDSHIP_STATUS: 'eligibility for {program} depends on financial hardship related to your mortgage or utility bills',
  IMMIGRATION_STATUS: 'eligibility for {program} depends on immigration or citizenship status',
  OTHER: '{program} asks for a detail specific to that program',
};

function buildPurpose(factKey: HiddenAssetSensitiveFactKey, programName: string): string {
  const template = PURPOSE_TEMPLATES[factKey];
  return `We're only asking because ${template.replace('{program}', programName)}. This is never used for any other program and is never shared.`;
}

async function assertMatchForUser(matchId: string, userId: string) {
  const match = await prisma.propertyHiddenAssetMatch.findFirst({
    where: { id: matchId, property: { homeownerProfile: { userId } } },
    include: { program: { include: { rules: true } }, property: true },
  });
  if (!match) throw new Error('Match not found or access denied.');
  return match;
}

/**
 * Which sensitive fact keys this match's program actually references,
 * deduped, in rule sortOrder. Programs that reference no sensitive
 * attribute return an empty array — most programs never touch this at all.
 */
function relevantFactKeysForProgram(rules: Array<{ attribute: string; sortOrder: number }>): HiddenAssetSensitiveFactKey[] {
  const attributeKeyToFactKey = new Map<keyof SensitiveAttributeMap, HiddenAssetSensitiveFactKey>();
  for (const [factKey, attrKey] of Object.entries(FACT_KEY_TO_ATTRIBUTE) as Array<
    [HiddenAssetSensitiveFactKey, keyof SensitiveAttributeMap | undefined]
  >) {
    if (attrKey) attributeKeyToFactKey.set(attrKey, factKey);
  }

  const seen = new Set<HiddenAssetSensitiveFactKey>();
  const ordered = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);
  const result: HiddenAssetSensitiveFactKey[] = [];
  for (const rule of ordered) {
    if (!isSensitiveAttribute(rule.attribute)) continue;
    const attrKey = resolveSensitiveAttributeKey(rule.attribute);
    const factKey = attrKey ? attributeKeyToFactKey.get(attrKey) : undefined;
    if (factKey && !seen.has(factKey)) {
      seen.add(factKey);
      result.push(factKey);
    }
  }
  return result;
}

export interface SensitiveFactStatusDTO {
  factKey: HiddenAssetSensitiveFactKey;
  status: HiddenAssetSensitiveFactStatus;
  purpose: string;
  consentedAt: string | null;
  respondedAt: string | null;
}

/**
 * Returns the sensitive facts relevant to this match's program (empty for
 * the vast majority of matches), each with its current status and the
 * homeowner-facing "why" copy. Never returns the captured value itself —
 * this endpoint is for status/consent display, not for reading the value
 * back.
 */
export async function getSensitiveFactStatusForMatch(
  matchId: string,
  userId: string,
): Promise<SensitiveFactStatusDTO[]> {
  const match = await assertMatchForUser(matchId, userId);
  const relevantKeys = relevantFactKeysForProgram(match.program.rules);
  if (relevantKeys.length === 0) return [];

  const existing = await prisma.propertyHiddenAssetSensitiveFact.findMany({
    where: { matchId, factKey: { in: relevantKeys } },
  });
  const existingByKey = new Map(existing.map((row) => [row.factKey, row]));

  return relevantKeys.map((factKey) => {
    const row = existingByKey.get(factKey);
    return {
      factKey,
      status: row?.status ?? HiddenAssetSensitiveFactStatus.REQUESTED,
      purpose: row?.purpose ?? buildPurpose(factKey, match.program.name),
      consentedAt: row?.consentedAt ? row.consentedAt.toISOString() : null,
      respondedAt: row?.respondedAt ? row.respondedAt.toISOString() : null,
    };
  });
}

async function reEvaluateMatchWithOverlay(
  matchId: string,
  userId: string,
): Promise<void> {
  const match = await assertMatchForUser(matchId, userId);

  const providedFacts = await prisma.propertyHiddenAssetSensitiveFact.findMany({
    where: { matchId, status: HiddenAssetSensitiveFactStatus.PROVIDED },
  });

  const overlay: SensitiveAttributeMap = {
    income: null,
    disability: null,
    age: null,
    veteranStatus: null,
    taxFilingStatus: null,
    householdComposition: null,
    hardshipStatus: null,
    immigrationStatus: null,
  };
  for (const fact of providedFacts) {
    const attrKey = FACT_KEY_TO_ATTRIBUTE[fact.factKey];
    if (!attrKey) continue;
    const rawValue = (fact.valueJson as Record<string, unknown> | null)?.value ?? null;
    (overlay as unknown as Record<string, unknown>)[attrKey] = rawValue;
  }

  const attrs = buildPropertyAttributeMap(match.property);
  const result = evaluateProgram(
    attrs,
    {
      id: match.program.id,
      benefitEstimateMin: match.program.benefitEstimateMin ? Number(match.program.benefitEstimateMin) : null,
      benefitEstimateMax: match.program.benefitEstimateMax ? Number(match.program.benefitEstimateMax) : null,
      rules: match.program.rules,
    },
    { category: match.program.category, lastVerifiedAt: match.program.lastVerifiedAt },
    overlay,
  );

  const evaluatedAt = new Date();
  if (!result.matched || result.confidenceLevel === null) {
    // Preserve the row and criterion history, but fail closed: once an
    // explicit answer makes a mandatory criterion fail or a disqualifier
    // match, the prior positive match must no longer remain actionable.
    await prisma.$transaction(async (tx) => {
      await tx.propertyHiddenAssetMatch.update({
        where: { id: matchId },
        data: {
          status: PropertyHiddenAssetMatchStatus.INACTIVE,
          matchedRuleCount: result.matchedRuleCount,
          totalRuleCount: result.totalRuleCount,
          matchReasons: result.matchReasons,
          lastEvaluatedAt: evaluatedAt,
          programVersionAtMatch: match.program.version,
        },
      });
      await tx.propertyHiddenAssetCriterionResult.deleteMany({ where: { matchId } });
      if (result.criterionResults.length > 0) {
        await tx.propertyHiddenAssetCriterionResult.createMany({
          data: result.criterionResults.map((criterion) => ({
            matchId,
            ruleId: criterion.ruleId,
            result: criterion.result,
            explanation: criterion.explanation,
            evaluatedAt,
          })),
        });
      }
    });
    logger.info(
      `[HiddenAssetSensitiveFacts] Re-evaluation for match ${matchId} no longer resolves to a match; marked inactive.`,
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.propertyHiddenAssetMatch.update({
      where: { id: matchId },
      data: {
        confidenceLevel: result.confidenceLevel!,
        matchedRuleCount: result.matchedRuleCount,
        totalRuleCount: result.totalRuleCount,
        matchReasons: result.matchReasons,
        lastEvaluatedAt: evaluatedAt,
        programVersionAtMatch: match.program.version,
        ...(match.status === PropertyHiddenAssetMatchStatus.INACTIVE
          ? { status: PropertyHiddenAssetMatchStatus.DETECTED }
          : {}),
      },
    });
    await tx.propertyHiddenAssetCriterionResult.deleteMany({ where: { matchId } });
    if (result.criterionResults.length > 0) {
      await tx.propertyHiddenAssetCriterionResult.createMany({
        data: result.criterionResults.map((criterion) => ({
          matchId,
          ruleId: criterion.ruleId,
          result: criterion.result,
          explanation: criterion.explanation,
          evaluatedAt,
        })),
      });
    }
  });
}

export interface RecordSensitiveFactInput {
  factKey: HiddenAssetSensitiveFactKey;
  value: string | number | boolean;
  consented: true;
  consentVersion?: string;
}

/**
 * Records a consented, purpose-bound answer and immediately re-evaluates
 * this one match so its confidence reflects the newly-known fact. Overwrites
 * (corrects) any prior answer for this (matchId, factKey) pair.
 */
export async function recordSensitiveFact(
  matchId: string,
  userId: string,
  input: RecordSensitiveFactInput,
): Promise<SensitiveFactStatusDTO> {
  if (!input.consented) {
    throw new SensitiveFactConsentError('CONSENT_REQUIRED', 'Explicit consent is required to record a sensitive fact.');
  }
  const match = await assertMatchForUser(matchId, userId);
  const relevantKeys = relevantFactKeysForProgram(match.program.rules);
  if (!relevantKeys.includes(input.factKey)) {
    throw new SensitiveFactConsentError(
      'NOT_REQUESTED',
      'This match does not request that fact — sensitive facts can only be provided for a program that actually asks for them.',
    );
  }

  const now = new Date();
  const purpose = buildPurpose(input.factKey, match.program.name);

  await prisma.propertyHiddenAssetSensitiveFact.upsert({
    where: { matchId_factKey: { matchId, factKey: input.factKey } },
    update: {
      status: HiddenAssetSensitiveFactStatus.PROVIDED,
      valueJson: { value: input.value },
      purpose,
      consentedAt: now,
      consentVersion: input.consentVersion ?? null,
      respondedAt: now,
      respondedBy: userId,
    },
    create: {
      matchId,
      factKey: input.factKey,
      status: HiddenAssetSensitiveFactStatus.PROVIDED,
      valueJson: { value: input.value },
      purpose,
      consentedAt: now,
      consentVersion: input.consentVersion ?? null,
      requestedBy: 'SYSTEM',
      respondedAt: now,
      respondedBy: userId,
    },
  });

  await reEvaluateMatchWithOverlay(matchId, userId);

  return {
    factKey: input.factKey,
    status: HiddenAssetSensitiveFactStatus.PROVIDED,
    purpose,
    consentedAt: now.toISOString(),
    respondedAt: now.toISOString(),
  };
}

/**
 * Records that the homeowner was asked and chose not to answer. No value is
 * ever stored for a decline.
 */
export async function declineSensitiveFact(
  matchId: string,
  userId: string,
  factKey: HiddenAssetSensitiveFactKey,
): Promise<SensitiveFactStatusDTO> {
  const match = await assertMatchForUser(matchId, userId);
  const relevantKeys = relevantFactKeysForProgram(match.program.rules);
  if (!relevantKeys.includes(factKey)) {
    throw new SensitiveFactConsentError('NOT_REQUESTED', 'This match does not request that fact.');
  }

  const now = new Date();
  const purpose = buildPurpose(factKey, match.program.name);

  await prisma.propertyHiddenAssetSensitiveFact.upsert({
    where: { matchId_factKey: { matchId, factKey } },
    update: {
      status: HiddenAssetSensitiveFactStatus.DECLINED,
      valueJson: undefined,
      purpose,
      consentedAt: null,
      consentVersion: null,
      respondedAt: now,
      respondedBy: userId,
    },
    create: {
      matchId,
      factKey,
      status: HiddenAssetSensitiveFactStatus.DECLINED,
      purpose,
      requestedBy: 'SYSTEM',
      respondedAt: now,
      respondedBy: userId,
    },
  });

  await reEvaluateMatchWithOverlay(matchId, userId);

  return { factKey, status: HiddenAssetSensitiveFactStatus.DECLINED, purpose, consentedAt: null, respondedAt: now.toISOString() };
}

/**
 * Hard-deletes a previously provided/declined sensitive fact — real
 * retention minimization, not a soft-delete flag. Then re-evaluates the
 * match so its confidence reverts to treating the fact as unknown again.
 */
export async function deleteSensitiveFact(
  matchId: string,
  userId: string,
  factKey: HiddenAssetSensitiveFactKey,
): Promise<void> {
  await assertMatchForUser(matchId, userId);

  await prisma.propertyHiddenAssetSensitiveFact.deleteMany({
    where: { matchId, factKey },
  });

  await reEvaluateMatchWithOverlay(matchId, userId);
}
