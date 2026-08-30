export const AGENT_DEFINITION_DIGEST_BASELINE: Readonly<Record<string, string>> = Object.freeze({
  // Filled from the canonical behavior-bearing definition. Changing this value under
  // the same agent/version is prohibited; add a semantic version instead.
  // Regenerated in PR 11 (IPD-005): 1.0.0 finalized DEV -> ENABLED before it
  // had shipped to any environment or user.
  'hvac-repair-replace-specialist@1.0.0': 'be4e9d0cdfe501aa55b3d473a558a9d40b9a881c29cf40b03da66f13bd1fb2aa',
  // Phase 4A: profile-selected HVAC + GENERIC_APPLIANCE shared loop.
  'hvac-repair-replace-specialist@1.1.0': '0ea576a2635b5b1446079173b4c5f434568ffc2e9daa5c22ff325bc2246ce3eb',
  // Phase 2 audit: corrected evaluation contract and explicit CI gate.
  'hvac-repair-replace-specialist@1.2.0': 'f4b71fd75489107102e16daf3dd3778e1ae540241ed8e6c63d055fc9cec78228',
});
