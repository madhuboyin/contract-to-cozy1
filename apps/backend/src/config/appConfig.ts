export const APP_CONFIG_KEYS = {
  disableEmailVerification: 'DISABLE_EMAIL_VERIFICATION',
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

export const APP_CONFIG = {
  get disableEmailVerification(): boolean {
    return isEmailVerificationDisabled();
  },
} as const;
