// Decision preference capture/reuse/revocation — Ask Intelligence FRD §11,
// §7.5, §22.2. Split into pure message parsers + a pure snapshot diff (both
// unit-testable without a database) and DB-touching save/read/revoke
// functions, mirroring the hvacRepairReplaceEngine.service.ts split from
// Phase 8A.
//
// Household dependency (FRD §7.2, ADR-0001): OWNERSHIP_HORIZON is
// HOUSEHOLD-subject only. This module never creates a Household as a side
// effect -- that would route around the Personalization module's own
// owner-gated consent surface (apps/backend/src/modules/personalization/).
// If no Household exists yet, saveOwnershipHorizonPreference throws
// HouseholdProfileNotEnabledError and the caller (askOrchestrator) explains
// that rather than silently enabling it.

import { prisma } from '../../lib/prisma';
import { DECISION_PREFERENCE_DEFINITIONS } from './decisionPreferenceRegistry';
import type { HvacDecisionContext } from './hvacRepairReplaceEngine.service';
import { emitDecisionPreferenceChange } from './decisionPlatformChangeEmitter';
import type { DecisionPreferenceVisibility } from '../../productFramework/decisionPlatform/decisionPlatform.contract';

export class HouseholdProfileNotEnabledError extends Error {
  constructor() {
    super('The optional household profile is not enabled for this property, so a household-scoped preference cannot be saved.');
    this.name = 'HouseholdProfileNotEnabledError';
  }
}

export class PreferenceNotAuthorizedError extends Error {
  constructor() {
    super('Not authorized to change this preference.');
    this.name = 'PreferenceNotAuthorizedError';
  }
}

const PREFERENCE_CONSENT_POLICY_VERSION = '1.0';

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

// --- Pure message parsers (FRD §4.2: never silently infer a material
// preference -- both require an explicit save/remember verb alongside the
// substantive mention, so a casual aside is never captured as a command). ---

const SAVE_VERB_PATTERN = /\b(?:save|remember|keep track of|note that|record that)\b/i;

const SELL_TIMEFRAME_PATTERN = /\b(?:plan(?:s|ning)?\s+to\s+sell|selling|sell)\b.{0,40}\b(?:in\s+)?(?:about\s+)?(\d{1,3})\s*(month|year)s?\b/i;

export interface ParsedOwnershipHorizon {
  planToSell: true;
  horizonMonths: number;
}

export function parseOwnershipHorizonFromMessage(message: string): ParsedOwnershipHorizon | null {
  if (!SAVE_VERB_PATTERN.test(message)) return null;
  const match = message.match(SELL_TIMEFRAME_PATTERN);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const horizonMonths = unit.startsWith('year') ? amount * 12 : amount;
  if (!Number.isFinite(horizonMonths) || horizonMonths <= 0 || horizonMonths > 600) return null;
  return { planToSell: true, horizonMonths };
}

type RepairReplaceApproach = NonNullable<HvacDecisionContext['repairReplaceApproach']>;

const APPROACH_PATTERNS: Array<[RegExp, RepairReplaceApproach]> = [
  [/\bminimi[sz]e (?:the )?upfront cost\b|\blowest upfront cost\b|\bcheapest (?:option )?(?:right )?now\b/i, 'MINIMIZE_UPFRONT_COST'],
  [/\bminimi[sz]e (?:the )?long[- ]term cost\b|\bcheapest over time\b|\blowest total cost\b/i, 'MINIMIZE_LONG_TERM_COST'],
  [/\bmaximi[sz]e reliability\b|\bmost reliable\b|\bprioriti[sz]e reliability\b/i, 'MAXIMIZE_RELIABILITY'],
];

export interface ParsedRepairReplaceApproach {
  approach: RepairReplaceApproach;
}

export function parseRepairReplaceApproachFromMessage(message: string): ParsedRepairReplaceApproach | null {
  if (!SAVE_VERB_PATTERN.test(message)) return null;
  for (const [pattern, approach] of APPROACH_PATTERNS) {
    if (pattern.test(message)) return { approach };
  }
  return null;
}

// --- Pure snapshot diff (FRD §14.3) ---

export type RecommendationChangeCategory = 'MATERIAL' | 'CONFIDENCE_ONLY' | 'SYSTEM_METHOD_ONLY' | 'UNCHANGED';

export interface RecommendationChangeDiff {
  category: RecommendationChangeCategory;
  previousVerdict: string;
  currentVerdict: string;
  changedFactors: string[];
}

export interface ComparableSnapshot {
  verdictCode: string;
  reasonCodes: string[];
  confidenceBreakdown: unknown;
  engineVersion: string;
  contextContractVersion: string;
  preferenceReferenceIds: string[];
}

