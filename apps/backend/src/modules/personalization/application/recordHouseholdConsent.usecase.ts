// apps/backend/src/modules/personalization/application/recordHouseholdConsent.usecase.ts
//
// Thin wrappers over consentRepository.ts, kept as use cases (not called
// directly from infrastructure) for the same testability/layering reasons
// as every other use case in this module.
import { setHouseholdConsent, withdrawHouseholdConsent as withdrawConsent } from '../infrastructure/consentRepository';

export async function recordHouseholdConsent(householdId: string, consentVersion: string): Promise<void> {
  await setHouseholdConsent(householdId, consentVersion);
}

export async function withdrawHouseholdConsent(householdId: string): Promise<void> {
  await withdrawConsent(householdId);
}
