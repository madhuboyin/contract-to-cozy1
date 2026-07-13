// apps/backend/src/modules/personalization/infrastructure/consentRepository.ts
//
// Reads/writes Household.consentVersion/consentedAt — fields that existed
// since Phase 1 step 1 but nothing set or checked until this file. Gates
// writes to the sensitive composition tables (PER-PRIV-002: "record purpose/
// versioned consent and allow correction, override, export, reset,
// deletion").
import { prisma } from '../../../lib/prisma';

export interface HouseholdConsent {
  consentVersion: string | null;
  consentedAt: Date | null;
}

export async function getHouseholdConsent(householdId: string): Promise<HouseholdConsent | null> {
  return prisma.household.findUnique({
    where: { id: householdId },
    select: { consentVersion: true, consentedAt: true },
  });
}

export async function setHouseholdConsent(householdId: string, consentVersion: string): Promise<void> {
  await prisma.household.update({
    where: { id: householdId },
    data: { consentVersion, consentedAt: new Date() },
  });
}

/**
 * Blocks future sensitive writes (recordProfileAnswer.usecase.ts checks
 * consentVersion is set before writing) but does not retroactively erase
 * already-collected composition data — that's the separate, not-yet-built
 * personalization reset job.
 */
export async function withdrawHouseholdConsent(householdId: string): Promise<void> {
  await prisma.household.update({
    where: { id: householdId },
    data: { consentVersion: null, consentedAt: null },
  });
}
