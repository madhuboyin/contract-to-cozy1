export type HomeownerOperatingMode = 'PURCHASE' | 'OWNERSHIP' | 'EXPLORATION';

export type EntryContextPolicyInput = {
  entryPath?: string | null;
  ownershipState?: string | null;
};

export function resolveHomeownerOperatingMode(input: EntryContextPolicyInput): HomeownerOperatingMode {
  if (input.entryPath === 'EXPLORATION' || input.ownershipState === 'SHOPPING') return 'EXPLORATION';
  if (input.entryPath === 'EXISTING_HOME_PURCHASE' ||
    input.ownershipState === 'UNDER_CONTRACT') return 'PURCHASE';
  if (input.ownershipState === 'RECENT_OWNER' ||
    input.ownershipState === 'ESTABLISHED_OWNER' ||
    input.ownershipState === 'PREPARING_TRANSFER' ||
    input.entryPath === 'EXISTING_OWNER_TRIGGER' ||
    input.entryPath === 'NEW_HOME_SETUP' ||
    input.entryPath === 'MAJOR_MOMENT') return 'OWNERSHIP';

  return 'OWNERSHIP';
}

export function supportsOwnershipCare(input: EntryContextPolicyInput): boolean {
  return resolveHomeownerOperatingMode(input) === 'OWNERSHIP';
}
