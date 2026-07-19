export const APP_CONFIG_KEYS = {
  disableEmailVerification: 'DISABLE_EMAIL_VERIFICATION',
  enforceHumanPolicyApprovals: 'ENFORCE_HUMAN_POLICY_APPROVALS',
} as const;

/**
 * Pilot-only email verification switch.
 *
 * This is deliberately backend-only and fail-closed: only the exact string
 * "true" disables verification. Missing, malformed, or differently-cased
 * values keep the verification requirement enabled.
 */
export function isEmailVerificationDisabled(): boolean {
  return process.env[APP_CONFIG_KEYS.disableEmailVerification] === 'true';
}

/**
 * Human policy attestations are advisory while the product has no real users.
 * Set the exact string "true" before admitting real users. Technical safety,
 * evidence, jurisdiction, disclosure, and verification schemas are unaffected.
 */
export function areHumanPolicyApprovalsEnforced(): boolean {
  return process.env[APP_CONFIG_KEYS.enforceHumanPolicyApprovals] === 'true';
}

export function humanPolicyGateAllows(
  approvalSatisfied: boolean,
  enforcementEnabled = areHumanPolicyApprovalsEnforced(),
): boolean {
  return approvalSatisfied || !enforcementEnabled;
}

export const APP_CONFIG = {
  get disableEmailVerification(): boolean {
    return isEmailVerificationDisabled();
  },
  get enforceHumanPolicyApprovals(): boolean {
    return areHumanPolicyApprovalsEnforced();
  },
} as const;