// FRD §14.3: identify what changed, whether it was material to the verdict
// or only confidence/ranking, and disclose a changed model/rule version
// without changed homeowner facts as a system-method change.
export function compareRecommendationSnapshots(
  previous: ComparableSnapshot,
  current: ComparableSnapshot,
  triggerReasonCodes: string[],
): RecommendationChangeDiff {
  const changedFactors: string[] = [];
  if (JSON.stringify([...previous.preferenceReferenceIds].sort()) !== JSON.stringify([...current.preferenceReferenceIds].sort())) {
    changedFactors.push('PREFERENCE');
  }
  if (previous.engineVersion !== current.engineVersion) changedFactors.push('ENGINE_VERSION');
  if (previous.contextContractVersion !== current.contextContractVersion) changedFactors.push('CONTEXT_CONTRACT_VERSION');
  if (triggerReasonCodes.length > 0) changedFactors.push('CANONICAL_FACT');

  const verdictChanged = previous.verdictCode !== current.verdictCode;
  const reasonsChanged = JSON.stringify(previous.reasonCodes) !== JSON.stringify(current.reasonCodes);
  const confidenceChanged = JSON.stringify(previous.confidenceBreakdown) !== JSON.stringify(current.confidenceBreakdown);

  let category: RecommendationChangeCategory;
  if (verdictChanged) category = 'MATERIAL';
  else if (reasonsChanged || confidenceChanged) category = 'CONFIDENCE_ONLY';
  else if (changedFactors.includes('ENGINE_VERSION') || changedFactors.includes('CONTEXT_CONTRACT_VERSION')) category = 'SYSTEM_METHOD_ONLY';
  else category = 'UNCHANGED';

  return { category, previousVerdict: previous.verdictCode, currentVerdict: current.verdictCode, changedFactors };
}

// --- DB-touching read/write/revoke ---

export interface ActiveHvacPreferences {
  ownershipHorizonMonths: number | null;
  ownershipHorizonPreferenceId: string | null;
  ownershipHorizonVisibility: DecisionPreferenceVisibility | null;
  ownershipHorizonConfirmedAt: Date | null;
  ownershipHorizonExpiresAt: Date | null;
  repairReplaceApproach: HvacDecisionContext['repairReplaceApproach'];
  repairReplaceApproachPreferenceId: string | null;
  repairReplaceApproachVisibility: DecisionPreferenceVisibility | null;
  repairReplaceApproachConfirmedAt: Date | null;
  repairReplaceApproachExpiresAt: Date | null;
}

export interface PreferenceReferenceDetail {
  preferenceValueId: string;
  definitionId: string;
  summary: string;
  visibility: DecisionPreferenceVisibility;
  confirmedAt: Date | null;
  expiresAt: Date | null;
}

// FRD §11.4/§14: PREFERENCE_REFERENCE must disclose what a *specific,
// already-generated* recommendation was actually based on, not a fresh
// "what's active right now" read. Those can diverge -- a different
// household member viewing the same thread, or the preference having
// changed since this snapshot was generated but not yet triggered a
// recompute. RecommendationSnapshot.preferenceReferenceIds is the
// authoritative lineage record (FRD §14.1 reproducibility), so callers
// building a disclosure block for an existing snapshot must look the
// referenced values up by id here, not call getActiveHvacPreferences again.
export async function getPreferenceReferenceDetails(preferenceValueIds: string[]): Promise<PreferenceReferenceDetail[]> {
  if (!preferenceValueIds.length) return [];
  const rows = await prisma.decisionPreferenceValue.findMany({ where: { id: { in: preferenceValueIds } } });
  return rows.map((row) => {
    const value = row.valueJson as { horizonMonths?: number; approach?: RepairReplaceApproach } | null;
    const summary = row.definitionId === 'OWNERSHIP_HORIZON'
      ? `Using your confirmed plan to sell in about ${value?.horizonMonths ?? '—'} months.`
      : row.definitionId === 'REPAIR_REPLACE_APPROACH'
        ? `Using your confirmed approach: ${(value?.approach ?? '').replace(/_/g, ' ').toLowerCase()}.`
        : 'Using a confirmed preference.';
    return {
      preferenceValueId: row.id,
      definitionId: row.definitionId,
      summary,
      visibility: row.visibility,
      confirmedAt: row.lastConfirmedAt,
      expiresAt: row.expiresAt,
    };
  });
}

// FRD §22.2 zero-tolerance gate ("unconfirmed preference affecting a
// material result"): the ACTIVE + non-expired filter here is the structural
// enforcement -- this is the only read path the HVAC engine's callers use.
//
// Household lookup is scoped by property only, NOT by ownerUserId: this is
// a read of an already-confirmed household preference, and FRD §7.4 expects
// any authorized household member to benefit from it ("a confirmed
// household plan affected this ranking") even though only the OWNER could
// have created it (see saveOwnershipHorizonPreference's ownerUserId-scoped
// lookup below, and §7.2: "OWNER may... manage shared sensitive
// preferences"). Property-level authorization already gated who can reach
// this function at all (executeOperationCore's role-floor check runs before
// any HVAC operation body executes).
export async function getActiveHvacPreferences(propertyId: string, userId: string): Promise<ActiveHvacPreferences> {
  const now = new Date();
  const household = await prisma.household.findFirst({
    where: { properties: { some: { propertyId, effectiveTo: null } } },
    select: { id: true },
  });

  const [ownershipRows, approachRow] = await Promise.all([
    household
      ? prisma.decisionPreferenceValue.findMany({
        where: {
          definitionId: 'OWNERSHIP_HORIZON', subjectType: 'HOUSEHOLD', subjectId: household.id,
          status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          AND: [{ OR: [{ propertyId }, { propertyId: null }] }],
        },
        orderBy: { createdAt: 'desc' },
      })
      : Promise.resolve([]),
    prisma.decisionPreferenceValue.findFirst({
      where: {
        definitionId: 'REPAIR_REPLACE_APPROACH', subjectType: 'USER', subjectId: userId, propertyId,
        status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  // Property-specific override wins over the household-wide default (FRD
  // §11.2: OWNERSHIP_HORIZON scope is "Household plus property override").
  const ownershipRow = ownershipRows.find((row) => row.propertyId === propertyId) ?? ownershipRows.find((row) => row.propertyId === null) ?? null;

  const ownershipValue = ownershipRow?.valueJson as { horizonMonths?: number } | null;
  const approachValue = approachRow?.valueJson as { approach?: RepairReplaceApproach } | null;

  return {
    ownershipHorizonMonths: typeof ownershipValue?.horizonMonths === 'number' ? ownershipValue.horizonMonths : null,
    ownershipHorizonPreferenceId: ownershipRow?.id ?? null,
    ownershipHorizonVisibility: ownershipRow?.visibility ?? null,
    ownershipHorizonConfirmedAt: ownershipRow?.lastConfirmedAt ?? null,
    ownershipHorizonExpiresAt: ownershipRow?.expiresAt ?? null,
    repairReplaceApproach: approachValue?.approach ?? null,
    repairReplaceApproachPreferenceId: approachRow?.id ?? null,
    repairReplaceApproachVisibility: approachRow?.visibility ?? null,
    repairReplaceApproachConfirmedAt: approachRow?.lastConfirmedAt ?? null,
    repairReplaceApproachExpiresAt: approachRow?.expiresAt ?? null,
  };
}

// Unlike getActiveHvacPreferences above, this lookup IS scoped by
// ownerUserId -- OWNERSHIP_HORIZON is sensitivityClass SENSITIVE, and FRD
// §7.2 restricts creating/managing a shared sensitive household preference
// to the OWNER role. A CONTRIBUTOR asking Ask to save this plan will
// correctly get HouseholdProfileNotEnabledError (there's no household row
// this contributor owns), not a silent write to someone else's household.
export async function saveOwnershipHorizonPreference(
  propertyId: string, userId: string, input: ParsedOwnershipHorizon,
): Promise<{ preferenceValueId: string }> {
  const household = await prisma.household.findFirst({
    where: { ownerUserId: userId, properties: { some: { propertyId, effectiveTo: null } } },
    select: { id: true },
  });
  if (!household) throw new HouseholdProfileNotEnabledError();
  const definition = DECISION_PREFERENCE_DEFINITIONS.OWNERSHIP_HORIZON;

  const result = await prisma.$transaction(async (tx) => {
    const previous = await tx.decisionPreferenceValue.findFirst({
      where: { definitionId: 'OWNERSHIP_HORIZON', subjectType: 'HOUSEHOLD', subjectId: household.id, propertyId: null, status: 'ACTIVE' },
    });
    if (previous) {
      await tx.decisionPreferenceValue.update({ where: { id: previous.id }, data: { status: 'SUPERSEDED', version: { increment: 1 } } });
    }
    const now = new Date();
    const created = await tx.decisionPreferenceValue.create({
      data: {
        definitionId: 'OWNERSHIP_HORIZON', subjectType: 'HOUSEHOLD', subjectId: household.id, propertyId: null,
        valueJson: { planToSell: true, horizonMonths: input.horizonMonths, confirmedPlanDate: null },
        provenanceType: 'USER_ENTERED', storageClass: definition.storageClass,
        assertedByUserId: userId, visibility: definition.defaultVisibility,
        purposeCode: 'HVAC_REPAIR_REPLACE', consentPolicyVersion: PREFERENCE_CONSENT_POLICY_VERSION,
        consentedAt: now, lastConfirmedAt: now, validFrom: now,
        expiresAt: definition.defaultValidityMonths ? addMonths(now, definition.defaultValidityMonths) : null,
        status: 'ACTIVE', supersedesId: previous?.id ?? null,
      },
    });
    await emitDecisionPreferenceChange({
      propertyId: null, definitionId: 'OWNERSHIP_HORIZON', subjectType: 'HOUSEHOLD', subjectId: household.id,
      preferenceValueId: created.id, action: previous ? 'SAVED_REVISED' : 'SAVED_NEW',
    }, tx);
    return { preferenceValueId: created.id, isNew: !previous };
  });

  // propertyId: null here -- OWNERSHIP_HORIZON is household-wide (see
  // decisionPlatformChangeEmitter.ts's guard), so this is a documented no-op
  // today, not silently skipped logic.
  return { preferenceValueId: result.preferenceValueId };
}

export async function saveRepairReplaceApproachPreference(
  propertyId: string, userId: string, input: ParsedRepairReplaceApproach,
): Promise<{ preferenceValueId: string }> {
  const definition = DECISION_PREFERENCE_DEFINITIONS.REPAIR_REPLACE_APPROACH;

  const result = await prisma.$transaction(async (tx) => {
    const previous = await tx.decisionPreferenceValue.findFirst({
      where: { definitionId: 'REPAIR_REPLACE_APPROACH', subjectType: 'USER', subjectId: userId, propertyId, status: 'ACTIVE' },
    });
    if (previous) {
      await tx.decisionPreferenceValue.update({ where: { id: previous.id }, data: { status: 'SUPERSEDED', version: { increment: 1 } } });
    }
    const now = new Date();
    const created = await tx.decisionPreferenceValue.create({
      data: {
        definitionId: 'REPAIR_REPLACE_APPROACH', subjectType: 'USER', subjectId: userId, propertyId,
        valueJson: { approach: input.approach },
        provenanceType: 'USER_ENTERED', storageClass: definition.storageClass,
        assertedByUserId: userId, visibility: definition.defaultVisibility,
        purposeCode: 'HVAC_REPAIR_REPLACE', consentPolicyVersion: PREFERENCE_CONSENT_POLICY_VERSION,
        consentedAt: now, lastConfirmedAt: now, validFrom: now,
        expiresAt: definition.defaultValidityMonths ? addMonths(now, definition.defaultValidityMonths) : null,
        status: 'ACTIVE', supersedesId: previous?.id ?? null,
      },
    });
    await emitDecisionPreferenceChange({
      propertyId, definitionId: 'REPAIR_REPLACE_APPROACH', subjectType: 'USER', subjectId: userId,
      preferenceValueId: created.id, action: previous ? 'SAVED_REVISED' : 'SAVED_NEW',
    }, tx);
    return { preferenceValueId: created.id, isNew: !previous };
  });

  return { preferenceValueId: result.preferenceValueId };
}

// FRD §7.5: "revocation prevents all future use before the API returns
// success" -- status flips to REVOKED inside this transaction, and
// getActiveHvacPreferences's ACTIVE-only filter means no read after commit
// can observe the old value. Returns the threads that referenced this value
// so the caller (askOrchestrator, to avoid a circular import with
// decisionThreadService) can mark them stale.
export async function revokeHvacPreference(preferenceValueId: string, userId: string): Promise<{ affectedThreadIds: string[] }> {
  const result = await prisma.$transaction(async (tx) => {
    const value = await tx.decisionPreferenceValue.findUnique({ where: { id: preferenceValueId } });
    if (!value || value.status !== 'ACTIVE') return { affectedThreadIds: [], revoked: null };

    if (value.subjectType === 'USER') {
      if (value.subjectId !== userId) throw new PreferenceNotAuthorizedError();
    } else {
      const household = await tx.household.findFirst({ where: { id: value.subjectId, ownerUserId: userId } });
      if (!household) throw new PreferenceNotAuthorizedError();
    }

    await tx.decisionPreferenceValue.update({ where: { id: value.id }, data: { status: 'REVOKED', version: { increment: 1 } } });
    const references = await tx.decisionThreadPreferenceReference.findMany({
      where: { preferenceValueId: value.id }, select: { decisionThreadId: true },
    });
    await emitDecisionPreferenceChange({
      propertyId: value.propertyId, definitionId: value.definitionId,
      subjectType: value.subjectType, subjectId: value.subjectId,
      preferenceValueId: value.id, action: 'REVOKED',
    }, tx);
    return {
      affectedThreadIds: [...new Set(references.map((reference) => reference.decisionThreadId))],
      revoked: value,
    };
  });

  return { affectedThreadIds: result.affectedThreadIds };
}
